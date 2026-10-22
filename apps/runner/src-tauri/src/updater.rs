// SPDX-License-Identifier: AGPL-3.0-only
//! Atualização do Runner (v0.3, C2): política em código. Só com consentimento, só HTTPS do
//! repositório, nunca downgrade, nunca com tarefa em andamento, nunca com chave pública
//! provisória, e assinatura minisign conferida antes de instalar (o plugin oficial confere de
//! novo ao instalar). A chave privada nunca existe aqui.
use base64::Engine;

pub const PUBKEY_PLACEHOLDER: &str = "[CHAVE_PUBLICA_A_DEFINIR]";
/// Canal fixo (release não marcado como rascunho nem pré-lançamento): ver docs/release/runner-atualizacao.md.
pub const ENDPOINT: &str = "https://github.com/jaoguedes/open-dot/releases/download/runner-canal-beta/latest.json";

pub fn placeholder(pubkey: &str) -> bool {
    let p = pubkey.trim();
    p.is_empty() || p == PUBKEY_PLACEHOLDER || p.contains("A_DEFINIR")
}

/// Só HTTPS no github.com do projeto; nada de outro host, porta ou esquema.
pub fn allowed_endpoint(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://github.com/jaoguedes/open-dot/releases/") else { return false };
    !rest.contains("..") && !rest.contains('@') && !rest.contains('\\') && url.ends_with("/latest.json")
}

fn parse(v: &str) -> Option<semver::Version> {
    semver::Version::parse(v.trim().trim_start_matches('v')).ok()
}

/// Verdadeiro só quando `candidate` é estritamente mais nova. Versão ilegível = não atualiza.
pub fn is_newer(current: &str, candidate: &str) -> bool {
    match (parse(current), parse(candidate)) {
        (Some(c), Some(n)) => n > c,
        _ => false,
    }
}

#[derive(Debug, PartialEq)]
pub enum Gate {
    Ok,
    NoConsent,
    PlaceholderKey,
    NotNewer,
    TaskRunning,
}

pub fn gate(consent: Option<bool>, pubkey: &str, current: &str, candidate: Option<&str>, task_running: bool) -> Gate {
    if consent != Some(true) {
        return Gate::NoConsent;
    }
    if placeholder(pubkey) {
        return Gate::PlaceholderKey;
    }
    if let Some(c) = candidate {
        if !is_newer(current, c) {
            return Gate::NotNewer;
        }
    }
    if task_running {
        return Gate::TaskRunning;
    }
    Gate::Ok
}

/// Confere a assinatura no formato do updater do Tauri: chave pública e assinatura são textos
/// minisign codificados em base64. Na instalação real quem confere é o plugin oficial (mesma
/// biblioteca, minisign-verify); esta função existe para os testes de assinatura com fixtures.
#[cfg_attr(not(test), allow(dead_code))]
pub fn verify(pubkey_b64: &str, signature_b64: &str, data: &[u8]) -> Result<(), String> {
    let b64 = base64::engine::general_purpose::STANDARD;
    let pk_text = String::from_utf8(b64.decode(pubkey_b64.trim()).map_err(|_| "Chave pública ilegível.")?).map_err(|_| "Chave pública ilegível.")?;
    let sig_text = String::from_utf8(b64.decode(signature_b64.trim()).map_err(|_| "Assinatura ilegível.")?).map_err(|_| "Assinatura ilegível.")?;
    let pk = minisign_verify::PublicKey::decode(&pk_text).map_err(|_| "Chave pública inválida.")?;
    let sig = minisign_verify::Signature::decode(&sig_text).map_err(|_| "Assinatura inválida.")?;
    pk.verify(data, &sig, true).map_err(|_| "Assinatura não confere: nada foi instalado.".into())
}

