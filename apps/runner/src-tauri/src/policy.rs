use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Settings {
    pub folders: Vec<PathBuf>,
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
