// SPDX-License-Identifier: AGPL-3.0-only
//! Saúde do computador (v0.3, C3): somente leitura e local. O que a plataforma não entrega fica
//! `None` ("indisponível"), nunca inventado. Proteção do trabalho com histerese: pausa a FILA do
//! Runner (nunca encerra processo) e retoma quando normaliza.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub percent: f32,
    pub charging: bool,
    pub on_ac: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub cpu: f32,
    pub memory: f32,
    pub memory_total_gb: f64,
    pub disk_free_gb: Option<f64>,
    pub disk_total_gb: Option<f64>,
    pub battery: Option<Battery>,
    /// Limite de velocidade da CPU imposto pelo sistema (100 = sem limitação térmica).
    pub cpu_speed_limit: Option<u8>,
    pub temperature_c: Option<f32>,
    pub cores: usize,
    pub at_ms: u64,
}

/// `pmset -g batt` (macOS): "Now drawing from 'AC Power'" + "... 82%; charging; ...".
pub fn parse_pmset_batt(text: &str) -> Option<Battery> {
    let line = text.lines().find(|l| l.contains('%'))?;
    let pct = line.split(|c: char| c == '\t' || c == ' ' || c == ';').find(|p| p.ends_with('%'))?;
    let percent: f32 = pct.trim_end_matches('%').parse().ok()?;
    if !(0.0..=100.0).contains(&percent) {
        return None;
    }
    let lower = line.to_ascii_lowercase();
    let charging = lower.contains("; charging") || lower.contains("charged") || lower.contains("finishing charge");
    let on_ac = text.contains("'AC Power'");
    Some(Battery { percent, charging: charging && on_ac, on_ac })
}

/// `pmset -g therm` (macOS): "CPU_Speed_Limit = 100". Sem a linha, indisponível.
pub fn parse_pmset_therm(text: &str) -> Option<u8> {
    text.lines().find_map(|l| {
        let (k, v) = l.split_once('=')?;
        if k.trim() == "CPU_Speed_Limit" {
            v.trim().parse::<u8>().ok().filter(|n| *n <= 100)
        } else {
            None
        }
    })
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct ProtectionConfig {
    pub pause_hot: bool,
    pub hot_cpu: f32,
    pub hot_secs: u64,
    pub pause_battery: bool,
    pub battery_min: f32,
    pub pause_memory: bool,
    pub memory_max: f32,
}
impl Default for ProtectionConfig {
    fn default() -> Self {
        Self { pause_hot: false, hot_cpu: 92.0, hot_secs: 60, pause_battery: false, battery_min: 20.0, pause_memory: false, memory_max: 90.0 }
    }
}

/// Estado da histerese entre amostras.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionState {
    pub hot_since_ms: Option<u64>,
    pub cool_since_ms: Option<u64>,
    pub hot: bool,
    pub low_battery: bool,
    pub memory_high: bool,
}

pub const COOL_MARGIN: f32 = 15.0;
pub const COOL_SECS: u64 = 30;
pub const BATTERY_MARGIN: f32 = 10.0;
pub const MEMORY_MARGIN: f32 = 10.0;

/// Atualiza a histerese e devolve o motivo real da pausa, se alguma regra LIGADA pedir pausa.
pub fn evaluate(cfg: &ProtectionConfig, st: &mut ProtectionState, s: &Sample) -> Option<String> {
    let throttled = s.cpu_speed_limit.map(|l| l < 100).unwrap_or(false);
    // Calor: entra com CPU acima do limite por `hot_secs` (ou limitação térmica do sistema);
    // sai só depois de `COOL_SECS` abaixo de limite − margem.
    if s.cpu >= cfg.hot_cpu || throttled {
        st.cool_since_ms = None;
        let since = *st.hot_since_ms.get_or_insert(s.at_ms);
        if throttled || s.at_ms.saturating_sub(since) >= cfg.hot_secs * 1000 {
            st.hot = true;
        }
    } else {
        st.hot_since_ms = None;
        if st.hot && s.cpu < cfg.hot_cpu - COOL_MARGIN {
            let since = *st.cool_since_ms.get_or_insert(s.at_ms);
            if s.at_ms.saturating_sub(since) >= COOL_SECS * 1000 {
                st.hot = false;
                st.cool_since_ms = None;
            }
        } else if st.hot {
            st.cool_since_ms = None;
        }
    }
    if let Some(b) = &s.battery {
        if !st.low_battery && !b.on_ac && b.percent < cfg.battery_min {
            st.low_battery = true;
        } else if st.low_battery && (b.on_ac || b.percent >= cfg.battery_min + BATTERY_MARGIN) {
            st.low_battery = false;
        }
    } else {
        st.low_battery = false;
    }
    if !st.memory_high && s.memory >= cfg.memory_max {
        st.memory_high = true;
    } else if st.memory_high && s.memory < cfg.memory_max - MEMORY_MARGIN {
        st.memory_high = false;
    }
    if cfg.pause_hot && st.hot {
        return Some(if throttled {
            format!("Sistema limitando a CPU a {}% por calor", s.cpu_speed_limit.unwrap_or(0))
        } else {
            format!("CPU acima de {:.0}% por mais de {} s", cfg.hot_cpu, cfg.hot_secs)
        });
    }
    if cfg.pause_battery && st.low_battery {
        return Some(format!("Bateria abaixo de {:.0}% sem carregador", cfg.battery_min));
    }
    if cfg.pause_memory && st.memory_high {
        return Some(format!("Memória acima de {:.0}%", cfg.memory_max));
    }
    None
}

