// SPDX-License-Identifier: AGPL-3.0-only
//! Execução de testes em cópia isolada (v0.3, 4.5): só a INTERFACE. Bloqueado nesta versão: não há
//! contenção de rede e de escrita comprovada sem custo no macOS e no Windows. A única implementação
//! recusa sempre, com o motivo; nenhum comando de projeto é executado pelo Runner.
pub struct Request<'a> {
    pub argv: &'a [String],
    pub timeout_ms: u64,
    pub output_cap: usize,
}

pub trait SandboxRunner {
    fn available(&self) -> bool;
    fn run(&self, req: &Request<'_>, approval_hash: &str) -> Result<(i32, Vec<u8>), String>;
}

pub struct Unavailable;
pub const REASON: &str = "Execução de testes isolada bloqueada: contenção de rede e de escrita fora da cópia não comprovada nesta plataforma.";

impl SandboxRunner for Unavailable {
    fn available(&self) -> bool {
        false
    }
    fn run(&self, _req: &Request<'_>, _approval_hash: &str) -> Result<(i32, Vec<u8>), String> {
        Err(REASON.into())
    }
}

/// A chave `ORCH_SANDBOX_TESTS` não muda nada nesta versão: mesmo ligada, o runner é o indisponível.
#[cfg_attr(not(test), allow(dead_code))]
pub fn runner() -> Box<dyn SandboxRunner> {
    Box::new(Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn always_refuses_even_with_flag_and_allowlisted_command() {
        std::env::set_var("ORCH_SANDBOX_TESTS", "1");
        let argv = vec!["npm".to_string(), "test".to_string()];
        let r = runner();
        assert!(!r.available());
        let e = r.run(&Request { argv: &argv, timeout_ms: 1000, output_cap: 1000 }, &"a".repeat(64)).unwrap_err();
        assert!(e.contains("bloqueada"));
        std::env::remove_var("ORCH_SANDBOX_TESTS");
    }
}
