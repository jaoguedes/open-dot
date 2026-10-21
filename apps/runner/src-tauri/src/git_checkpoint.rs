// SPDX-License-Identifier: AGPL-3.0-only
//! Fixed Git plumbing only. Never stages the repository index, runs project hooks,
//! invokes a shell, pushes, merges, or chooses paths from a model command.
use crate::{journal, process, worktree};
use serde::{Deserialize, Serialize};
use std::{fs, io::{Read, Write}, path::{Path, PathBuf}, time::Duration};

pub const SUBJECT: &str = "feat(runner): checkpoint approved files";
pub fn trailer(task:&str)->String {format!("Task: OD2-{}\nRunner-Task: {}",task.chars().filter(|c|*c!='-').take(12).collect::<String>().to_uppercase(),task)}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all="camelCase")]
pub struct Receipt { pub version:u8, pub task:String, pub proposal_hash:String, pub base_sha:String, pub tree_sha:String, pub commit_sha:String, pub branch:String, pub stage:String }
fn valid_sha(s:&str)->bool { s.len()==40 && s.bytes().all(|b|b.is_ascii_hexdigit()) }
fn git(root:&Path,index:&Path,args:&[&str])->Result<Vec<u8>,String> {
    let mut cmd=process::command(Path::new(if cfg!(unix){"/usr/bin/git"}else{"git"}));
    cmd.env("GIT_CONFIG_NOSYSTEM","1").env("GIT_CONFIG_GLOBAL",if cfg!(windows){"NUL"}else{"/dev/null"}).env("GIT_INDEX_FILE",index)
      .args(["--literal-pathspecs","-c","core.hooksPath=/dev/null","-c","core.fsmonitor=false","-c","core.attributesFile=/dev/null","-c","core.autocrlf=false","-c","gc.auto=0","-c","maintenance.auto=false","-c","commit.gpgSign=false","-c","user.name=Open Dot Runner","-c","user.email=runner@example.invalid","-C"]).arg(root).args(args);
    process::bounded(cmd,Duration::from_secs(20),16384).map_err(|_|"Git checkpoint recusado. Preserve os arquivos e revise o estado.".into())
}
fn text(root:&Path,index:&Path,args:&[&str])->Result<String,String> { String::from_utf8(git(root,index,args)?).map(|s|s.trim().to_string()).map_err(|_|"Saída Git incompatível.".into()) }
fn read_json<T:serde::de::DeserializeOwned>(path:&Path)->Result<T,String> {
    let mut bytes=Vec::new();fs::File::open(path).map_err(|_|"Registro de checkpoint indisponível.")?.take(8193).read_to_end(&mut bytes).map_err(|_|"Registro ilegível.")?;
    if bytes.len()>8192{return Err("Registro excedeu o limite.".into());}
    serde_json::from_slice(&bytes).map_err(|_|"Registro inválido; preserve para revisão.".into())
}
fn persist(path:&Path,value:&Receipt)->Result<(),String> {
    let tmp=path.with_extension(format!("{}.tmp",rand::random::<u64>()));let mut opts=fs::OpenOptions::new();opts.write(true).create_new(true);
    #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;opts.mode(0o600);}
    let mut f=opts.open(&tmp).map_err(|_|"Não consegui preparar recibo Git.")?;
    f.write_all(&serde_json::to_vec(value).map_err(|_|"Recibo inválido.")?).and_then(|_|f.sync_all()).map_err(|_|"Recibo não persistido.")?;
    fs::rename(tmp,path).map_err(|_|"Recibo não confirmado.")?;journal::sync_directory(path.parent().ok_or("Pasta de recibo inválida.")?)
}
pub fn load_checkpoint(dir:&Path,task:&str)->Result<journal::Checkpoint,String> {
    if task.len()!=36 || !task.bytes().all(|b|b.is_ascii_hexdigit()||b==b'-'){return Err("Tarefa inválida.".into());}
    let cp:journal::Checkpoint=read_json(&dir.join("task-checkpoints").join(format!("{task}.json")))?;
    if cp.schema_version!=1 || cp.journal.task!=task || cp.terminal_receipt.as_deref()!=Some("completed") {return Err("Somente aplicação concluída com recibo pode solicitar commit.".into());}
    Ok(cp)
}
/// Validates selected bytes independently of the worktree's existing index. Does not grant consent.
pub fn validate(dir:&Path,cp:&journal::Checkpoint,proposal:&worktree::Proposal)->Result<PathBuf,String> {
    let serialized=serde_json::to_vec(proposal).map_err(|_|"Proposta inválida.")?;
    if cp.terminal_receipt.as_deref()!=Some("completed") || cp.journal.proposal_hash.as_deref()!=Some(worktree::hash(&serialized).as_str()) {return Err("Proposta difere do checkpoint confirmado.".into());}
    worktree::verify_owner(&dir.join("worktrees"),&cp.journal.task,&cp.journal.project)?;
    let store=dir.join("worktrees").canonicalize().map_err(|_|"Worktrees indisponíveis.")?;
    let root=store.join(&cp.journal.task).canonicalize().map_err(|_|"Worktree indisponível.")?;
    if root.parent()!=Some(store.as_path()){return Err("Worktree fora do escopo.".into());}
    let owner:serde_json::Value=read_json(&dir.join("worktrees").join(".ownership").join(format!("{}.json",cp.journal.task)))?;
    if owner["base"].as_str()!=cp.base_sha.as_deref() {return Err("Base difere do ownership da tarefa.".into());}
    let top=String::from_utf8(worktree::git(&root,&["rev-parse","--show-toplevel"],4096)?).map_err(|_|"Raiz Git inválida.")?;
    if Path::new(top.trim()).canonicalize().ok().as_ref()!=Some(&root){return Err("Raiz Git divergente do worktree autorizado.".into());}
    worktree::verify_applied(&root,proposal)?;
    Ok(root)
}
pub fn recorded_receipt(dir:&Path,cp:&journal::Checkpoint)->Option<Receipt> {
    let r:Receipt=read_json(&dir.join("git-checkpoints").join(format!("{}.json",cp.journal.task))).ok()?;
    if r.version!=1 || r.task!=cp.journal.task || r.base_sha!=cp.base_sha.as_deref()? || r.proposal_hash!=cp.journal.proposal_hash.as_deref()? || r.branch!=format!("agent/{}",cp.journal.task) || r.stage!="committed" || !valid_sha(&r.commit_sha){return None;}
    Some(r)
}
pub fn context(dir:&Path,task:&str,channel:&crate::channel::SharedChannel,folders:&[PathBuf])->Result<(journal::Checkpoint,worktree::Proposal),String> {
    let cp=load_checkpoint(dir,task)?;
    if crate::channel::identity(channel).as_deref()!=Some(cp.journal.device.as_str()) || !folders.iter().any(|p|worktree::project_id(p)==cp.journal.project) {return Err("Dispositivo ou pasta sem autorização atual.".into());}
    let approval=crate::channel::device_request(channel,&format!("/api/runner/device/tasks/{task}/approval"),None)?;
    if approval["state"]!="completed" || approval["decision"]!="approve" || approval["cancelRequested"]!=0 || approval["hash"].as_str()!=cp.journal.proposal_hash.as_deref() {return Err("Resultado remoto não comprova conteúdo aprovado neste checkpoint.".into());}
    let proposal:worktree::Proposal=serde_json::from_value(approval["proposal"].clone()).map_err(|_|"Proposta inválida.")?;
    validate(dir,&cp,&proposal)?;Ok((cp,proposal))
}
fn operation_lock(store:&Path,task:&str)->Result<fs::File,String> {
    let path=store.join(format!("{task}.lock"));let mut opts=fs::OpenOptions::new();opts.read(true).write(true).create(true);
    #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;opts.mode(0o600);}
    let mut file=opts.open(&path).map_err(|_|"Lock Git indisponível.")?;
    #[cfg(unix)] {use std::os::fd::AsRawFd;if unsafe{libc::flock(file.as_raw_fd(),libc::LOCK_EX|libc::LOCK_NB)}!=0{return Err("Checkpoint ocupado por outro processo.".into());}}
    let mut header=String::new();(&file).take(128).read_to_string(&mut header).map_err(|_|"Lock ilegível.")?;
    if header.is_empty(){file.write_all(b"Open Dot Git checkpoint lock v1\n").and_then(|_|file.sync_all()).map_err(|_|"Lock não persistido.")?;journal::sync_directory(store)?;}
    else if header!="Open Dot Git checkpoint lock v1\n"{return Err("Lock desconhecido; preserve para revisão.".into());}
    // Never unlink the inode: kernel ownership is released on close/crash, not by stealing a stale file.
    Ok(file)
}
fn finish_prepared(root:&Path,index:&Path,record:&Path,proposal:&worktree::Proposal,mut receipt:Receipt)->Result<Receipt,String> {
    let reference=format!("refs/heads/{}",receipt.branch);
    let details=text(root,index,&["show","-s","--format=%T%n%P%n%B",&receipt.commit_sha])?;
    let mut lines=details.splitn(3,'\n');
    if lines.next()!=Some(receipt.tree_sha.as_str()) || lines.next()!=Some(receipt.base_sha.as_str()) || lines.next().map(str::trim)!=Some(format!("{}\n\n{}",SUBJECT,trailer(&receipt.task)).as_str()) {return Err("Recibo Git não corresponde ao commit; revisão manual necessária.".into());}
    let changed=git(root,index,&["diff-tree","--no-ext-diff","--no-textconv","--no-commit-id","--name-only","-r","-z",&receipt.base_sha,&receipt.tree_sha])?;
    let paths:Vec<_>=changed.split(|b|*b==0).filter(|b|!b.is_empty()).collect();
    if paths.is_empty() || paths.iter().any(|p|!proposal.files.iter().any(|f|f.path.as_bytes()==*p)){return Err("Árvore Git inclui alterações não revisadas.".into());}
    for file in &proposal.files {
        let spec=format!("{}:{}",receipt.tree_sha,file.path);
        if git(root,index,&["cat-file","blob",&spec])?!=file.content.as_bytes(){return Err("Blob do commit difere da aprovação.".into());}
    }
    match text(root,index,&["rev-parse","--verify",&reference]) {
        Ok(current) if current==receipt.commit_sha=>{},
        Ok(_)=>return Err("Branch existente divergiu; não substituir.".into()),
        Err(_)=>{git(root,index,&["update-ref",&reference,&receipt.commit_sha,&"0".repeat(40)])?;},
    }
    #[cfg(test)]
    if std::env::var("OPEN_DOT_GIT_CRASH_STAGE").ok().as_deref()==Some("after-ref") {
        fs::write(record.parent().unwrap().join("crash-ready"),b"ref persisted; owned helper only").map_err(|_|"Sinal de teste indisponível.")?;
        loop {std::thread::sleep(Duration::from_millis(50));}
    }
    // Actual worktree index must still be exactly base or already exactly the committed tree.
    if worktree::git(root,&["diff-index","--cached","--quiet",&receipt.base_sha,"--"],4096).is_err() && worktree::git(root,&["diff-index","--cached","--quiet",&receipt.commit_sha,"--"],4096).is_err(){return Err("Índice contém trabalho externo; preserve para revisão.".into());}
    let head=text(root,index,&["rev-parse","HEAD"])?;
    let symbolic=text(root,index,&["symbolic-ref","--quiet","HEAD"]).ok();
    if head==receipt.base_sha && symbolic.is_none(){git(root,index,&["symbolic-ref","HEAD",&reference])?;}
    else if head!=receipt.commit_sha || symbolic.as_deref()!=Some(reference.as_str()){return Err("HEAD mudou; preserve o commit e revise a integração.".into());}
    worktree::git(root,&["read-tree",&receipt.commit_sha],4096)?;
    receipt.stage="committed".into();persist(record,&receipt)?;
    match fs::remove_file(index){Ok(())=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(_)=>return Err("Commit preservado; índice temporário requer revisão.".into())}
    journal::sync_directory(record.parent().ok_or("Pasta de recibo inválida.")?)?;Ok(receipt)
}
/// A separate native-user consent is mandatory. Never called automatically by file approval.
pub fn create(dir:&Path,cp:&journal::Checkpoint,proposal:&worktree::Proposal,consent:&str)->Result<Receipt,String> {
    if cfg!(windows) {return Err("Commit local desabilitado no Windows até validação nativa.".into());}
    if consent!="commit-exact-reviewed-files-locally" {return Err("Commit exige autorização local separada.".into());}
    let root=validate(dir,cp,proposal)?;
    let base=cp.base_sha.as_deref().filter(|s|valid_sha(s)).ok_or("Base Git não observada.")?;
    let branch=format!("agent/{}",cp.journal.task);let reference=format!("refs/heads/{branch}");
    let store=dir.join("git-checkpoints");fs::create_dir_all(&store).map_err(|_|"Pasta de recibos indisponível.")?;
    let record=store.join(format!("{}.json",cp.journal.task));let index=store.join(format!("{}.index",cp.journal.task));
    let _guard=operation_lock(&store,&cp.journal.task)?;
    if record.exists() {
        let prior:Receipt=read_json(&record)?;
        if prior.version!=1 || prior.base_sha!=base || !valid_sha(&prior.tree_sha) || !valid_sha(&prior.commit_sha) || prior.task!=cp.journal.task || prior.proposal_hash!=cp.journal.proposal_hash.clone().unwrap_or_default() || prior.branch!=branch {return Err("Recibo divergente; revisão manual necessária.".into());}
        if prior.stage=="committed" && text(&root,&index,&["rev-parse","--verify",&reference])?==prior.commit_sha {return Ok(prior);}
        if prior.stage=="prepared" {return finish_prepared(&root,&index,&record,proposal,prior);}
        return Err("Operação Git divergente. Revisão manual necessária; não repetir.".into());
    }
    if text(&root,&index,&["rev-parse","HEAD"])?!=base || text(&root,&index,&["symbolic-ref","--quiet","HEAD"]).is_ok() || text(&root,&index,&["rev-parse","--verify",&reference]).is_ok() {return Err("HEAD/branch mudou; não vou substituir trabalho existente.".into());}
    // A separate index is always used. Preserve any staged work in the real task index.
    worktree::git(&root,&["diff-index","--cached","--quiet",base,"--"],4096)?;
    // Persisted intent is reconciled only after exclusive kernel ownership and object verification.
    if index.exists(){return Err("Índice anterior preservado; reconciliação necessária.".into());}
    git(&root,&index,&["read-tree",base])?;
    for (n,file) in proposal.files.iter().enumerate() {
        let blob=store.join(format!("{}.blob-{n}.tmp",cp.journal.task));let mut opts=fs::OpenOptions::new();opts.write(true).create_new(true);
        #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;opts.mode(0o600);}
        let mut f=opts.open(&blob).map_err(|_|"Blob anterior preservado; não repetir.")?;
        f.write_all(file.content.as_bytes()).and_then(|_|f.sync_all()).map_err(|_|"Conteúdo não preservado.")?;drop(f);
        let oid=text(&root,&index,&["hash-object","-w","--no-filters","--",blob.to_str().ok_or("Caminho incompatível.")?])?;
        if !valid_sha(&oid){return Err("Formato de objeto Git não suportado.".into());}
        let entry=text(&root,&index,&["ls-tree",base,"--",&file.path])?;
        let mode=if entry.is_empty(){"100644"}else{entry.split_whitespace().next().ok_or("Modo Git inválido.")?};
        if !["100644","100755"].contains(&mode){return Err("Tipo Git protegido.".into());}
        git(&root,&index,&["update-index","--add","--cacheinfo",mode,&oid,&file.path])?;
        fs::remove_file(blob).map_err(|_|"Blob temporário preservado; revise antes de continuar.")?;
    }
    let tree=text(&root,&index,&["write-tree"])?;
    if !valid_sha(&tree){return Err("Árvore Git inválida.".into());}
    let changed=git(&root,&index,&["diff-tree","--no-ext-diff","--no-textconv","--no-commit-id","--name-only","-r","-z",base,&tree])?;
    let paths:Vec<_>=changed.split(|b|*b==0).filter(|b|!b.is_empty()).collect();
    if paths.is_empty() || paths.iter().any(|p|!proposal.files.iter().any(|f|f.path.as_bytes()==*p)){return Err("Diff não corresponde aos arquivos revisados.".into());}
    let trailer=trailer(&cp.journal.task);
    let commit=text(&root,&index,&["commit-tree",&tree,"-p",base,"--no-gpg-sign","-m",SUBJECT,"-m",&trailer])?;
    if !valid_sha(&commit){return Err("Commit Git inválido.".into());}
    let receipt=Receipt{version:1,task:cp.journal.task.clone(),proposal_hash:cp.journal.proposal_hash.clone().unwrap(),base_sha:base.into(),tree_sha:tree,commit_sha:commit.clone(),branch:branch.clone(),stage:"prepared".into()};
    persist(&record,&receipt)?;
    finish_prepared(&root,&index,&record,proposal,receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->(PathBuf,PathBuf,journal::Checkpoint,worktree::Proposal) {
        let dir=std::env::temp_dir().join(format!("od-git-checkpoint-{}",rand::random::<u64>()));let project=dir.join("project");fs::create_dir_all(&project).unwrap();
        worktree::git(&project,&["init"],4096).unwrap();fs::write(project.join("README.md"),"# Fixture\n").unwrap();fs::write(project.join(".gitattributes"),"*.txt filter=canary\n").unwrap();
        worktree::git(&project,&["add","README.md",".gitattributes"],4096).unwrap();worktree::git(&project,&["-c","user.name=Open Dot Test","-c","user.email=test@example.invalid","commit","--no-gpg-sign","-m","Fixture"],4096).unwrap();
        let project=project.canonicalize().unwrap();
        let j=journal::Journal{task:"f11c1820-5a7c-47e9-90d4-22c78ed0ca21".into(),device:"f11c1820-5a7c-47e9-90d4-22c78ed0ca22".into(),project:worktree::project_id(&project),phase:"applied".into(),proposal_hash:None,seq:5};
        let root=worktree::create(&project,&dir.join("worktrees"),&j.task,true).unwrap();
        let proposal=worktree::Proposal{summary:"Fixture reviewed bytes".into(),files:vec![worktree::Edit{path:"result.txt".into(),content:"Reviewed exact bytes\n".into(),before_hash:None,before_content:None}]};
        worktree::apply(&root,&proposal).unwrap();
        let mut j=j;j.proposal_hash=Some(worktree::hash(&serde_json::to_vec(&proposal).unwrap()));journal::save(&dir,&j).unwrap();journal::checkpoint(&dir,&j,Some("completed")).unwrap();
        let cp=load_checkpoint(&dir,&j.task).unwrap();(dir,project,cp,proposal)
    }
    #[test]
    #[cfg(unix)]
    fn commits_only_reviewed_files_without_filters_hooks_or_original_index_changes() {
        let (dir,project,cp,proposal)=fixture();let root=dir.join("worktrees").join(&cp.journal.task);
        let marker=dir.join("FILTER_EXECUTED");let command=format!("touch {}; cat",marker.to_str().unwrap());
        worktree::git(&project,&["config","filter.canary.clean",&command],4096).unwrap();
        let hooks=dir.join("hooks");fs::create_dir(&hooks).unwrap();let hook=hooks.join("pre-commit");fs::write(&hook,"#!/bin/sh\ntouch HOOK_EXECUTED\n").unwrap();
        #[cfg(unix)] {use std::os::unix::fs::PermissionsExt;fs::set_permissions(&hook,fs::Permissions::from_mode(0o700)).unwrap();}
        worktree::git(&project,&["config","core.hooksPath",hooks.to_str().unwrap()],4096).unwrap();
        fs::write(root.join("foreign.txt"),"Not selected\n").unwrap();
        assert!(create(&dir,&cp,&proposal,"").is_err());
        let receipt=create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").unwrap();
        assert_eq!(receipt.stage,"committed");assert!(!marker.exists());assert!(!root.join("HOOK_EXECUTED").exists());
        assert_eq!(String::from_utf8(worktree::git(&root,&["show","HEAD:result.txt"],4096).unwrap()).unwrap(),proposal.files[0].content);
        assert!(worktree::git(&root,&["show","HEAD:foreign.txt"],4096).is_err());assert!(root.join("foreign.txt").exists());
        assert_eq!(String::from_utf8(worktree::git(&project,&["rev-parse","HEAD"],4096).unwrap()).unwrap().trim(),cp.base_sha.as_deref().unwrap());
        let message=String::from_utf8(worktree::git(&root,&["log","-1","--format=%B"],4096).unwrap()).unwrap();assert!(message.starts_with(SUBJECT));assert!(message.contains("Task: OD2-F11C18205A7C"));
        let repeated=create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").unwrap();assert_eq!(repeated.commit_sha,receipt.commit_sha);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn refuses_changed_bytes_staged_foreign_work_and_incomplete_intents() {
        let (dir,_project,cp,proposal)=fixture();let root=dir.join("worktrees").join(&cp.journal.task);
        fs::write(root.join("result.txt"),"Changed after review").unwrap();assert!(create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").is_err());
        fs::write(root.join("result.txt"),&proposal.files[0].content).unwrap();fs::write(root.join("foreign.md"),"Unrelated staged work").unwrap();worktree::git(&root,&["add","foreign.md"],4096).unwrap();
        assert!(create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").is_err());assert!(String::from_utf8(worktree::git(&root,&["diff","--cached","--name-only"],4096).unwrap()).unwrap().contains("foreign.md"));
        fs::remove_dir_all(dir).unwrap();
        let (dir,_,cp,proposal)=fixture();let store=dir.join("git-checkpoints");fs::create_dir(&store).unwrap();
        let receipt=Receipt{version:1,task:cp.journal.task.clone(),proposal_hash:cp.journal.proposal_hash.clone().unwrap(),base_sha:cp.base_sha.clone().unwrap(),tree_sha:"a".repeat(40),commit_sha:"b".repeat(40),branch:format!("agent/{}",cp.journal.task),stage:"prepared".into()};
        persist(&store.join(format!("{}.json",cp.journal.task)),&receipt).unwrap();
        assert!(create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn existing_branch_and_sensitive_content_are_never_overwritten_or_committed() {
        let (dir,project,cp,proposal)=fixture();
        let reference=format!("refs/heads/agent/{}",cp.journal.task);
        worktree::git(&project,&["update-ref",&reference,cp.base_sha.as_deref().unwrap()],4096).unwrap();
        assert!(create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").is_err());
        assert_eq!(String::from_utf8(worktree::git(&project,&["rev-parse",&reference],4096).unwrap()).unwrap().trim(),cp.base_sha.as_deref().unwrap());
        fs::remove_dir_all(dir).unwrap();
        let (dir,_,mut cp,mut proposal)=fixture();let root=dir.join("worktrees").join(&cp.journal.task);
        proposal.files[0].content="password=synthetic-fixture-only".into();fs::write(root.join("result.txt"),&proposal.files[0].content).unwrap();
        cp.journal.proposal_hash=Some(worktree::hash(&serde_json::to_vec(&proposal).unwrap()));
        assert!(create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").err().unwrap().contains("sensível"));
        assert!(!dir.join("git-checkpoints").exists());fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    #[cfg(unix)]
    #[ignore="Auxiliar próprio para SIGKILL entre ref e recibo; iniciar somente pelo teste de recuperação"]
    fn commit_crash_child() {
        let dir=PathBuf::from(std::env::var("OPEN_DOT_GIT_FIXTURE").expect("Fixture obrigatória"));
        let cp=load_checkpoint(&dir,"f11c1820-5a7c-47e9-90d4-22c78ed0ca21").unwrap();
        let proposal:worktree::Proposal=read_json(&dir.join("fixture-proposal.json")).unwrap();
        create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").ok();
        panic!("O auxiliar deveria aguardar SIGKILL");
    }
    #[test]
    #[cfg(unix)]
    fn crash_after_ref_reconciles_same_commit_with_kernel_exclusion() {
        let (dir,project,cp,proposal)=fixture();let root=dir.join("worktrees").join(&cp.journal.task);
        fs::write(dir.join("fixture-proposal.json"),serde_json::to_vec(&proposal).unwrap()).unwrap();
        let mut cmd=process::command(&std::env::current_exe().unwrap());
        cmd.args(["git_checkpoint::tests::commit_crash_child","--exact","--ignored"]).env("OPEN_DOT_GIT_FIXTURE",&dir).env("OPEN_DOT_GIT_CRASH_STAGE","after-ref");
        let mut child=process::Guard::new(cmd.spawn().unwrap());let until=std::time::Instant::now()+Duration::from_secs(20);
        while !dir.join("git-checkpoints/crash-ready").exists(){assert!(std::time::Instant::now()<until);assert!(child.0.try_wait().unwrap().is_none());std::thread::sleep(Duration::from_millis(25));}
        assert!(create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").err().unwrap().contains("ocupado"));
        child.0.kill().unwrap();child.0.wait().unwrap();drop(child);
        let prepared:Receipt=read_json(&dir.join("git-checkpoints").join(format!("{}.json",cp.journal.task))).unwrap();assert_eq!(prepared.stage,"prepared");
        let recovered=create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").unwrap();assert_eq!(recovered.commit_sha,prepared.commit_sha);assert_eq!(recovered.stage,"committed");
        assert_eq!(String::from_utf8(worktree::git(&root,&["rev-list","--count",&format!("{}..HEAD",recovered.base_sha)],4096).unwrap()).unwrap().trim(),"1");
        assert_eq!(String::from_utf8(worktree::git(&project,&["rev-parse","HEAD"],4096).unwrap()).unwrap().trim(),recovered.base_sha);
        assert!(dir.join("git-checkpoints").join(format!("{}.lock",cp.journal.task)).exists());
        assert_eq!(create(&dir,&cp,&proposal,"commit-exact-reviewed-files-locally").unwrap().commit_sha,recovered.commit_sha);
        fs::remove_dir_all(dir).unwrap();
    }

}