/// Amostrador persistente: mantém o `System` entre leituras (CPU precisa de duas amostras).
pub struct Sampler {
    sys: sysinfo::System,
    disks: sysinfo::Disks,
    components: sysinfo::Components,
}

impl Sampler {
    pub fn new() -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        Self { sys, disks: sysinfo::Disks::new_with_refreshed_list(), components: sysinfo::Components::new_with_refreshed_list() }
    }

    pub fn sample(&mut self, now_ms: u64) -> Sample {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.disks.refresh(true);
        self.components.refresh(true);
        let total = self.sys.total_memory() as f64;
        let memory = if total > 0.0 { (self.sys.used_memory() as f64 / total * 100.0) as f32 } else { 0.0 };
        let root = self.disks.list().iter().max_by_key(|d| d.total_space());
        let temps: Vec<f32> = self.components.list().iter().filter_map(|c| c.temperature()).filter(|t| t.is_finite() && *t > 0.0 && *t < 130.0).collect();
        Sample {
            cpu: self.sys.global_cpu_usage().clamp(0.0, 100.0),
            memory,
            memory_total_gb: total / 1_073_741_824.0,
            disk_free_gb: root.map(|d| d.available_space() as f64 / 1_000_000_000.0),
            disk_total_gb: root.map(|d| d.total_space() as f64 / 1_000_000_000.0),
            battery: battery(),
            cpu_speed_limit: thermal(),
            temperature_c: temps.into_iter().reduce(f32::max),
            cores: self.sys.cpus().len(),
            at_ms: now_ms,
        }
    }
}

