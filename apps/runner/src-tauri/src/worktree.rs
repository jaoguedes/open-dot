use crate::process;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::Duration,
};
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn project_id(path: &Path) -> String {
    let digest = Sha256::digest(path.to_string_lossy().as_bytes());
    let mut b = [0u8; 16];
    b.copy_from_slice(&digest[..16]);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    let hex = b.iter().map(|v| format!("{v:02x}")).collect::<String>();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    )
}
pub fn git(root: &Path, args: &[&str], cap: usize) -> Result<Vec<u8>, String> {
    let mut cmd = process::command(Path::new("git"));
    cmd.args([
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "protocol.file.allow=never",
        "-C",
    ])
    .arg(root)
    .args(args);
    // Os argumentos vêm de código do host. Não há shell nem comando fornecido pelo modelo.
    process::bounded(cmd, Duration::from_secs(20), cap).map_err(|_| {
        "Git recusou a operação. Escolha a raiz de um repositório com ao menos um commit.".into()
    })
}
pub fn create(project: &Path, store: &Path, task: &str) -> Result<PathBuf, String> {
    if task.len() != 36 || !task.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
        return Err("Identificador de tarefa inválido.".into());
    }
    let project = project
        .canonicalize()
        .map_err(|_| "Pasta autorizada indisponível.")?;
    let root = String::from_utf8(git(&project, &["rev-parse", "--show-toplevel"], 4096)?)
        .map_err(|_| "Raiz Git inválida.")?;
    if Path::new(root.trim()).canonicalize().ok().as_ref() != Some(&project) {
        return Err("Autorize a raiz exata do projeto Git no Runner.".into());
    }
    fs::create_dir_all(store).map_err(|_| "Não consegui preparar a pasta isolada.")?;
    let destination = store.join(task);
    if destination.exists() {
        return Err("A pasta isolada já existe. Não vou repetir a tarefa.".into());
    }
    let text = destination
        .to_str()
        .ok_or("Caminho de projeto incompatível.")?;
    // --no-checkout evita smudge/process filters e hooks do checkout.
    git(
        &project,
        &["worktree", "add", "--no-checkout", "--detach", text, "HEAD"],
        16384,
    )?;
    git(&destination, &["read-tree", "HEAD"], 16384)?;
    let archive = git(
        &project,
        &["archive", "--format=tar", "HEAD"],
        32 * 1024 * 1024,
    )?;
    let mut archive = tar::Archive::new(std::io::Cursor::new(archive));
    let mut total = 0u64;
    let mut count = 0;
    for entry in archive.entries().map_err(|_| "Snapshot Git inválido.")? {
        let mut entry = entry.map_err(|_| "Snapshot Git ilegível.")?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .map_err(|_| "Caminho inválido no snapshot.")?
            .into_owned();
        if relative.is_absolute()
            || relative
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err("Snapshot tenta sair do worktree.".into());
        }
        let Some(name) = relative.to_str() else {
            continue;
        };
        // Nunca materializar credenciais ou áreas de configuração de agentes.
        let forbidden = relative.components().any(|c| {
            let c = c.as_os_str().to_string_lossy().to_lowercase();
            matches!(
                c.as_str(),
                ".git" | ".aws" | ".codex" | ".agents" | ".ssh" | ".dev.vars" | "auth.json"
            ) || c.starts_with(".env")
                || c.ends_with(".pem")
                || c.ends_with(".key")
        });
        if forbidden {
            continue;
        }
        let size = entry.size();
        total += size;
        count += 1;
        if total > 32 * 1024 * 1024 || count > 5000 {
            return Err("Snapshot excede 32 MB ou 5000 arquivos no modo seguro inicial.".into());
        }
        let path = destination.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|_| "Não consegui preparar o snapshot.")?;
        }
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|_| "Snapshot repetiu um arquivo ou caminho protegido.")?;
        std::io::copy(&mut entry, &mut file)
            .map_err(|_| "Não consegui materializar o snapshot.")?;
    }
    destination
        .canonicalize()
        .map_err(|_| "Não consegui confirmar o isolamento.".into())
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Edit {
    pub path: String,
    pub content: String,
    pub before_hash: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proposal {
    pub summary: String,
    pub files: Vec<Edit>,
}
pub fn relative_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty()
        || path.len() > 240
        || path.contains('\\')
        || path.contains(':')
        || path.chars().any(char::is_control)
    {
        return Err("Caminho de arquivo inválido.".into());
    }
    let p = Path::new(path);
    if p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("A proposta tenta sair do projeto.".into());
    }
    for c in path.split('/') {
        let c = c.to_ascii_lowercase();
        if c.starts_with('.')
            || matches!(c.as_str(), "node_modules" | "target" | "vendor")
            || c.ends_with(".pem")
            || c.ends_with(".key")
            || c == "credentials"
            || c == "auth.json"
        {
            return Err("A proposta inclui arquivo protegido. Esse modo não altera credenciais ou diretórios ocultos.".into());
        }
    }
    Ok(p.into())
}
fn target(root: &Path, path: &str) -> Result<PathBuf, String> {
    let relative = relative_path(path)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(m) if m.file_type().is_symlink() => {
                return Err("Symlink não autorizado na proposta.".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Não consegui verificar o arquivo.".into()),
        }
    }
    Ok(root.join(relative))
}
pub fn prepare(root: &Path, mut proposal: Proposal) -> Result<Proposal, String> {
    if proposal.files.is_empty() || proposal.files.len() > 8 || proposal.summary.len() > 1200 {
        return Err("A proposta excedeu os limites de edição.".into());
    }
    let mut seen = std::collections::HashSet::new();
    let mut total = 0;
    for edit in &mut proposal.files {
        if !seen.insert(edit.path.to_lowercase()) {
            return Err("A proposta repete um caminho de arquivo.".into());
        }
        total += edit.content.len();
        if total > 8000 || edit.content.contains('\0') {
            return Err("Proposta grande ou binária: limite total de 8 KB nesta beta.".into());
        }
        let path = target(root, &edit.path)?;
        edit.before_hash = match fs::read(&path) {
            Ok(b) if b.len() <= 128000 => Some(hash(&b)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            _ => return Err("Não consegui verificar a versão inicial do arquivo.".into()),
        };
    }
    Ok(proposal)
}
pub fn apply(root: &Path, proposal: &Proposal) -> Result<(), String> {
    // Antes de qualquer escrita, validar todos os arquivos e a versão apresentada na aprovação.
    let root = root.canonicalize().map_err(|_| "Worktree indisponível.")?;
    let validated = prepare(&root, proposal.clone())?;
    for (original, current) in proposal.files.iter().zip(&validated.files) {
        if original.before_hash != current.before_hash
            && current.before_hash != Some(hash(original.content.as_bytes()))
        {
            return Err("O arquivo mudou após a proposta. Gere uma nova aprovação.".into());
        }
    }
    for edit in &proposal.files {
        let path = target(&root, &edit.path)?;
        if fs::read(&path).ok().as_deref() == Some(edit.content.as_bytes()) {
            continue;
        }
        let parent = path.parent().ok_or("Destino inválido.")?;
        fs::create_dir_all(parent).map_err(|_| "Não consegui preparar o destino aprovado.")?;
        if !parent
            .canonicalize()
            .map_err(|_| "Destino indisponível.")?
            .starts_with(&root)
        {
            return Err("Destino fora do worktree.".into());
        }
        // O diretório pertence só ao host; ferramentas do modelo têm somente leitura.
        let temporary = parent.join(format!(".open-dot-write-{}", hash(edit.path.as_bytes())));
        use std::io::Write;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "Escrita incompleta anterior encontrada. Revise o worktree.")?;
        file.write_all(edit.content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|_| "Falha ao gravar o conteúdo aprovado.")?;
        fs::rename(&temporary, &path).map_err(|_| "Não consegui aplicar o arquivo aprovado.")?;
    }
    Ok(())
}
pub fn context(root: &Path) -> Result<String, String> {
    let list = git(root, &["ls-files", "-z"], 128000)?;
    let mut files = Vec::new();
    let mut total = 0usize;
    for name in list
        .split(|b| *b == 0)
        .filter_map(|b| std::str::from_utf8(b).ok())
        .filter(|s| !s.is_empty())
    {
        if relative_path(name).is_err() {
            continue;
        }
        let ext = Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        if ![
            "md", "ts", "tsx", "js", "jsx", "json", "css", "html", "py", "rs",
        ]
        .contains(&ext)
        {
            continue;
        }
        let path = target(root, name)?;
        let Ok(meta) = fs::metadata(&path) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 6000 {
            continue;
        }
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        // Não anexar arquivos com marcadores comuns de credenciais. Não é DLP completo.
        if ["PRIVATE KEY", "sk-proj-", "github_pat_", "GOCSPX-"]
            .iter()
            .any(|p| text.contains(p))
        {
            continue;
        }
        total += text.len();
        if total > 24000 || files.len() >= 16 {
            break;
        }
        files.push(serde_json::json!({"path":name,"content":text}));
    }
    serde_json::to_string(&files).map_err(|_| "Contexto inválido.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths() {
        for path in [
            "../escape",
            "/root",
            "a/../x",
            "a\\x",
            ".git/config",
            "docs/.env",
            "x.pem",
            "auth.json",
            "C:/x",
        ] {
            assert!(relative_path(path).is_err(), "{path}");
        }
        assert!(relative_path("src/main.ts").is_ok());
    }
    #[test]
    fn approved_changes_refuse_stale_and_symlinks() {
        let root = std::env::temp_dir().join(format!("od-edits-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("file.txt"), "before").unwrap();
        let proposal = prepare(
            &root,
            Proposal {
                summary: "test".into(),
                files: vec![Edit {
                    path: "file.txt".into(),
                    content: "after".into(),
                    before_hash: None,
                }],
            },
        )
        .unwrap();
        fs::write(root.join("file.txt"), "changed").unwrap();
        assert!(apply(&root, &proposal).is_err());
        assert_eq!(
            fs::read_to_string(root.join("file.txt")).unwrap(),
            "changed"
        );
        fs::write(root.join("file.txt"), "before").unwrap();
        apply(&root, &proposal).unwrap();
        apply(&root, &proposal).unwrap();
        assert_eq!(fs::read_to_string(root.join("file.txt")).unwrap(), "after");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("file.txt"), root.join("link")).unwrap();
            assert!(prepare(
                &root,
                Proposal {
                    summary: "test".into(),
                    files: vec![Edit {
                        path: "link".into(),
                        content: "oops".into(),
                        before_hash: None
                    }]
                }
            )
            .is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn resume_partial_application_preserves_exact_approval() {
        let root = std::env::temp_dir().join(format!("od-resume-{}", rand::random::<u64>()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("one.txt"), "old").unwrap();
        let proposal = prepare(
            &root,
            Proposal {
                summary: "two exact files".into(),
                files: vec![
                    Edit {
                        path: "one.txt".into(),
                        content: "approved one".into(),
                        before_hash: None,
                    },
                    Edit {
                        path: "two.txt".into(),
                        content: "approved two".into(),
                        before_hash: None,
                    },
                ],
            },
        )
        .unwrap();
        // Reinício após a primeira escrita: não rejeitar nem duplicar o efeito já aprovado.
        fs::write(root.join("one.txt"), "approved one").unwrap();
        apply(&root, &proposal).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("two.txt")).unwrap(),
            "approved two"
        );
        // Uma alteração externa posterior bloqueia toda a reaplicação.
        fs::write(root.join("two.txt"), "external change").unwrap();
        assert!(apply(&root, &proposal).is_err());
        assert_eq!(
            fs::read_to_string(root.join("two.txt")).unwrap(),
            "external change"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
