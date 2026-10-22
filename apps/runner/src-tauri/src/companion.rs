// SPDX-License-Identifier: AGPL-3.0-only
//! Runner companheiro (v0.3): estado de execução compartilhado entre a bandeja, o painel, a
//! janela principal e os laços de fundo. Só metadados locais; nada de conteúdo de tarefa.
use crate::{health, perf, policy::Companion};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

pub struct Runtime {
    pub sampler: Mutex<health::Sampler>,
    pub last: Mutex<Option<health::Sample>>,
    pub protection: Mutex<health::ProtectionState>,
    pub pause_reason: Mutex<Option<String>>,
    pub hidden: AtomicBool,
    pub suggested: (perf::Profile, String),
}

impl Runtime {
    pub fn new() -> Self {
        let mut sampler = health::Sampler::new();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        let first = sampler.sample(now_ms());
        let suggested = perf::suggest(first.cores, first.memory_total_gb, first.battery.is_some(), std::env::consts::OS, std::env::consts::ARCH);
        Self { sampler: Mutex::new(sampler), last: Mutex::new(Some(first)), protection: Mutex::new(Default::default()), pause_reason: Mutex::new(None), hidden: AtomicBool::new(false), suggested }
    }
    pub fn hidden(&self) -> bool {
        self.hidden.load(Ordering::Relaxed)
    }
    pub fn on_battery(&self) -> bool {
        self.last.lock().ok().and_then(|l| l.as_ref().and_then(|s| s.battery.clone())).map(|b| !b.on_ac).unwrap_or(false)
    }
    pub fn profile(&self, c: &Companion) -> perf::Profile {
        perf::effective(c.profile.as_deref().and_then(perf::Profile::parse), self.suggested.0, self.on_battery(), c.light_on_battery)
    }
    /// Pausa efetiva da fila: manual do dono OU regra de proteção ligada. Devolve o motivo.
    pub fn paused(&self, c: &Companion) -> Option<String> {
        if c.queue_paused {
            return Some("Pausada por você.".into());
        }
        self.pause_reason.lock().ok().and_then(|r| r.clone()).map(|r| format!("Pausada pela proteção do trabalho: {r}."))
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionView {
    pub settings: Companion,
    pub suggested: perf::Profile,
    pub suggested_reason: String,
    pub effective: perf::Profile,
    pub knobs: perf::Knobs,
    pub paused: Option<String>,
    pub version: &'static str,
    pub update_key_ready: bool,
    pub os: &'static str,
    pub arch: &'static str,
}

/// Valida um patch vindo da interface: só campos conhecidos e faixas razoáveis.
pub fn apply_patch(mut c: Companion, patch: &serde_json::Value) -> Result<Companion, String> {
    let obj = patch.as_object().ok_or("Ajuste inválido.")?;
    for (k, v) in obj {
        match k.as_str() {
            "setupDone" => c.setup_done = v.as_bool().ok_or("setupDone")?,
            "updateConsent" => c.update_consent = Some(v.as_bool().ok_or("updateConsent")?),
            "autostart" => c.autostart = v.as_bool().ok_or("autostart")?,
            "showInDock" => c.show_in_dock = v.as_bool().ok_or("showInDock")?,
            "profile" => {
                c.profile = match v.as_str() {
                    None => None,
                    Some(p) if perf::Profile::parse(p).is_some() => Some(p.to_string()),
                    _ => return Err("Perfil desconhecido.".into()),
                }
            }
            "lightOnBattery" => c.light_on_battery = v.as_bool().ok_or("lightOnBattery")?,
            "autoCleanup" => c.auto_cleanup = v.as_bool().ok_or("autoCleanup")?,
            "cleanupHours" => c.cleanup_hours = v.as_u64().filter(|h| (1..=168).contains(h)).ok_or("Use de 1 a 168 horas.")? as u32,
            "notifications" => c.notifications = v.as_bool().ok_or("notifications")?,
            "queuePaused" => c.queue_paused = v.as_bool().ok_or("queuePaused")?,
            "protection" => {
                let p: health::ProtectionConfig = serde_json::from_value(v.clone()).map_err(|_| "Regras de proteção inválidas.")?;
                if !(50.0..=100.0).contains(&p.hot_cpu) || !(5.0..=80.0).contains(&p.battery_min) || !(50.0..=99.0).contains(&p.memory_max) || p.hot_secs > 3600 {
                    return Err("Limites de proteção fora da faixa.".into());
                }
                c.protection = p;
            }
            _ => return Err(format!("Ajuste desconhecido: {k}.")),
        }
    }
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn patch_accepts_known_fields_and_rejects_the_rest() {
        let c = apply_patch(Companion::default(), &serde_json::json!({"updateConsent": true, "profile": "leve", "cleanupHours": 12})).unwrap();
        assert_eq!(c.update_consent, Some(true));
        assert_eq!(c.profile.as_deref(), Some("leve"));
        assert_eq!(c.cleanup_hours, 12);
        assert!(apply_patch(Companion::default(), &serde_json::json!({"shell": "rm"})).is_err());
        assert!(apply_patch(Companion::default(), &serde_json::json!({"profile": "turbo"})).is_err());
        assert!(apply_patch(Companion::default(), &serde_json::json!({"cleanupHours": 0})).is_err());
        assert!(apply_patch(Companion::default(), &serde_json::json!({"protection": {"hotCpu": 10}})).is_err());
    }
}