#[cfg(target_os = "macos")]
fn pmset(arg: &str) -> Option<String> {
    let mut c = crate::process::command(std::path::Path::new("/usr/bin/pmset"));
    c.args(["-g", arg]);
    crate::process::bounded(c, std::time::Duration::from_secs(3), 8192).ok().and_then(|b| String::from_utf8(b).ok())
}
#[cfg(target_os = "macos")]
fn battery() -> Option<Battery> {
    pmset("batt").and_then(|t| parse_pmset_batt(&t))
}
#[cfg(target_os = "macos")]
fn thermal() -> Option<u8> {
    pmset("therm").and_then(|t| parse_pmset_therm(&t))
}
// Windows e Linux: bateria e pressão térmica ficam indisponíveis nesta versão (sem teste real).
#[cfg(not(target_os = "macos"))]
fn battery() -> Option<Battery> {
    None
}
#[cfg(not(target_os = "macos"))]
fn thermal() -> Option<u8> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    const BATT_AC: &str = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234567)\t82%; charging; 0:45 remaining present: true\n";
    const BATT_DC: &str = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t17%; discharging; 1:02 remaining present: true\n";
    const DESKTOP: &str = "Now drawing from 'AC Power'\n";
    const THERM_OK: &str = "Note: No thermal warning level has been recorded\n CPU_Scheduler_Limit \t= 100\n CPU_Available_CPUs \t= 8\n CPU_Speed_Limit \t= 100\n";
    const THERM_HOT: &str = " CPU_Speed_Limit \t= 72\n";

    fn s(cpu: f32, at: u64) -> Sample {
        Sample { cpu, memory: 50.0, at_ms: at, ..Default::default() }
    }

    #[test]
    fn parses_pmset_fixtures() {
        assert_eq!(parse_pmset_batt(BATT_AC), Some(Battery { percent: 82.0, charging: true, on_ac: true }));
        assert_eq!(parse_pmset_batt(BATT_DC), Some(Battery { percent: 17.0, charging: false, on_ac: false }));
        assert_eq!(parse_pmset_batt(DESKTOP), None, "sem bateria = indisponível");
        assert_eq!(parse_pmset_batt("garbage 900%"), None);
        assert_eq!(parse_pmset_therm(THERM_OK), Some(100));
        assert_eq!(parse_pmset_therm(THERM_HOT), Some(72));
        assert_eq!(parse_pmset_therm("nada"), None);
    }

    #[test]
    fn hot_pause_needs_time_and_cools_with_hysteresis() {
        let cfg = ProtectionConfig { pause_hot: true, ..Default::default() };
        let mut st = ProtectionState::default();
        assert_eq!(evaluate(&cfg, &mut st, &s(95.0, 0)), None, "pico curto não pausa");
        assert_eq!(evaluate(&cfg, &mut st, &s(95.0, 30_000)), None);
        assert!(evaluate(&cfg, &mut st, &s(95.0, 61_000)).unwrap().contains("CPU acima de 92%"));
        // 85% está abaixo do limite mas acima de limite − margem: continua pausado (sem liga-desliga).
        assert!(evaluate(&cfg, &mut st, &s(85.0, 70_000)).is_some());
        assert!(evaluate(&cfg, &mut st, &s(70.0, 80_000)).is_some(), "esfriando, mas ainda sem 30 s");
        assert!(evaluate(&cfg, &mut st, &s(70.0, 105_000)).is_some());
        assert_eq!(evaluate(&cfg, &mut st, &s(70.0, 111_000)), None, "retoma depois de 30 s frio");
    }

    #[test]
    fn no_flapping_around_the_threshold() {
        let cfg = ProtectionConfig { pause_hot: true, hot_secs: 0, ..Default::default() };
        let mut st = ProtectionState::default();
        let mut changes = 0;
        let mut last = false;
        for i in 0..200u64 {
            let cpu = if i % 2 == 0 { 93.0 } else { 90.0 };
            let now = evaluate(&cfg, &mut st, &s(cpu, i * 1000)).is_some();
            if now != last {
                changes += 1;
                last = now;
            }
        }
        assert_eq!(changes, 1, "oscilar em volta de 92% não liga e desliga a pausa");
    }

    #[test]
    fn rules_off_by_default_and_battery_memory_hysteresis() {
        let mut st = ProtectionState::default();
        let mut hot = s(99.0, 0);
        hot.battery = Some(Battery { percent: 5.0, charging: false, on_ac: false });
        hot.memory = 99.0;
        assert_eq!(evaluate(&ProtectionConfig::default(), &mut st, &hot), None, "regras desligadas por padrão");
        let cfg = ProtectionConfig { pause_battery: true, pause_memory: true, ..Default::default() };
        let mut st = ProtectionState::default();
        let mut x = s(10.0, 0);
        x.battery = Some(Battery { percent: 15.0, charging: false, on_ac: false });
        assert!(evaluate(&cfg, &mut st, &x).unwrap().contains("Bateria"));
        x.battery = Some(Battery { percent: 25.0, charging: false, on_ac: false });
        assert!(evaluate(&cfg, &mut st, &x).is_some(), "25% ainda abaixo de 20% + margem");
        x.battery = Some(Battery { percent: 25.0, charging: true, on_ac: true });
        assert_eq!(evaluate(&cfg, &mut st, &x), None, "na tomada, retoma");
        x.memory = 91.0;
        assert!(evaluate(&cfg, &mut st, &x).unwrap().contains("Memória"));
        x.memory = 85.0;
        assert!(evaluate(&cfg, &mut st, &x).is_some());
        x.memory = 79.0;
        assert_eq!(evaluate(&cfg, &mut st, &x), None);
    }

    #[test]
    fn thermal_throttle_pauses_immediately_when_rule_is_on() {
        let cfg = ProtectionConfig { pause_hot: true, ..Default::default() };
        let mut st = ProtectionState::default();
        let mut x = s(40.0, 0);
        x.cpu_speed_limit = Some(70);
        assert!(evaluate(&cfg, &mut st, &x).unwrap().contains("limitando a CPU a 70%"));
    }

    #[test]
    fn real_sampler_returns_plausible_values() {
        let mut sm = Sampler::new();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        let x = sm.sample(1);
        assert!((0.0..=100.0).contains(&x.cpu) && (0.0..=100.0).contains(&x.memory));
        assert!(x.cores >= 1 && x.memory_total_gb > 0.5);
    }
}
