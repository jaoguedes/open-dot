// SPDX-License-Identifier: AGPL-3.0-only
//! Desempenho e boa vizinhança (v0.3, G): perfil sugerido pelo hardware, recuo progressivo da
//! consulta à fila e o que cada perfil controla. Nada pesado ligado por padrão em nenhum perfil.
use serde::Serialize;
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Profile {
    Leve,
    Equilibrado,
    Maximo,
}

impl Profile {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "leve" => Some(Self::Leve),
            "equilibrado" => Some(Self::Equilibrado),
            "maximo" => Some(Self::Maximo),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Knobs {
    /// Tarefas locais ao mesmo tempo (o Runner executa uma por vez nesta versão).
    pub concurrency: u32,
    pub poll_min_ms: u64,
    pub poll_max_ms: u64,
    /// Teto de quadros por segundo do Dot e das animações da interface.
    pub ui_fps: u32,
    /// Se o paralelismo só leitura PODE ser ligado (continua desligado por padrão).
    pub parallel_allowed: bool,
}

pub fn knobs(p: Profile) -> Knobs {
    match p {
        Profile::Leve => Knobs { concurrency: 1, poll_min_ms: 5_000, poll_max_ms: 60_000, ui_fps: 15, parallel_allowed: false },
        Profile::Equilibrado => Knobs { concurrency: 1, poll_min_ms: 3_000, poll_max_ms: 30_000, ui_fps: 30, parallel_allowed: false },
        Profile::Maximo => Knobs { concurrency: 1, poll_min_ms: 2_000, poll_max_ms: 20_000, ui_fps: 60, parallel_allowed: true },
    }
}

/// Sugestão pelo hardware. Sem detecção (zeros), o padrão conservador é Leve.
pub fn suggest(cores: usize, memory_gb: f64, has_battery: bool, os: &str, arch: &str) -> (Profile, String) {
    if cores == 0 || memory_gb <= 0.0 {
        return (Profile::Leve, "hardware não detectado: perfil conservador".into());
    }
    if os == "macos" && arch == "x86_64" {
        return (Profile::Leve, format!("Mac Intel ({cores} núcleos, {:.0} GB): costuma esquentar com carga contínua", memory_gb));
    }
    if cores <= 4 || memory_gb < 8.5 {
        return (Profile::Leve, format!("{cores} núcleos e {:.0} GB de memória", memory_gb));
    }
    if cores >= 8 && memory_gb >= 16.0 && !has_battery {
        return (Profile::Maximo, format!("{cores} núcleos, {:.0} GB, sem bateria", memory_gb));
    }
    (Profile::Equilibrado, format!("{cores} núcleos, {:.0} GB{}", memory_gb, if has_battery { ", com bateria" } else { "" }))
}

/// Perfil efetivo: escolha do dono ou sugestão; em bateria (com permissão) cai para Leve.
pub fn effective(chosen: Option<Profile>, suggested: Profile, on_battery: bool, light_on_battery: bool) -> Profile {
    if on_battery && light_on_battery {
        return Profile::Leve;
    }
    chosen.unwrap_or(suggested)
}

/// Próxima espera da consulta à fila: volta ao mínimo quando houve trabalho; senão dobra até o
/// máximo (o dobro do máximo com a janela oculta e sem tarefas).
pub fn next_poll(prev: Duration, had_work: bool, hidden: bool, k: &Knobs) -> Duration {
    if had_work {
        return Duration::from_millis(k.poll_min_ms);
    }
    let cap = if hidden { k.poll_max_ms * 2 } else { k.poll_max_ms };
    Duration::from_millis((prev.as_millis() as u64).max(k.poll_min_ms).saturating_mul(2).min(cap))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn suggests_conservatively() {
        assert_eq!(suggest(0, 0.0, false, "macos", "aarch64").0, Profile::Leve);
        assert_eq!(suggest(8, 16.0, true, "macos", "x86_64").0, Profile::Leve, "Mac Intel antigo cai em Leve");
        assert_eq!(suggest(4, 16.0, false, "windows", "x86_64").0, Profile::Leve);
        assert_eq!(suggest(8, 16.0, true, "macos", "aarch64").0, Profile::Equilibrado);
        assert_eq!(suggest(16, 32.0, false, "windows", "x86_64").0, Profile::Maximo);
        assert!(knobs(Profile::Maximo).concurrency == 1, "uma tarefa por vez em todos os perfis");
    }
    #[test]
    fn battery_forces_light_only_with_permission() {
        assert_eq!(effective(Some(Profile::Maximo), Profile::Equilibrado, true, true), Profile::Leve);
        assert_eq!(effective(Some(Profile::Maximo), Profile::Equilibrado, true, false), Profile::Maximo);
        assert_eq!(effective(None, Profile::Equilibrado, false, true), Profile::Equilibrado);
    }
    #[test]
    fn backoff_grows_caps_and_resets() {
        let k = knobs(Profile::Leve);
        let mut d = Duration::from_millis(k.poll_min_ms);
        let mut seen = vec![];
        for _ in 0..8 {
            d = next_poll(d, false, false, &k);
            seen.push(d.as_millis() as u64);
        }
        assert_eq!(seen[..4], [10_000, 20_000, 40_000, 60_000]);
        assert!(seen.iter().all(|v| *v <= k.poll_max_ms));
        assert_eq!(next_poll(d, false, true, &k).as_millis() as u64, 120_000, "oculta e ociosa: espera mais");
        assert_eq!(next_poll(d, true, true, &k).as_millis() as u64, k.poll_min_ms, "trabalho volta ao mínimo");
    }
}
