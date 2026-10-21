// SPDX-License-Identifier: AGPL-3.0-only
//! Detector de ferramentas (orquestrador v0.2, parte B). Só comandos públicos dos CLIs:
//! `--version` e o status de login. Nunca abre arquivos de credencial nem chaveiro.
//! O snapshot sai sem diretórios, contas ou tokens; o Worker valida o esquema de novo.
use crate::drivers::{self, Driver};
use serde_json::{json, Value};

const PAID: [&str; 3] = ["api_key", "api_key_helper", "third_party"];
const KNOWN: [&str; 9] = ["claude.ai", "oauth_token", "chatgpt", "google", "api_key", "api_key_helper", "third_party", "none", "unknown"];

pub fn parse_version(text: &str) -> Option<String> {
    text.split(|c: char| c.is_whitespace() || c == '(' || c == ')')
        .map(|t| t.trim_start_matches('v'))
        .find(|t| {
            let core = t.split(['-', '+']).next().unwrap_or("");
            let p: Vec<&str> = core.split('.').collect();
            t.len() <= 40 && p.len() == 3 && p.iter().all(|x| !x.is_empty() && x.bytes().all(|b| b.is_ascii_digit()))
        })
        .map(str::to_string)
}

/// `claude auth status` em JSON: lê só `loggedIn` e `authMethod`.
pub fn claude_login(stdout: &str, success: bool) -> (Option<bool>, Option<&'static str>) {
    // O probe junta stdout e stderr; o JSON (às vezes em várias linhas) vai do primeiro `{` ao último `}`.
    let body = match (stdout.find('{'), stdout.rfind('}')) {
        (Some(a), Some(b)) if b > a => &stdout[a..=b],
        _ => "",
    };
    let Ok(v) = serde_json::from_str::<Value>(body) else {
        return (None, Some("unknown"));
    };
    if !success || v["loggedIn"] == false {
        return (Some(false), Some("none"));
    }
    if v["loggedIn"] != true {
        return (None, Some("unknown"));
    }
    let method = v["authMethod"].as_str().unwrap_or("unknown");
    (Some(true), Some(KNOWN.iter().copied().find(|k| *k == method).unwrap_or("unknown")))
}

/// `codex login status`: formato não documentado oficialmente; fora do esperado vira desconhecido.
pub fn codex_login(text: &str, success: bool) -> (Option<bool>, Option<&'static str>) {
    let lower = text.to_lowercase();
    if !success {
        return if lower.contains("not logged in") { (Some(false), Some("none")) } else { (None, None) };
    }
    if lower.contains("logged in using chatgpt") {
        (Some(true), Some("chatgpt"))
    } else if lower.contains("api key") {
        (Some(true), Some("api_key"))
    } else {
        (None, Some("unknown"))
    }
}

fn entry(id: &str, installed: bool, version: Option<String>, login: (Option<bool>, Option<&str>), executable: bool, reason: &str) -> Value {
    let (logged, method) = login;
    let paid = logged == Some(true) && method.is_some_and(|m| PAID.contains(&m));
    let executable = executable && installed && logged == Some(true) && !paid;
    json!({"id":id,"installed":installed,"version":version,"loggedIn":if installed {logged} else {None},"authMethod":if installed {method} else {None},"possiblyPaid":paid && installed,"executable":executable,"reason":reason})
}

/// Snapshot sem credenciais. `drivers` traz o diagnóstico já feito (executável por driver).
pub fn snapshot(drivers_state: &[Driver], observed_at_ms: u64) -> Value {
    let exec = |id: &str| drivers_state.iter().any(|d| d.id == id && d.executable && d.authenticated);
    let mut tools = Vec::new();
    for (id, bin) in [("codex", "codex"), ("claude-code", "claude"), ("gemini", "gemini"), ("cursor", "agent")] {
        let Some(path) = drivers::resolve(bin) else {
            tools.push(entry(id, false, None, (None, None), false, "CLI não instalado"));
            continue;
        };
        let version = drivers::probe(&path, &["--version"]).ok().and_then(|(_, t)| parse_version(&t));
        let (login, reason) = match id {
            "claude-code" => (drivers::probe(&path, &["auth", "status"]).map(|(ok, t)| claude_login(&t, ok)).unwrap_or((None, None)), "Status pelo comando público do CLI"),
            "codex" => (drivers::probe(&path, &["login", "status"]).map(|(ok, t)| codex_login(&t, ok)).unwrap_or((None, None)), "Status pelo comando público do CLI"),
            "gemini" => ((None, None), "Login só confirmável com uma chamada; não feita automaticamente"),
            _ => ((None, None), "Integração indisponível nesta versão"),
        };
        let executable = (id == "codex" || id == "claude-code") && exec(id);
        tools.push(entry(id, true, version, login, executable, reason));
    }
    json!({"version":1,"observedAt":observed_at_ms,"tools":tools})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parsers_read_only_public_fields_and_fail_closed() {
        assert_eq!(parse_version("2.1.296 (Claude Code)").as_deref(), Some("2.1.296"));
        assert_eq!(parse_version("codex-cli 0.40.0").as_deref(), Some("0.40.0"));
        assert_eq!(parse_version("codex-cli 0.163.0-alpha.10.2").as_deref(), Some("0.163.0-alpha.10.2"));
        assert_eq!(parse_version("nada"), None);
        assert_eq!(claude_login("{\n  \"loggedIn\": true,\n  \"authMethod\": \"claude.ai\"\n}\n", true), (Some(true), Some("claude.ai")));
        assert_eq!(claude_login(r#"{"loggedIn":false,"authMethod":"none","configDirectory":"/home/x"}"#, false), (Some(false), Some("none")));
        assert_eq!(claude_login(r#"{"loggedIn":true,"authMethod":"claude.ai"}"#, true), (Some(true), Some("claude.ai")));
        assert_eq!(claude_login(r#"{"loggedIn":true,"authMethod":"novo"}"#, true), (Some(true), Some("unknown")));
        assert_eq!(claude_login("lixo", true), (None, Some("unknown")));
        assert_eq!(codex_login("Logged in using ChatGPT", true), (Some(true), Some("chatgpt")));
        assert_eq!(codex_login("Not logged in", false), (Some(false), Some("none")));
        assert_eq!(codex_login("???", true), (None, Some("unknown")));
    }
    #[test]
    fn paid_login_is_never_executable_and_no_paths_leak() {
        let e = entry("claude-code", true, Some("2.1.296".into()), (Some(true), Some("api_key")), true, "x");
        assert_eq!(e["possiblyPaid"], true);
        assert_eq!(e["executable"], false);
        let missing = entry("gemini", false, None, (Some(true), Some("google")), true, "CLI não instalado");
        assert_eq!(missing["loggedIn"], Value::Null);
        assert_eq!(missing["executable"], false);
        let text = serde_json::to_string(&snapshot(&[], 1)).unwrap();
        assert!(!text.contains("/Users/") && !text.contains("/home/") && !text.contains("configDirectory"));
    }
}
