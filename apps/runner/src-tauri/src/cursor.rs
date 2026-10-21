// SPDX-License-Identifier: AGPL-3.0-only
//! Cursor (cursor-agent) no contrato somente-proposta: INDISPONÍVEL por desenho nesta versão.
//! O modo não interativo do CLI não oferece um interruptor documentado e verificável que
//! desligue ferramentas de escrita e shell. Sem isso, o host não consegue garantir que o
//! agente só proponha. O parser abaixo existe para quando houver esse interruptor e um CLI
//! real para validar; até lá o driver é sempre reportado como não executável.
//! Estado: testado só com fixtures; NÃO validado com o CLI real (ausente na máquina de auditoria).
use serde_json::Value;

pub const UNAVAILABLE_REASON: &str = "Cursor: o CLI não permite desligar ferramentas de escrita e shell de forma verificável; o modo somente-proposta não pode ser garantido. Driver indisponível (não validado com o CLI real).";

/// Nunca verdadeiro até existir um modo sem ferramentas verificável por preflight.
pub fn safe_contract_available() -> bool {
    false
}

/// Envelope `--output-format json` do cursor-agent: só aceita resultado de um turno, sem erro.
pub fn parse_result(bytes: &[u8]) -> Result<String, String> {
    let v: Value = serde_json::from_slice(bytes).map_err(|_| "Resposta do Cursor ilegível.")?;
    if v["type"] != "result" || v["is_error"] != false || v["subtype"] != "success" {
        return Err("O Cursor não concluiu a proposta. Nenhuma edição foi aplicada.".into());
    }
    Ok(v["result"].as_str().ok_or("Proposta ausente.")?.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contract_is_unavailable_and_parser_fails_closed() {
        assert!(!safe_contract_available());
        assert!(UNAVAILABLE_REASON.contains("não validado"));
        assert_eq!(parse_result(br#"{"type":"result","subtype":"success","is_error":false,"result":"{}"}"#).unwrap(), "{}");
        assert!(parse_result(br#"{"type":"result","subtype":"error","is_error":true,"result":"x"}"#).is_err());
        assert!(parse_result(br#"{"type":"tool_call"}"#).is_err());
        assert!(parse_result(b"garbage").is_err());
    }
}
