#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod channel;
mod codex;
mod drivers;
mod executor;
mod journal;
mod git_checkpoint;
mod project_context;
mod policy;
mod process;
#[cfg(test)]
mod recovery_tests;
mod worktree;
use policy::Settings;
use serde::Serialize;
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_dialog::DialogExt;

struct LocalState {
    settings: Mutex<Settings>,
    dir: PathBuf,
    channel: channel::SharedChannel,
    drivers: Mutex<Vec<drivers::Driver>>,
    checkpoint_guard: Mutex<()>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostics {
    os: &'static str,
    arch: &'static str,
    version: &'static str,
    folders: Vec<PathBuf>,
    paired: bool,
    channel: channel::Status,
    drivers: Vec<drivers::Driver>,
    active_task: Option<journal::Summary>,
    checkpoints: journal::CheckpointInventory,
}

// Somente eventos fixos, sem caminhos, texto de tarefas, tokens ou conteúdo privado.
fn audit(state: &LocalState, event: &str) -> Result<(), String> {
    use std::io::Write;
    let path = state.dir.join("audit.jsonl");
    if fs::metadata(&path)
        .map(|m| m.len() > 256_000)
        .unwrap_or(false)
    {
        let old = state.dir.join("audit.previous.jsonl");
        if old.exists() {
            fs::remove_file(&old).map_err(|_| "Falha ao rotacionar auditoria.")?;
        }
        fs::rename(&path, old).map_err(|_| "Falha ao rotacionar auditoria.")?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|_| "Falha ao abrir auditoria.")?;
    let at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    writeln!(file, "{}", serde_json::json!({ "at": at, "event": event }))
        .map_err(|_| "Falha ao gravar auditoria.".into())
}
fn persist(state: &LocalState, settings: &Settings, event: &str) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(settings).map_err(|_| "Configuração inválida.")?;
    // Arquivo pequeno e local; nenhum segredo é armazenado nesta versão.
    audit(state, event)?;
    fs::write(state.dir.join("settings.json"), bytes)
        .map_err(|_| "Não consegui salvar as permissões.".into())
}
fn read_diagnostics(state: &LocalState) -> Result<Diagnostics, String> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| "Permissões indisponíveis.")?;
    let channel = state
        .channel
        .lock()
        .map_err(|_| "Canal indisponível.")?
        .status
        .clone();
    Ok(Diagnostics {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        version: env!("CARGO_PKG_VERSION"),
        folders: settings.folders.clone(),
        paired: channel.paired,
        channel,
        active_task: journal::summary(&state.dir),
        checkpoints: journal::inventory(&state.dir),
        drivers: state
            .drivers
            .lock()
            .map_err(|_| "Diagnóstico indisponível.")?
            .clone(),
    })
}
#[tauri::command]
async fn diagnostics(app: tauri::AppHandle) -> Result<Diagnostics, String> {
    tauri::async_runtime::spawn_blocking(move || read_diagnostics(&app.state::<LocalState>()))
        .await
        .map_err(|_| "Diagnóstico indisponível.".to_string())?
}
#[tauri::command]
async fn choose_folder(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app.dialog().file().blocking_pick_folder() else {
            return Ok(false);
        };
        let path = selected
            .into_path()
            .map_err(|_| "Seleção de pasta inválida.")?;
        let state = app.state::<LocalState>();
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "Permissões indisponíveis.")?;
        let mut next = guard.clone();
        next.grant(path)?;
        persist(&state, &next, "folder_granted")?;
        *guard = next;
        Ok(true)
    })
    .await
    .map_err(|_| "Não consegui abrir o seletor de pastas.".to_string())?
}
#[tauri::command]
fn revoke_folder(index: usize, state: tauri::State<'_, LocalState>) -> Result<(), String> {
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| "Permissões indisponíveis.")?;
    if index >= guard.folders.len() {
        return Err("Pasta não encontrada. Atualize a lista.".into());
    }
    let mut next = guard.clone();
    next.folders.remove(index);
    persist(&state, &next, "folder_revoked")?;
    *guard = next;
    Ok(())
}
#[tauri::command]
async fn pair_begin(
    app: tauri::AppHandle,
    origin: String,
    name: String,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        channel::begin(&app.state::<LocalState>().channel, origin, name)
    })
    .await
    .map_err(|_| "Falha no pareamento.".to_string())?
}
#[tauri::command]
async fn pair_confirm(app: tauri::AppHandle) -> Result<channel::Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = app.state::<LocalState>();
        channel::confirm(&s.channel, &s.dir)
    })
    .await
    .map_err(|_| "Falha no pareamento.".to_string())?
}
#[tauri::command]
async fn pair_disconnect(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = app.state::<LocalState>();
        channel::disconnect(&s.channel, &s.dir)
    })
    .await
    .map_err(|_| "Falha ao desconectar.".to_string())?
}
#[tauri::command]
async fn checkpoint_preview(app:tauri::AppHandle,task:String)->Result<serde_json::Value,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let s=app.state::<LocalState>();let settings=s.settings.lock().map_err(|_|"Permissões indisponíveis.")?;
        let (cp,proposal)=git_checkpoint::context(&s.dir,&task,&s.channel,&settings.folders)?;
        let label=settings.folders.iter().find(|p|worktree::project_id(p)==cp.journal.project).and_then(|p|p.file_name()).map(|n|n.to_string_lossy().chars().take(80).collect::<String>()).unwrap_or_else(||"Projeto autorizado".into());
        Ok(serde_json::json!({"task":task,"projectId":cp.journal.project,"projectLabel":label,"proposalHash":cp.journal.proposal_hash,"baseSha":cp.base_sha,"branch":format!("agent/{task}"),"subject":git_checkpoint::SUBJECT,"body":git_checkpoint::trailer(&task),"proposal":proposal}))
    }).await.map_err(|_|"Prévia de commit indisponível.".to_string())?
}
#[tauri::command]
async fn checkpoint_commit(app:tauri::AppHandle,task:String,proposal_hash:String,consent:String)->Result<git_checkpoint::Receipt,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let s=app.state::<LocalState>();let _serial=s.checkpoint_guard.lock().map_err(|_|"Checkpoint ocupado.")?;
        let settings=s.settings.lock().map_err(|_|"Permissões indisponíveis.")?;
        let (cp,proposal)=git_checkpoint::context(&s.dir,&task,&s.channel,&settings.folders)?;
        if cp.journal.proposal_hash.as_deref()!=Some(proposal_hash.as_str()) || consent!="commit-exact-reviewed-files-locally" {return Err("Prévia ou consentimento mudou. Revise novamente.".into());}
        let files=proposal.files.iter().map(|f|f.path.escape_default().to_string()).collect::<Vec<_>>().join("\n");
        let label=settings.folders.iter().find(|p|worktree::project_id(p)==cp.journal.project).and_then(|p|p.file_name()).map(|n|n.to_string_lossy().escape_default().to_string()).unwrap_or_default();
        let message=format!("Commit local dos bytes revisados.\nProjeto: {label} ({})\nTarefa: {task}\nBranch: agent/{task}\nSHA-256 da proposta: {proposal_hash}\n{}\n{}\nArquivos:\n{files}\nNão inclui push ou merge.",cp.journal.project,git_checkpoint::SUBJECT,git_checkpoint::trailer(&task));
        if !app.dialog().message(message).title("Autorizar checkpoint Git local").kind(tauri_plugin_dialog::MessageDialogKind::Warning).buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).blocking_show(){return Err("Commit local não autorizado.".into());}
        // Recheck remote revocation, current files and scope after the native confirmation.
        let (cp,proposal)=git_checkpoint::context(&s.dir,&task,&s.channel,&settings.folders)?;
        if cp.journal.proposal_hash.as_deref()!=Some(proposal_hash.as_str()){return Err("Conteúdo mudou durante a confirmação.".into());}
        let result=git_checkpoint::create(&s.dir,&cp,&proposal,&consent)?;
        audit(&s,"task_checkpoint_committed")?;Ok(result)
    }).await.map_err(|_|"Commit local não confirmado; preserve e confira o recibo.".to_string())?
}
#[tauri::command]
async fn export_project_context(app:tauri::AppHandle,index:usize)->Result<bool,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let s=app.state::<LocalState>();let settings=s.settings.lock().map_err(|_|"Permissões indisponíveis.")?;
        let project=settings.folders.get(index).ok_or("Escolha uma pasta ainda autorizada.")?.clone();drop(settings);
        let value=project_context::build(&project,&s.dir)?;let bytes=serde_json::to_vec_pretty(&value).map_err(|_|"Contexto inválido.")?;
        if bytes.len()>65536{return Err("Contexto excede 64 KB; revise os registros antes de exportar.".into());}
        let Some(selected)=app.dialog().file().add_filter("Open Dot context",&["json"]).set_file_name("opendot-project-context.json").blocking_save_file() else{return Ok(false)};
        let path=selected.into_path().map_err(|_|"Destino local inválido.")?;
        if path.extension().and_then(|s|s.to_str())!=Some("json"){return Err("Escolha um arquivo JSON novo.".into());}
        use std::io::Write;let mut options=fs::OpenOptions::new();options.create_new(true).write(true);
        #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.mode(0o600);}
        let mut file=options.open(&path).map_err(|_|"Destino existente ou indisponível. Nenhum arquivo foi substituído.")?;
        file.write_all(&bytes).and_then(|_|file.sync_all()).map_err(|_|"Exportação local incompleta; preserve e revise o arquivo.")?;
        journal::sync_directory(path.parent().ok_or("Destino inválido.")?)?;Ok(true)
    }).await.map_err(|_|"Exportação não confirmada.".to_string())?
}
fn main() {
    if std::env::args().any(|arg| arg == "--diagnostics-only") {
        println!(
            "{}",
            serde_json::to_string(&drivers::detect()).expect("Diagnóstico inválido.")
        );
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {let _=window.show();let _=window.set_focus();}
        }))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            diagnostics,
            choose_folder,
            revoke_folder, pair_begin, pair_confirm, pair_disconnect, checkpoint_preview, checkpoint_commit, export_project_context
        ])
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))?;
            }
            let settings = match fs::read(dir.join("settings.json")) {
                Ok(bytes) => serde_json::from_slice::<Settings>(&bytes).unwrap_or_default(),
                Err(_) => Settings::default(),
            };
            let channel = std::sync::Arc::new(Mutex::new(channel::restore(&dir)));
            let state = LocalState {
                settings: Mutex::new(settings),
                dir,
                channel,
                drivers: Mutex::new(vec![]),
                checkpoint_guard: Mutex::new(()),
            };
            audit(&state, "runner_started")?;
            app.manage(state);
            let diagnostic=app.handle().clone();
            std::thread::spawn(move || {
                while !process::stopping() {
                    let state=diagnostic.state::<LocalState>();

                        let mut detected=drivers::detect();
                        if let Some(codex)=detected.iter_mut().find(|d|d.id=="codex" && d.authenticated) {
                            match journal::load(&state.dir).and_then(|_|codex::installed()).and_then(|cli|codex::preflight(&cli,&state.dir.join("diagnostic-proofs"))) {
                                Ok(())=>{codex.executable=true;codex.reason="Edição com aprovação no worktree; sem shell, rede ou ferramentas externas. Perfil reconfirmado em cada tarefa.".into();},
                                Err(reason)=>{codex.executable=false;codex.reason=reason;}
                            }
                        }
                        if let Ok(mut d)=state.drivers.lock(){*d=detected;}

                    for _ in 0..60 {if process::stopping(){break}std::thread::sleep(std::time::Duration::from_secs(1));}
                }
            });
            let handle=app.handle().clone();
            std::thread::spawn(move || {
                while !process::stopping() {
                    let state=handle.state::<LocalState>();
                    // IDs são opacos e estáveis por caminho; o caminho não sai do processo nativo.
                    let projects=state.settings.lock().map(|s| {
                        use sha2::{Digest,Sha256};
                        s.folders.iter().filter(|p|p.is_dir()).map(|p| {
                            let digest=Sha256::digest(p.to_string_lossy().as_bytes());
                            let mut bytes=[0u8;16];bytes.copy_from_slice(&digest[..16]);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
                            let hex=bytes.iter().map(|b|format!("{b:02x}")).collect::<String>();
                            let id=format!("{}-{}-{}-{}-{}",&hex[..8],&hex[8..12],&hex[12..16],&hex[16..20],&hex[20..]);
                            let label=p.file_name().and_then(|n|n.to_str()).unwrap_or("Projeto").chars().filter(|c|c.is_alphanumeric()||" ._()-".contains(*c)).take(80).collect::<String>();
                            serde_json::json!({"id":id,"label":if label.is_empty(){"Projeto"}else{&label}})
                        }).collect::<Vec<_>>()
                    }).unwrap_or_default();
                    let drivers=state.drivers.lock().map(|d|serde_json::to_value(&*d).unwrap_or_default()).unwrap_or_default();
                    channel::heartbeat(&state.channel,serde_json::json!(projects),drivers);
                    std::thread::sleep(std::time::Duration::from_secs(5));
                }
            });
            let worker=app.handle().clone();
            std::thread::spawn(move || {
                while !process::stopping() {
                    let state=worker.state::<LocalState>();
                    let enabled=state.drivers.lock().map(|d|d.iter().any(|d|d.id=="codex"&&d.executable&&d.authenticated)).unwrap_or(false);
                    if enabled {
                        let folders=state.settings.lock().map(|s|s.folders.clone()).unwrap_or_default();
                        let permitted=|p:&std::path::Path|state.settings.lock().map(|s|s.folders.iter().any(|f|f==p&&f.canonicalize().ok().as_deref()==Some(p))).unwrap_or(false);
                        let _=executor::poll(&state.channel,&folders,&state.dir,&permitted);
                    }
                    std::thread::sleep(std::time::Duration::from_secs(2));
                }
            });
            let open = MenuItem::with_id(app, "open", "Abrir Open Dot Runner", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair do Runner", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Open Dot Runner · abra para conferir disponibilidade");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {process::shutdown();app.exit(0)},
                _ => {}
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.hide().is_ok() {
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Não foi possível iniciar o Open Dot Runner.")
        .run(|_, event| { if matches!(event,tauri::RunEvent::Exit|tauri::RunEvent::ExitRequested{..}){process::shutdown();} });
}
