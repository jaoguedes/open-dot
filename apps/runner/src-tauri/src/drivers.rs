// SPDX-License-Identifier: AGPL-3.0-only
//! Diagnóstico por interfaces públicas. Não abre arquivos de autenticação.
use serde::Serialize;
use std::{
    io::Read,
    path::PathBuf,
    process::Stdio,
    sync::mpsc,
    time::{Duration, Instant},
};
#[derive(Clone, Serialize)]
pub struct Driver {
    pub id: &'static str,
    pub installed: bool,
    pub authenticated: bool,
    pub executable: bool,
    pub reason: String,
    pub features: Features,
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Features {pub version:u8,pub proposal_generation:bool,pub approved_host_writes:bool,pub recovery:&'static str,pub project_commands:bool,pub models_discovered:bool,pub evidence:&'static str}
pub fn features(id:&str,ready:bool)->Features {
    // Cursor nunca: sem modo sem ferramentas verificável (cursor.rs).
    let enabled=(id=="codex"||id=="claude-code")&&ready;
    Features{version:1,proposal_generation:enabled,approved_host_writes:enabled,recovery:if enabled{"approved-proposal-only"}else{"unavailable"},project_commands:false,models_discovered:false,evidence:if enabled{"local-preflight"}else{"diagnostic-only"}}
}
fn authenticated(id:&str,success:bool,text:&str)->bool {
    if !success{return false;}
    match id {
        "codex"=>text.contains("Logged in using ChatGPT"),
        // Só assinatura: login por chave de API ou terceiros é possivelmente pago e nunca executa por padrão.
        "claude-code"=>{let (logged,method)=crate::tools::claude_login(text,success);logged==Some(true)&&matches!(method,Some("claude.ai"|"oauth_token"))},
        _=>false,
    }
}
pub fn resolve(name: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join(".local/bin"));
    }
    if name == "codex" {
        dirs.push(PathBuf::from(
            "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS",
        ));
    }
    for dir in dirs {
        for suffix in if cfg!(windows) {
            vec![".exe", ""]
        } else {
            vec![""]
        } {
            let path = dir.join(format!("{name}{suffix}"));
            if path.is_file() {
                return path.canonicalize().ok();
            }
        }
    }
    None
}
pub(crate) fn probe(path: &PathBuf, args: &[&str]) -> Result<(bool, String), ()> {
    let mut cmd = crate::process::command(path);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Remove chaves de API: nunca mudar silenciosamente de assinatura para cobrança por API.
    for key in [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "CURSOR_API_KEY",
        "OPENAI_BASE_URL",
        "ANTHROPIC_BASE_URL",
    ] {
        cmd.env_remove(key);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = crate::process::Guard::new(cmd.spawn().map_err(|_| ())?);
    let stdout = child.0.stdout.take().ok_or(())?;
    let stderr = child.0.stderr.take().ok_or(())?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let result = stdout.take(16_385).read_to_end(&mut buf);
        let _ = tx.send((result, buf));
    });
    let (etx, erx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let result = stderr.take(16_385).read_to_end(&mut buf);
        let _ = etx.send((result, buf));
    });
    let start = Instant::now();
    let status = loop {
        match child.0.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if start.elapsed() < Duration::from_secs(8) => {
                std::thread::sleep(Duration::from_millis(50))
            }
            _ => {
                let _ = child.0.kill();
                let _ = child.0.wait();
                return Err(());
            }
        }
    };
    let (r, bytes) = rx
        .recv_timeout(Duration::from_millis(500))
        .map_err(|_| ())?;
    r.map_err(|_| ())?;
    if bytes.len() > 16_384 {
        return Err(());
    }
    let (r, err) = erx
        .recv_timeout(Duration::from_millis(500))
        .map_err(|_| ())?;
    r.map_err(|_| ())?;
    if err.len() > 16_384 {
        return Err(());
    }
    Ok((
        status.success(),
        format!(
            "{}\n{}",
            String::from_utf8_lossy(&bytes),
            String::from_utf8_lossy(&err)
        ),
    ))
}
pub fn detect() -> Vec<Driver> {
    [("codex","codex"),("claude-code","claude"),("cursor","agent")].into_iter().map(|(id,bin)|{
        let Some(path)=resolve(bin) else{return Driver{id,features:features(id,false),installed:false,authenticated:false,executable:false,reason:"CLI oficial não encontrado. Instale pelo fornecedor.".into()}};
        let args=if id=="codex"{Some(vec!["login","status"])}else if id=="claude-code"{Some(vec!["auth","status"])}else{None};
        let authenticated=args.and_then(|args|probe(&path,&args).ok()).is_some_and(|(ok,text)|authenticated(id,ok,&text));
        Driver{id,features:features(id,false),installed:true,authenticated,executable:false,reason:if !authenticated {"Autenticação não confirmada. Use o login oficial no terminal; nenhuma credencial é solicitada aqui.".into()} else if id=="codex" {"ChatGPT autenticado. Execução bloqueada: falta validar restrição de leitura por pasta e aprovações no driver.".into()}else{"Autenticado. Driver de execução ainda não validado.".into()}}
    }).collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostic_is_not_execution_or_model_discovery() {
        assert!(!authenticated("claude-code",false,r#"{"loggedIn":true}"#));
        assert!(authenticated("claude-code",true,r#"{"loggedIn":true,"authMethod":"claude.ai"}"#));
        assert!(!authenticated("claude-code",true,r#"{"loggedIn":true}"#));
        assert!(!authenticated("claude-code",true,r#"{"loggedIn":true,"authMethod":"api_key"}"#));
        assert!(!authenticated("claude-code",true,"not-json"));
        assert!(!authenticated("codex",false,"Logged in using ChatGPT"));
        assert!(!authenticated("cursor",true,"authenticated"));
        for id in ["codex","claude-code","cursor"] {
            assert!(!features(id,false).proposal_generation);
            assert!(!features(id,true).models_discovered);
            assert!(!features(id,true).project_commands);
            assert_eq!(features(id,true).proposal_generation,id!="cursor");
        }
    }
    #[test]
    fn absent_program() {
        assert!(resolve("open-dot-nonexistent-executable-98765").is_none());
    }
}
