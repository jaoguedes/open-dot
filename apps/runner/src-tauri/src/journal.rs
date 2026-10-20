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
/// Garante a entrada de diretório no Unix. Não é prova de perda de energia do hardware.
pub fn sync_directory(dir:&Path)->Result<(),String> {
    #[cfg(unix)]
    fs::File::open(dir).and_then(|f|f.sync_all()).map_err(|_|"Não consegui confirmar a durabilidade do diretório.")?;
    #[cfg(not(unix))]
    let _=dir; // Executor Windows permanece bloqueado até validação nativa dessa fronteira.
    Ok(())
}
pub fn save(dir: &Path, j: &Journal) -> Result<(), String> {
    let bytes = serde_json::to_vec(j).map_err(|_| "Metadados de recuperação inválidos.")?;
    fs::create_dir_all(dir).map_err(|_| "Pasta de recuperação indisponível.")?;
    checkpoint(dir, j, None)?;
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
        .map_err(|_| "Não consegui confirmar a recuperação.")?;
    sync_directory(dir)
}
pub fn clear(dir: &Path) -> Result<(), String> {
    match fs::remove_file(dir.join("active-task.json")) {
        Ok(()) => sync_directory(dir),
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
/// Durable phase checkpoints survive removal of the active journal. Metadata only;
/// no credential, prompt, file content, command or execution authorization.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Checkpoint {
    pub schema_version: u8,
    pub journal: Journal,
    pub base_sha: Option<String>,
    pub head_sha: Option<String>,
    pub branch: Option<String>,
    pub terminal_receipt: Option<String>,
}
pub fn checkpoint(dir: &Path, j: &Journal, receipt: Option<&str>) -> Result<(), String> {
    if !identifier(&j.task) || !identifier(&j.project) || !identifier(&j.device) || j.seq > 500 {
        return Err("Checkpoint com identidade inválida.".into());
    }
    if receipt.is_some_and(|r| !["completed", "failed", "cancelled", "uncertain"].contains(&r)) {
        return Err("Recibo de checkpoint inválido.".into());
    }
    let store = dir.join("task-checkpoints");
    fs::create_dir_all(&store).map_err(|_| "Checkpoint indisponível.")?;
    let destination = store.join(format!("{}.json", j.task));
    match fs::File::open(&destination) {
        Ok(file) => {
            let mut bytes = Vec::new();
            file.take(8193).read_to_end(&mut bytes).map_err(|_| "Checkpoint anterior ilegível.")?;
            if bytes.len() > 8192 { return Err("Checkpoint excedeu limite; preserve para revisão.".into()); }
            let prior: Checkpoint = serde_json::from_slice(&bytes).map_err(|_| "Checkpoint anterior inválido; preserve para revisão.")?;
            if prior.schema_version != 1 || prior.journal.task != j.task || prior.journal.project != j.project || prior.journal.device != j.device || prior.journal.seq > j.seq {
                return Err("Checkpoint divergente; preserve para revisão.".into());
            }
            if let Some(terminal) = &prior.terminal_receipt {
                return if receipt == Some(terminal.as_str()) || (receipt.is_none() && prior.journal.phase == j.phase && prior.journal.proposal_hash == j.proposal_hash) { Ok(()) } else { Err("Checkpoint terminal não pode ser reaberto.".into()) };
            }
            if prior.journal.phase == j.phase && receipt.is_none() { return Ok(()); }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Checkpoint anterior ilegível.".into()),
    }
    let root = dir.join("worktrees").join(&j.task);
    let (base_sha, head_sha, branch) = if root.exists() {
        crate::worktree::verify_owner(&dir.join("worktrees"), &j.task, &j.project)?;
        let ownership: serde_json::Value = serde_json::from_slice(&fs::read(dir.join("worktrees").join(".ownership").join(format!("{}.json", j.task))).map_err(|_| "Ownership indisponível.")?).map_err(|_| "Ownership inválido.")?;
        let base = ownership["base"].as_str().ok_or("Base de checkpoint ausente.")?.to_string();
        let head = String::from_utf8(crate::worktree::git(&root, &["rev-parse", "HEAD"], 4096)?).map_err(|_| "HEAD ilegível.")?.trim().to_string();
        let branch = crate::worktree::git(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"], 4096).ok().and_then(|b| String::from_utf8(b).ok()).map(|b| b.trim().to_string()).unwrap_or_else(|| "detached".into());
        (Some(base), Some(head), Some(branch))
    } else { (None, None, None) };
    let value = Checkpoint { schema_version: 1, journal: j.clone(), base_sha, head_sha, branch, terminal_receipt: receipt.map(str::to_string) };
    let bytes = serde_json::to_vec(&value).map_err(|_| "Checkpoint inválido.")?;
    if bytes.len() > 8192 { return Err("Checkpoint excede limite.".into()); }
    use std::io::Write;
    let temp = store.join(format!(".checkpoint-{}.tmp", rand::random::<u64>()));
    let mut options = fs::OpenOptions::new(); options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&temp).map_err(|_| "Checkpoint temporário indisponível.")?;
    file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|_| "Checkpoint não persistido.")?;
    fs::rename(temp, destination).map_err(|_| "Checkpoint não confirmado.")?;
    sync_directory(&store)?; sync_directory(dir)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointSummary { pub task: String, pub phase: String, pub head_sha: Option<String>, pub terminal_receipt: Option<String> }
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointInventory { pub items: Vec<CheckpointSummary>, pub unreadable: usize, pub truncated: bool }
/// Bounded diagnostics. Invalid records are reported, never used as execution authority.
pub fn inventory(dir: &Path) -> CheckpointInventory {
    let mut out = CheckpointInventory::default();
    let entries = match fs::read_dir(dir.join("task-checkpoints")) {
        Ok(entries) => entries, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return out,
        Err(_) => { out.unreadable = 1; return out; }
    };
    for (count, entry) in entries.enumerate() {
        if count >= 50 { out.truncated = true; break; }
        let value = (|| -> Option<Checkpoint> {
            let entry = entry.ok()?;
            if !entry.file_type().ok()?.is_file() { return None; }
            let file = fs::File::open(entry.path()).ok()?;
            let mut bytes = Vec::new(); file.take(8193).read_to_end(&mut bytes).ok()?;
            if bytes.len() > 8192 { return None; }
            let value: Checkpoint = serde_json::from_slice(&bytes).ok()?;
            if value.schema_version != 1 || !identifier(&value.journal.task) || entry.file_name().to_str()? != format!("{}.json", value.journal.task) { return None; }
            Some(value)
        })();
        if let Some(value) = value { out.items.push(CheckpointSummary { task: value.journal.task, phase: value.journal.phase, head_sha: value.head_sha, terminal_receipt: value.terminal_receipt }); }
        else { out.unreadable += 1; }
    }
    out.items.sort_by(|a,b| a.task.cmp(&b.task)); out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persistent_checkpoint_has_observed_git_and_preserves_terminal_receipt() {
        let dir = std::env::temp_dir().join(format!("od-checkpoint-{}", rand::random::<u64>()));
        let project = dir.join("project"); fs::create_dir_all(&project).unwrap();
        crate::worktree::git(&project, &["init"], 4096).unwrap();
        fs::write(project.join("README.md"), "# Synthetic fixture\n").unwrap();
        crate::worktree::git(&project, &["add", "README.md"], 4096).unwrap();
        crate::worktree::git(&project, &["-c", "user.name=Open Dot Test", "-c", "user.email=test@example.invalid", "commit", "--no-gpg-sign", "-m", "Fixture"], 4096).unwrap();
        let project = project.canonicalize().unwrap();
        let mut j = Journal { task: "f11c1820-5a7c-47e9-90d4-22c78ed0ca21".into(), device: "f11c1820-5a7c-47e9-90d4-22c78ed0ca22".into(), project: crate::worktree::project_id(&project), phase: "preparing".into(), proposal_hash: None, seq: 0 };
        save(&dir, &j).unwrap();
        crate::worktree::create(&project, &dir.join("worktrees"), &j.task, true).unwrap();
        j.phase = "proposing".into(); j.seq = 1; save(&dir, &j).unwrap();
        let path = dir.join("task-checkpoints").join(format!("{}.json", j.task));
        let c: Checkpoint = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(c.base_sha, c.head_sha); assert_eq!(c.head_sha.unwrap().len(), 40); assert_eq!(c.branch.as_deref(), Some("detached"));
        j.phase = "applied".into(); j.proposal_hash = Some("a".repeat(64)); j.seq = 4; save(&dir, &j).unwrap();
        checkpoint(&dir, &j, Some("completed")).unwrap();
        clear(&dir).unwrap(); assert!(load(&dir).unwrap().is_none());
        let c: Checkpoint = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap(); assert_eq!(c.terminal_receipt.as_deref(), Some("completed"));
        let items = inventory(&dir); assert_eq!(items.items.len(), 1); assert_eq!(items.items[0].terminal_receipt.as_deref(), Some("completed"));
        fs::write(dir.join("task-checkpoints").join("corrupt.json"), "fixture corrupt").unwrap();
        assert_eq!(inventory(&dir).unreadable, 1);
        // Same journal can be restored only to reconcile the already confirmed remote result.
        save(&dir, &j).unwrap();
        let before = fs::read(dir.join("active-task.json")).unwrap();
        j.phase = "proposing".into();
        assert!(save(&dir, &j).is_err()); assert_eq!(fs::read(dir.join("active-task.json")).unwrap(), before);
        assert!(checkpoint(&dir, &j, Some("cancelled")).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
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
        let checkpoint: Checkpoint = serde_json::from_slice(&fs::read(dir.join("task-checkpoints").join(format!("{}.json", j.task))).unwrap()).unwrap();
        assert_eq!(checkpoint.journal.phase, "awaiting_approval");
        assert!(checkpoint.head_sha.is_none());
        fs::remove_dir_all(dir).unwrap();
    }
}
