// SPDX-License-Identifier: AGPL-3.0-only
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Settings {
    pub folders: Vec<PathBuf>,
    /// Ajustes do Runner companheiro (v0.3). Ausente no arquivo antigo = padrões seguros.
    #[serde(default)]
    pub companion: Companion,
}

/// Tudo que liga rede, inicialização automática, notificação ou encerra processo começa desligado.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Companion {
    pub setup_done: bool,
    /// `None` = ainda não respondeu: nenhuma consulta de atualização pela rede.
    pub update_consent: Option<bool>,
    pub autostart: bool,
    pub show_in_dock: bool,
    /// "leve", "equilibrado" ou "maximo"; `None` = usar o sugerido pelo hardware.
    pub profile: Option<String>,
    pub protection: crate::health::ProtectionConfig,
    /// Em bateria, usar o perfil Leve (com permissão; padrão ligado).
    pub light_on_battery: bool,
    pub auto_cleanup: bool,
    pub cleanup_hours: u32,
    pub notifications: bool,
    /// Pausa manual da fila pelo dono (independe das regras de proteção).
    pub queue_paused: bool,
}

impl Default for Companion {
    fn default() -> Self {
        Self {
            setup_done: false,
            update_consent: None,
            autostart: false,
            show_in_dock: true,
            profile: None,
            protection: crate::health::ProtectionConfig::default(),
            light_on_battery: true,
            auto_cleanup: false,
            cleanup_hours: 8,
            notifications: false,
            queue_paused: false,
        }
    }
}

/// Resolver symlinks antes de comparar. Não concede acesso de leitura/escrita.
pub fn canonical_folder(path: &Path) -> Result<PathBuf, String> {
    let path = path
        .canonicalize()
        .map_err(|_| "Pasta indisponível.".to_string())?;
    if !path.is_dir() || path.parent().is_none() {
        return Err("Escolha uma pasta de projeto, não a raiz do disco.".into());
    }
    Ok(path)
}

impl Settings {
    pub fn grant(&mut self, path: PathBuf) -> Result<(), String> {
        let path = canonical_folder(&path)?;
        if self.folders.contains(&path) {
            return Ok(());
        }
        if self.folders.len() >= 20 {
            return Err("Limite de 20 pastas.".into());
        }
        self.folders.push(path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_settings_file_gets_safe_companion_defaults() {
        let s: Settings = serde_json::from_str(r#"{"folders":[]}"#).unwrap();
        assert_eq!(s.companion, Companion::default());
        assert_eq!(s.companion.update_consent, None, "sem resposta, sem rede");
        assert!(!s.companion.autostart && !s.companion.auto_cleanup && !s.companion.notifications && !s.companion.protection.pause_hot);
        assert!(s.companion.show_in_dock);
    }
    #[test]
    fn refuses_missing_folder_and_disk_root() {
        assert!(canonical_folder(Path::new("/open-dot-folder-does-not-exist")).is_err());
        #[cfg(unix)]
        assert!(canonical_folder(Path::new("/")).is_err());
    }
    #[test]
    fn grants_existing_folder_once() {
        let mut settings = Settings::default();
        let path = std::env::temp_dir();
        settings.grant(path.clone()).unwrap();
        settings.grant(path).unwrap();
        assert_eq!(settings.folders.len(), 1);
    }
    #[test]
    fn refuses_file() {
        let path = std::env::temp_dir().join(format!("od-policy-{}", std::process::id()));
        std::fs::write(&path, b"test").unwrap();
        assert!(canonical_folder(&path).is_err());
        std::fs::remove_file(path).unwrap();
    }
}