/// Notas do release são texto não confiável: sem HTML, sem links clicáveis, tamanho limitado.
pub fn plain_notes(raw: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in raw.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            c if !in_tag && (c == '\n' || !c.is_control()) => out.push(c),
            _ => {}
        }
        if out.len() > 4000 {
            break;
        }
    }
    out.replace("](", "] (").replace("http://", "http:// ").replace("https://", "https:// ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn keypair() -> (String, minisign::SecretKey) {
        // Chave EFÊMERA, só na memória do teste; nunca gravada. Não é a chave de assinatura real.
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let pk_text = kp.pk.to_box().unwrap().to_string();
        (base64::engine::general_purpose::STANDARD.encode(pk_text), kp.sk)
    }
    fn sign(sk: &minisign::SecretKey, data: &[u8]) -> String {
        let sig = minisign::sign(None, sk, Cursor::new(data), Some("teste"), None).unwrap();
        base64::engine::general_purpose::STANDARD.encode(sig.to_string())
    }

    #[test]
    fn valid_signature_passes_and_tampering_fails() {
        let (pk, sk) = keypair();
        let data = b"instalador simulado v0.3.1";
        let sig = sign(&sk, data);
        assert!(verify(&pk, &sig, data).is_ok());
        assert!(verify(&pk, &sig, b"instalador ADULTERADO v0.3.1").is_err(), "conteúdo mudou");
        let (other_pk, _) = keypair();
        assert!(verify(&other_pk, &sig, data).is_err(), "outra chave");
        assert!(verify(&pk, "não é base64", data).is_err());
    }

    #[test]
    fn no_downgrade_no_same_version_unreadable_refused() {
        assert!(is_newer("0.3.0", "0.3.1"));
        assert!(is_newer("0.3.0-beta.1", "0.3.0"));
        assert!(!is_newer("0.3.1", "0.3.0"), "downgrade recusado");
        assert!(!is_newer("0.3.0", "0.3.0"));
        assert!(!is_newer("0.3.0", "lixo"));
    }

    #[test]
    fn gate_order_consent_key_version_task() {
        assert_eq!(gate(None, "abc", "0.3.0", Some("0.3.1"), false), Gate::NoConsent, "sem resposta = sem rede");
        assert_eq!(gate(Some(false), "abc", "0.3.0", Some("0.3.1"), false), Gate::NoConsent);
        assert_eq!(gate(Some(true), PUBKEY_PLACEHOLDER, "0.3.0", Some("0.3.1"), false), Gate::PlaceholderKey);
        assert_eq!(gate(Some(true), "abc", "0.3.1", Some("0.3.0"), false), Gate::NotNewer);
        assert_eq!(gate(Some(true), "abc", "0.3.0", Some("0.3.1"), true), Gate::TaskRunning, "não interrompe tarefa");
        assert_eq!(gate(Some(true), "abc", "0.3.0", Some("0.3.1"), false), Gate::Ok);
    }

    #[test]
    fn configured_endpoint_and_placeholder_key_in_tauri_conf() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let eps = conf["plugins"]["updater"]["endpoints"].as_array().unwrap();
        assert_eq!(eps.len(), 1);
        assert_eq!(eps[0].as_str().unwrap(), ENDPOINT);
        assert!(placeholder(conf["plugins"]["updater"]["pubkey"].as_str().unwrap()), "a chave real é do João; aqui só o marcador");
        assert_eq!(conf["bundle"]["createUpdaterArtifacts"], serde_json::json!(true));
    }

    #[test]
    fn endpoint_allowlist_and_plain_notes() {
        assert!(allowed_endpoint(ENDPOINT));
        assert!(!allowed_endpoint("http://github.com/jaoguedes/open-dot/releases/download/x/latest.json"));
        assert!(!allowed_endpoint("https://github.com.evil.example/jaoguedes/open-dot/releases/latest.json"));
        assert!(!allowed_endpoint("https://github.com/jaoguedes/open-dot/releases/../../x/latest.json"));
        let n = plain_notes("<script>alert(1)</script>Corrige a bandeja. [link](https://example.com)\u{7}");
        assert!(!n.contains('<') && !n.contains("https://example") && !n.contains('\u{7}'));
        assert!(n.contains("Corrige a bandeja."));
    }
}
