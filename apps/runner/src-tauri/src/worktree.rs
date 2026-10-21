// SPDX-License-Identifier: AGPL-3.0-only
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
/// Comando Git do host. Ignora configuração global e de sistema (filtros de conteúdo,
/// LFS, includes) além dos hooks: `git archive` aplicaria filtros definidos fora do projeto.
fn git_command(root: &Path, args: &[&str]) -> std::process::Command {
    let mut cmd = process::command(Path::new(if cfg!(unix) { "/usr/bin/git" } else { "git" }));
    cmd.env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", if cfg!(windows) { "NUL" } else { "/dev/null" });
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
    cmd
}
pub fn git(root: &Path, args: &[&str], cap: usize) -> Result<Vec<u8>, String> {
    // Os argumentos vêm de código do host. Não há shell nem comando fornecido pelo modelo.
    process::bounded(git_command(root, args), Duration::from_secs(20), cap).map_err(|_| {
        "Git recusou a operação. Escolha a raiz de um repositório com ao menos um commit.".into()
    })
}
pub fn create(project: &Path, store: &Path, task: &str, consent: bool) -> Result<PathBuf, String> {
    if !consent { return Err("Autorize a preparação de worktree antes de alterar metadados Git.".into()); }
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
    let base=String::from_utf8(git(&project,&["rev-parse","HEAD"],4096)?).map_err(|_|"Commit inválido.")?;
    let base=base.trim();
    // Preparação que pode falhar ocorre antes de mexer nos metadados compartilhados.
    let archive=git(&project,&["archive","--format=tar",base],32*1024*1024)?;
    let ownership=store.join(".ownership");fs::create_dir_all(&ownership).map_err(|_|"Ownership indisponível.")?;
    let record=ownership.join(format!("{task}.json"));
    let bytes=serde_json::to_vec(&serde_json::json!({"version":1,"task":task,"project":project_id(&project),"base":base,"consent":true,"state":"preparing-or-preserved"})).map_err(|_|"Ownership inválido.")?;
    use std::io::Write;
    let mut owner=fs::OpenOptions::new().write(true).create_new(true).open(record).map_err(|_|"Ownership anterior encontrado. Não repetir ou remover o worktree.")?;
    #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;owner.set_permissions(fs::Permissions::from_mode(0o600)).map_err(|_|"Ownership sem proteção.")?;}
    owner.write_all(&bytes).and_then(|_|owner.sync_all()).map_err(|_|"Falha ao preservar ownership.")?;
    crate::journal::sync_directory(&ownership)?;crate::journal::sync_directory(store)?;
    // Sem limpeza automática: falhas intermediárias preservam ownership e arquivos para revisão.
    git(&project,&["worktree","add","--no-checkout","--detach",text,base],16384)?;
    git(&destination,&["read-tree",base],16384)?;
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
/// Prova de ownership é local ao host; não autoriza apagar arquivos nem limpar metadata.
pub fn verify_owner(store:&Path,task:&str,project:&str)->Result<(),String> {
    let bytes=fs::read(store.join(".ownership").join(format!("{task}.json"))).map_err(|_|"Ownership ausente; preserve e revise o worktree.")?;
    if bytes.len()>4096{return Err("Ownership inválido.".into());}
    let v:serde_json::Value=serde_json::from_slice(&bytes).map_err(|_|"Ownership inválido.")?;
    if v["version"]!=1 || v["task"]!=task || v["project"]!=project || v["consent"]!=true {
        return Err("Worktree pertence a outro escopo. Recuperação bloqueada.".into());
    }
    Ok(())
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Edit {
    pub path: String,
    pub content: String,
    pub before_hash: Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub before_content: Option<String>,
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
fn bounded_file(path:&Path)->Result<Option<Vec<u8>>,String> {
    use std::io::Read;
    let file=match fs::File::open(path){Ok(f)=>f,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(_)=>return Err("Arquivo de revisão indisponível.".into())};
    let mut bytes=Vec::new();file.take(8001).read_to_end(&mut bytes).map_err(|_|"Arquivo ilegível.")?;
    if bytes.len()>8000{return Err("Arquivo excedeu limite de revisão de 8 KB.".into());}
    Ok(Some(bytes))
}
/// Read-only postcondition used for explicit Git checkpoint consent.
pub fn verify_applied(root:&Path,proposal:&Proposal)->Result<(),String> {
    if proposal.files.is_empty() || proposal.files.len()>8 || proposal.files.iter().map(|f|f.content.len()).sum::<usize>()>8000 {return Err("Proposta fora do limite.".into());}
    let mut paths=std::collections::HashSet::new();
    for file in &proposal.files {
        if !paths.insert(file.path.to_lowercase()) {return Err("Caminho duplicado.".into());}
        let compact:String=file.content.to_lowercase().chars().filter(|c|!c.is_whitespace() && *c!='\"' && *c!='\'').collect();
        if ["PRIVATE KEY","sk-proj-","github_pat_","ghp_","GOCSPX-","Bearer "].iter().any(|p|file.content.contains(p)) || ["password=","password:","api_key=","api_key:","token=","secret="].iter().any(|p|compact.contains(p)) {return Err("Padrão sensível no conteúdo. Commit bloqueado.".into());}
        let current=bounded_file(&target(root,&file.path)?)?.ok_or("Arquivo aprovado ausente.")?;
        if current!=file.content.as_bytes() {return Err("Arquivo mudou após revisão. Commit bloqueado.".into());}
    }
    Ok(())
}
pub fn prepare(root: &Path, mut proposal: Proposal) -> Result<Proposal, String> {
    if proposal.files.is_empty() || proposal.files.len() > 8 || proposal.summary.len() > 1200 {
        return Err("A proposta excedeu os limites de edição.".into());
    }
    let mut seen = std::collections::HashSet::new();
    let mut total = 0;
    let mut total_before = 0;
    for edit in &mut proposal.files {
        if !seen.insert(edit.path.to_lowercase()) {
            return Err("A proposta repete um caminho de arquivo.".into());
        }
        total += edit.content.len();
        if total > 8000 || edit.content.contains('\0') {
            return Err("Proposta grande ou binária: limite total de 8 KB nesta beta.".into());
        }
        let path = target(root, &edit.path)?;
        edit.before_content=None;
        edit.before_hash = match bounded_file(&path)? {
            Some(b) => {
                total_before+=b.len();
                if total_before>8000{return Err("Conteúdo anterior excedeu o limite de revisão.".into());}
                edit.before_content=Some(String::from_utf8(b.clone()).map_err(|_|"Arquivo binário não pode ser aprovado neste modo.")?);
                Some(hash(&b))
            },
            None => None,
        };
    }
    Ok(proposal)
}
pub fn apply(root: &Path, proposal: &Proposal) -> Result<(), String> {
    // Antes de qualquer escrita, validar todos os arquivos e a versão apresentada na aprovação.
    let root = root.canonicalize().map_err(|_| "Worktree indisponível.")?;
    if proposal.files.is_empty() || proposal.files.len()>8 || proposal.summary.len()>1200 {return Err("Proposta fora dos limites.".into());}
    let mut seen=std::collections::HashSet::new();let mut after_bytes=0;let mut before_bytes=0;
    for edit in &proposal.files {
        after_bytes+=edit.content.len();before_bytes+=edit.before_content.as_ref().map_or(0,|v|v.len());
        if !seen.insert(edit.path.to_lowercase()) || edit.content.contains('\0') || after_bytes>8000 || before_bytes>8000 {return Err("Proposta fora dos limites de revisão.".into());}
        if edit.before_content.as_ref().map(|v|hash(v.as_bytes()))!=edit.before_hash {return Err("Conteúdo anterior não corresponde à aprovação.".into());}
        let current=bounded_file(&target(&root,&edit.path)?)?;
        let current_hash=current.as_ref().map(|b|hash(b));
        if current_hash!=edit.before_hash && current_hash!=Some(hash(edit.content.as_bytes())) {return Err("O arquivo mudou após a proposta. Gere uma nova aprovação.".into());}
    }
    for edit in &proposal.files {
        let path = target(&root, &edit.path)?;
        let current=bounded_file(&path)?;
        if current.as_deref()==Some(edit.content.as_bytes()){continue;}
        if current.as_ref().map(|b|hash(b))!=edit.before_hash{return Err("Arquivo alterado durante a aplicação; preserve o worktree para revisão.".into());}
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
        let mut directory=parent;
        loop {
            crate::journal::sync_directory(directory)?;
            if directory==root {break;}
            directory=directory.parent().filter(|p|p.starts_with(&root)).ok_or("Diretório fora do escopo.")?;
        }
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
    fn metadata_requires_consent_and_preserves_owned_orphans() {
        let dir=std::env::temp_dir().join(format!("od-ownership-{}",rand::random::<u64>()));
        let project=dir.join("project");let store=dir.join("store");fs::create_dir_all(&project).unwrap();
        fs::write(project.join("file.txt"),"original").unwrap();git(&project,&["init"],16384).unwrap();git(&project,&["add","file.txt"],16384).unwrap();
        git(&project,&["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","--no-gpg-sign","-m","fixture"],16384).unwrap();
        let before=git(&project,&["worktree","list","--porcelain"],16384).unwrap();let task="f11c1820-5a7c-47e9-90d4-22c78ed0ca21";
        assert!(create(&project,&store,task,false).is_err());assert_eq!(git(&project,&["worktree","list","--porcelain"],16384).unwrap(),before);
        let root=create(&project,&store,task,true).unwrap();verify_owner(&store,task,&project_id(&project.canonicalize().unwrap())).unwrap();assert!(verify_owner(&store,task,"different-project").is_err());
        fs::write(root.join("valuable.txt"),"preserve owned uncommitted change").unwrap();assert!(create(&project,&store,task,true).is_err());
        assert_eq!(fs::read_to_string(root.join("valuable.txt")).unwrap(),"preserve owned uncommitted change");assert!(git(&project,&["status","--porcelain"],16384).unwrap().is_empty());
        // Só remove a fixture inteira criada pelo teste; nunca usa cleanup de worktree do produto.
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn recovery_accepts_mixed_before_and_after_at_review_budget() {
        let root=std::env::temp_dir().join(format!("od-mixed-budget-{}",rand::random::<u64>()));fs::create_dir_all(&root).unwrap();
        fs::write(root.join("second.txt"),"b".repeat(8000)).unwrap();
        let proposal=prepare(&root,Proposal{summary:"budget boundary".into(),files:vec![
            Edit{path:"first.txt".into(),content:"a".repeat(8000),before_hash:None,before_content:None},
            Edit{path:"second.txt".into(),content:String::new(),before_hash:None,before_content:None},
        ]}).unwrap();
        fs::write(root.join("first.txt"),"a".repeat(8000)).unwrap();
        apply(&root,&proposal).unwrap();assert_eq!(fs::read(root.join("second.txt")).unwrap(),b"");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn git_ignores_global_and_system_configuration() {
        let cmd = git_command(Path::new("/tmp"), &["archive", "HEAD"]);
        let envs: std::collections::HashMap<_, _> = cmd
            .get_envs()
            .filter_map(|(k, v)| Some((k.to_string_lossy().into_owned(), v?.to_string_lossy().into_owned())))
            .collect();
        assert_eq!(envs.get("GIT_CONFIG_NOSYSTEM").map(String::as_str), Some("1"));
        assert_eq!(envs.get("GIT_CONFIG_GLOBAL").map(String::as_str), Some(if cfg!(windows) { "NUL" } else { "/dev/null" }));
        for inherited in ["GIT_DIR", "GIT_EXEC_PATH", "GIT_SSH_COMMAND", "GIT_ASKPASS", "GIT_CONFIG_PARAMETERS"] {
            assert!(!envs.contains_key(inherited), "{inherited}");
        }
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert!(args.windows(2).any(|w| w[0] == "-c" && w[1] == "core.hooksPath=/dev/null"));
        assert!(args.windows(2).any(|w| w[0] == "-c" && w[1] == "core.fsmonitor=false"));
    }
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
                    before_content: None,
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
                        before_content: None,
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
                        before_content: None,
                        before_hash: None,
                    },
                    Edit {
                        path: "two.txt".into(),
                        content: "approved two".into(),
                        before_content: None,
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
