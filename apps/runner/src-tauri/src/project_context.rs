// SPDX-License-Identifier: AGPL-3.0-only
//! Local metadata export. Never contains credential, private absolute path, prompt or file contents.
use crate::{journal,worktree,git_checkpoint};
use serde::Serialize;
use std::{fs,io::Read,path::Path,time::{Duration,Instant,SystemTime,UNIX_EPOCH}};
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Context {kind:&'static str,schema_version:u8,project_id:String,identity_kind:&'static str,observed_at_ms:u64,project_head_sha:Option<String>,execution_authority:bool,stack:Vec<Stack>,tasks:Vec<Task>,unreadable:usize,truncated:bool}
#[derive(Serialize)]
pub struct Stack {technology:&'static str,source:&'static str,basis:&'static str}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Task {runner_task_id:String,working_tree_state:&'static str,phase:String,proposal_hash:Option<String>,base_sha:Option<String>,observed_head_sha:Option<String>,observed_branch:Option<String>,base_in_current_repository:Option<bool>,terminal_receipt:Option<String>,commit:Option<Commit>}
#[derive(Serialize)]
pub struct Commit {sha:String,branch:String,verification:&'static str}
fn sha(root:&Path,args:&[&str])->Option<String>{let value=String::from_utf8(worktree::git(root,args,4096).ok()?).ok()?.trim().to_string();if value.len()==40 && value.bytes().all(|b|b.is_ascii_hexdigit()){Some(value)}else{None}}
fn manifest(root:&Path,name:&str)->Option<String>{
    let mut path=root.to_path_buf();for part in name.split('/'){path.push(part);if fs::symlink_metadata(&path).ok()?.file_type().is_symlink(){return None;}}
    let mut options=fs::OpenOptions::new();options.read(true);
    #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.custom_flags(libc::O_NOFOLLOW);}
    let file=options.open(path).ok()?;if !file.metadata().ok()?.is_file(){return None;}
    let mut bytes=Vec::new();file.take(65537).read_to_end(&mut bytes).ok()?;if bytes.len()>65536{return None;}String::from_utf8(bytes).ok()
}
fn stack(root:&Path)->Vec<Stack>{
    let mut found=Vec::new();
    let mut add=|technology,source|{if !found.iter().any(|s:&Stack|s.technology==technology){found.push(Stack{technology,source,basis:"manifest-declaration"});}};
    if let Some(value)=manifest(root,"package.json").and_then(|s|serde_json::from_str::<serde_json::Value>(&s).ok()) {
        for (package,technology) in [("react","React"),("typescript","TypeScript"),("esbuild","esbuild"),("@tauri-apps/cli","Tauri"),("@tauri-apps/api","Tauri"),("wrangler","Cloudflare Workers")] {
            if value["dependencies"].get(package).and_then(|v|v.as_str()).is_some()||value["devDependencies"].get(package).and_then(|v|v.as_str()).is_some(){add(technology,"package.json");}
        }
    }
    for name in ["Cargo.toml","apps/runner/src-tauri/Cargo.toml"] {
        if let Some(value)=manifest(root,name).and_then(|s|s.parse::<toml::Value>().ok()) {if value.get("package").is_some()||value.get("workspace").is_some(){add("Rust",name);}}
    }
    if manifest(root,"wrangler.toml").and_then(|s|s.parse::<toml::Value>().ok()).is_some_and(|v|v.get("main").is_some()){add("Cloudflare Workers","wrangler.toml");}
    found
}
pub fn build(project:&Path,dir:&Path)->Result<Context,String>{
    let canonical=project.canonicalize().map_err(|_|"Pasta autorizada indisponível.")?;
    if canonical!=project{return Err("A pasta mudou de destino; revise a autorização.".into());}
    let project_id=worktree::project_id(&canonical);let inventory=journal::inventory(dir);let mut unreadable=inventory.unreadable;let mut truncated=inventory.truncated;let mut tasks=Vec::new();let start=Instant::now();
    for item in inventory.items {
        if start.elapsed()>Duration::from_secs(5){truncated=true;break;}
        let path=dir.join("task-checkpoints").join(format!("{}.json",item.task));
        let mut bytes=Vec::new();let loaded=fs::File::open(path).and_then(|f|f.take(8193).read_to_end(&mut bytes));
        if loaded.is_err()||bytes.len()>8192{unreadable+=1;continue;}
        let cp:journal::Checkpoint=match serde_json::from_slice(&bytes){Ok(cp)=>cp,Err(_)=>{unreadable+=1;continue;}};
        if cp.schema_version!=1 || cp.journal.task!=item.task || !["preparing","proposing","awaiting_approval","applying","applied"].contains(&cp.journal.phase.as_str())
            || cp.base_sha.as_ref().is_some_and(|v|v.len()!=40||!v.bytes().all(|b|b.is_ascii_hexdigit()))
            || cp.journal.proposal_hash.as_ref().is_some_and(|v|v.len()!=64||!v.bytes().all(|b|b.is_ascii_hexdigit()))
            || cp.terminal_receipt.as_ref().is_some_and(|v|!["completed","failed","cancelled","uncertain"].contains(&v.as_str())) {unreadable+=1;continue;}
        if cp.journal.project!=project_id{continue;}
        if worktree::verify_owner(&dir.join("worktrees"),&cp.journal.task,&project_id).is_err(){unreadable+=1;continue;}
        let root=dir.join("worktrees").join(&cp.journal.task);
        let head=sha(&root,&["rev-parse","HEAD"]);
        let observed_branch=String::from_utf8(worktree::git(&root,&["rev-parse","--abbrev-ref","HEAD"],4096).unwrap_or_default()).ok().and_then(|s|{let branch=s.trim();if branch=="HEAD"{Some("detached".into())}else if branch==format!("agent/{}",cp.journal.task){Some(branch.into())}else{None}});
        let base_present=cp.base_sha.as_ref().map(|base|worktree::git(&canonical,&["cat-file","-e",&format!("{base}^{{commit}}")],4096).is_ok());
        let commit=git_checkpoint::recorded_receipt(dir,&cp).map(|r|{let confirmed=sha(&canonical,&["rev-parse","--verify",&format!("refs/heads/{}",r.branch)]).as_deref()==Some(r.commit_sha.as_str());Commit{sha:r.commit_sha,branch:r.branch,verification:if confirmed{"ref-observed"}else{"record-only"}}});
        tasks.push(Task{runner_task_id:cp.journal.task,working_tree_state:"not-inspected",phase:cp.journal.phase,proposal_hash:cp.journal.proposal_hash,base_sha:cp.base_sha,observed_head_sha:head,observed_branch,base_in_current_repository:base_present,terminal_receipt:cp.terminal_receipt,commit});
    }
    let time=SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_|"Relógio local inválido.")?.as_millis() as u64;
    Ok(Context{kind:"open-dot-native-project-context",schema_version:1,project_id,identity_kind:"device-folder",observed_at_ms:time,project_head_sha:sha(&canonical,&["rev-parse","HEAD"]),execution_authority:false,stack:stack(&canonical),tasks,unreadable,truncated})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn observes_owned_git_without_exporting_paths_or_manifest_contents() {
        let dir=std::env::temp_dir().join(format!("od-context-{}",rand::random::<u64>()));
        let project=dir.join("project");fs::create_dir_all(&project).unwrap();
        worktree::git(&project,&["init"],4096).unwrap();
        fs::write(project.join("README.md"),"Fixture").unwrap();
        worktree::git(&project,&["add","README.md"],4096).unwrap();
        worktree::git(&project,&["-c","user.name=Fixture","-c","user.email=test@example.invalid","commit","--no-gpg-sign","-m","Fixture"],4096).unwrap();
        let project=project.canonicalize().unwrap();
        fs::write(project.join("package.json"),r#"{"dependencies":{"react":"19","typescript":{}},"privateValue":"DO_NOT_EXPORT_CONTENT"}"#).unwrap();
        let j=journal::Journal{task:"f11c1820-5a7c-47e9-90d4-22c78ed0ca21".into(),device:"f11c1820-5a7c-47e9-90d4-22c78ed0ca22".into(),project:worktree::project_id(&project),phase:"applied".into(),proposal_hash:None,seq:5};
        let root=worktree::create(&project,&dir.join("worktrees"),&j.task,true).unwrap();
        journal::save(&dir,&j).unwrap();journal::checkpoint(&dir,&j,Some("uncertain")).unwrap();
        let context=build(&project,&dir).unwrap();let text=serde_json::to_string(&context).unwrap();
        assert!(!text.contains(project.to_str().unwrap()));assert!(!text.contains("DO_NOT_EXPORT_CONTENT"));
        assert_eq!(context.tasks.len(),1);assert_eq!(context.tasks[0].observed_branch.as_deref(),Some("detached"));
        assert_eq!(context.tasks[0].base_in_current_repository,Some(true));assert_eq!(context.stack.len(),1);
        worktree::git(&root,&["checkout","-b","foreign-owned-branch"],4096).unwrap();
        assert!(build(&project,&dir).unwrap().tasks[0].observed_branch.is_none());
        #[cfg(unix)] {
            fs::remove_file(project.join("package.json")).unwrap();std::os::unix::fs::symlink(project.join("README.md"),project.join("package.json")).unwrap();
            assert!(build(&project,&dir).unwrap().stack.is_empty());
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
