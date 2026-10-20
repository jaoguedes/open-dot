//! Apenas metadados locais: sem prompt, conteúdo de arquivo, token ou resposta do modelo.
use serde::{Deserialize, Serialize};
use std::{fs, io::Read, path::Path};
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Journal {
    pub task: String,
    pub device: String,
    pub project: String,
    pub phase: String,
    pub proposal_hash: Option<String>,
    pub seq: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub phase: String,
    pub resumable: bool,
}
fn identifier(s: &str) -> bool {
    s.len() == 36 && s.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}
pub fn load(dir: &Path) -> Result<Option<Journal>, String> {
    let path = dir.join("active-task.json");
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Recuperação local indisponível. Execução bloqueada.".into()),
    };
    let mut data = Vec::new();
    file.take(4097)
        .read_to_end(&mut data)
        .map_err(|_| "Não consegui ler os metadados de recuperação.")?;
    if data.len() > 4096 {
        return Err("Journal local excedeu o limite. Execução bloqueada.".into());
    }
    let j: Journal = serde_json::from_slice(&data)
        .map_err(|_| "Journal inválido. Preserve o worktree e revise a recuperação local.")?;
    if !identifier(&j.task)
        || !identifier(&j.device)
        || !identifier(&j.project)
        || j.seq > 500
        || ![
            "preparing",
            "proposing",
            "awaiting_approval",
            "applying",
            "applied",
        ]
        .contains(&j.phase.as_str())
        || j.proposal_hash
            .as_ref()
            .is_some_and(|h| h.len() != 64 || !h.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err("Journal incompatível. Execução bloqueada.".into());
    }
    Ok(Some(j))
}
pub fn save(dir: &Path, j: &Journal) -> Result<(), String> {
    let bytes = serde_json::to_vec(j).map_err(|_| "Metadados de recuperação inválidos.")?;
    fs::create_dir_all(dir).map_err(|_| "Pasta de recuperação indisponível.")?;
    let temp = dir.join(format!(".active-task-{}.tmp", rand::random::<u64>()));
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| "Não consegui preparar a recuperação.")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_| "Não consegui proteger o journal.")?;
    }
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Não consegui salvar a recuperação.")?;
    fs::rename(&temp, dir.join("active-task.json"))
        .map_err(|_| "Não consegui confirmar a recuperação.".into())
}
pub fn clear(dir: &Path) -> Result<(), String> {
    match fs::remove_file(dir.join("active-task.json")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Não consegui concluir a recuperação local.".into()),
    }
}
pub fn summary(dir: &Path) -> Option<Summary> {
    load(dir).ok().flatten().map(|j| Summary {
        id: j.task,
        phase: j.phase,
        resumable: j.proposal_hash.is_some(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_metadata() {
        let dir = std::env::temp_dir().join(format!("od-journal-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let j = Journal {
            task: "f11c1820-5a7c-47e9-90d4-22c78ed0ca21".into(),
            device: "f11c1820-5a7c-47e9-90d4-22c78ed0ca22".into(),
            project: "f11c1820-5a7c-47e9-90d4-22c78ed0ca23".into(),
            phase: "awaiting_approval".into(),
            proposal_hash: Some("a".repeat(64)),
            seq: 3,
        };
        save(&dir, &j).unwrap();
        assert_eq!(load(&dir).unwrap().unwrap().seq, 3);
        assert!(summary(&dir).unwrap().resumable);
        fs::write(dir.join("active-task.json"), b"invalid").unwrap();
        assert!(load(&dir).is_err());
        clear(&dir).unwrap();
        fs::remove_dir(dir).unwrap();
    }
}
