#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// SPDX-License-Identifier: AGPL-3.0-only
mod channel;
mod claude;
mod codex;
mod companion;
mod cursor;
mod drivers;
mod executor;
mod journal;
mod git_checkpoint;
mod health;
mod perf;
mod updater;
mod project_context;
mod policy;
mod process;
mod tools;
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
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_notification::NotificationExt as _;
use tauri_plugin_updater::UpdaterExt as _;
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
fn companion_view(state: &LocalState, rt: &companion::Runtime) -> Result<companion::CompanionView, String> {
    let c = state.settings.lock().map_err(|_| "Ajustes indisponíveis.")?.companion.clone();
    let effective = rt.profile(&c);
    let pubkey = tauri_pubkey();
    Ok(companion::CompanionView {
        paused: rt.paused(&c),
        suggested: rt.suggested.0,
        suggested_reason: rt.suggested.1.clone(),
        effective,
        knobs: perf::knobs(effective),
        settings: c,
        version: env!("CARGO_PKG_VERSION"),
        update_key_ready: !updater::placeholder(&pubkey),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    })
}
/// Chave pública do updater compilada no app (tauri.conf.json); nunca a privada.
fn tauri_pubkey() -> String {
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap_or_default();
    conf["plugins"]["updater"]["pubkey"].as_str().unwrap_or_default().to_string()
}
#[tauri::command]
fn companion_get(state: tauri::State<'_, LocalState>, rt: tauri::State<'_, companion::Runtime>) -> Result<companion::CompanionView, String> {
    companion_view(&state, &rt)
}
#[tauri::command]
fn companion_set(app: tauri::AppHandle, patch: serde_json::Value) -> Result<companion::CompanionView, String> {
    let state = app.state::<LocalState>();
    let rt = app.state::<companion::Runtime>();
    {
        let mut guard = state.settings.lock().map_err(|_| "Ajustes indisponíveis.")?;
        let before = guard.companion.clone();
        let mut next = guard.clone();
        next.companion = companion::apply_patch(before.clone(), &patch)?;
        if next.companion.autostart != before.autostart {
            let auto = app.autolaunch();
            if next.companion.autostart { auto.enable() } else { auto.disable() }.map_err(|_| "Não consegui mudar o início com o sistema.")?;
        }
        #[cfg(target_os = "macos")]
        if next.companion.show_in_dock != before.show_in_dock {
            let _ = app.set_activation_policy(if next.companion.show_in_dock { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory });
        }
        persist(&state, &next, "companion_settings_changed")?;
        *guard = next;
    }
    let view = companion_view(&state, &rt)?;
    let _ = app.emit("od-companion", &view);
    Ok(view)
}
#[tauri::command]
fn health_get(state: tauri::State<'_, LocalState>, rt: tauri::State<'_, companion::Runtime>) -> Result<serde_json::Value, String> {
    let c = state.settings.lock().map_err(|_| "Ajustes indisponíveis.")?.companion.clone();
    let last = rt.last.lock().map_err(|_| "Saúde indisponível.")?.clone();
    let prot = rt.protection.lock().map_err(|_| "Saúde indisponível.")?.clone();
    Ok(serde_json::json!({ "sample": last, "protection": prot, "paused": rt.paused(&c), "rules": c.protection }))
}
#[tauri::command]
fn processes_list(state: tauri::State<'_, LocalState>) -> Result<serde_json::Value, String> {
    let active = journal::summary(&state.dir);
    let mut sys = sysinfo::System::new();
    let entries = process::list();
    let pids: Vec<sysinfo::Pid> = entries.iter().map(|e| sysinfo::Pid::from_u32(e.pid)).collect();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&pids), true);
    let now = companion::now_ms();
    let items: Vec<_> = entries
        .iter()
        .map(|e| {
            let mem = sys.process(sysinfo::Pid::from_u32(e.pid)).map(|p| p.memory()).unwrap_or(0);
            let in_use = e.task.is_none() || active.as_ref().map(|a| Some(&a.id) == e.task.as_ref()).unwrap_or(false);
            serde_json::json!({ "pid": e.pid, "label": e.label, "kind": e.kind, "task": e.task, "uptimeS": now.saturating_sub(e.started_ms) / 1000, "memoryBytes": mem,
              "group": if in_use { "em_uso" } else { "parado" },
              "why": if in_use { "Uma tarefa do Runner está usando este processo." } else { "A tarefa que o abriu terminou." } })
        })
        .collect();
    Ok(serde_json::json!({ "items": items, "nota": "Só aparecem processos que o Runner iniciou. Nesta versão, cada ferramenta é encerrada ao fim da tarefa; programas que você abriu nunca são encerrados pelo Runner." }))
}
#[tauri::command]
async fn process_terminate(pid: u32, confirm: String) -> Result<(), String> {
    if confirm != "encerrar-processo-do-runner" {
        return Err("Confirme o encerramento.".into());
    }
    tauri::async_runtime::spawn_blocking(move || process::terminate(pid, std::time::Duration::from_secs(3)))
        .await
        .map_err(|_| "Encerramento não confirmado.".to_string())?
}
#[tauri::command]
async fn update_check(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let consent = app.state::<LocalState>().settings.lock().map_err(|_| "Ajustes indisponíveis.")?.companion.update_consent;
    // Sem o "sim" do dono, nenhuma requisição de rede é feita.
    if !updater::allowed_endpoint(updater::ENDPOINT) {
        return Err("Endereço de atualização fora da lista permitida.".into());
    }
    match updater::gate(consent, &tauri_pubkey(), env!("CARGO_PKG_VERSION"), None, false) {
        updater::Gate::NoConsent => return Err("Avisos de versão desligados: nada foi consultado.".into()),
        updater::Gate::PlaceholderKey => return Err("Esta versão ainda não tem chave de assinatura de atualização configurada. Baixe a nova versão pela página de lançamentos.".into()),
        _ => {}
    }
    let found = app.updater().map_err(|_| "Atualizador indisponível.")?.check().await.map_err(|_| "Sem rede ou lançamento indisponível agora.")?;
    Ok(match found {
        Some(u) if updater::is_newer(env!("CARGO_PKG_VERSION"), &u.version) => serde_json::json!({ "available": true, "version": u.version, "notes": updater::plain_notes(u.body.as_deref().unwrap_or("")) }),
        _ => serde_json::json!({ "available": false, "version": env!("CARGO_PKG_VERSION") }),
    })
}
#[tauri::command]
async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    let (consent, busy) = {
        let s = app.state::<LocalState>();
        let consent = s.settings.lock().map_err(|_| "Ajustes indisponíveis.")?.companion.update_consent;
        (consent, journal::summary(&s.dir).is_some())
    };
    let u = app.updater().map_err(|_| "Atualizador indisponível.")?.check().await.map_err(|_| "Sem rede ou lançamento indisponível agora.")?.ok_or("Você já está na versão mais recente.")?;
    match updater::gate(consent, &tauri_pubkey(), env!("CARGO_PKG_VERSION"), Some(&u.version), busy) {
        updater::Gate::Ok => {}
        updater::Gate::TaskRunning => return Err("Há uma tarefa em andamento. A atualização espera ela terminar.".into()),
        updater::Gate::NotNewer => return Err("A versão oferecida não é mais nova: nada foi instalado.".into()),
        updater::Gate::NoConsent => return Err("Avisos de versão desligados.".into()),
        updater::Gate::PlaceholderKey => return Err("Sem chave de assinatura configurada: nada foi instalado.".into()),
    }
    let _ = app.emit("od-update", "baixando");
    // O plugin oficial confere a assinatura minisign antes de instalar; assinatura inválida falha aqui.
    u.download_and_install(|_, _| {}, || {}).await.map_err(|_| "Download ou assinatura recusados: nada foi instalado.")?;
    let _ = app.emit("od-update", "reiniciando");
    app.restart();
}
#[tauri::command]
fn open_review(state: tauri::State<'_, LocalState>) -> Result<(), String> {
    let origin = channel::linked_origin(&state.channel).ok_or("Pareie o Runner com o seu Open Dot primeiro.")?;
    let url = format!("{origin}/aprovacoes");
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("/usr/bin/open").arg(&url).status();
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer.exe").arg(&url).status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let r: std::io::Result<std::process::ExitStatus> = Err(std::io::Error::other("sem navegador"));
    r.map(|_| ()).map_err(|_| "Não consegui abrir o navegador.".into())
}
#[tauri::command]
fn main_show(app: tauri::AppHandle) {
    if let Some(p) = app.get_webview_window("panel") {
        let _ = p.hide();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle_panel(app: &tauri::AppHandle, at: Option<tauri::PhysicalPosition<f64>>) {
    let Some(panel) = app.get_webview_window("panel") else { return };
    if panel.is_visible().unwrap_or(false) {
        let _ = panel.hide();
        return;
    }
    if let Some(pos) = at {
        let size = panel.outer_size().map(|s| s.width as f64).unwrap_or(420.0);
        let y = if cfg!(target_os = "windows") { pos.y - 640.0 } else { pos.y + 8.0 };
        let _ = panel.set_position(tauri::PhysicalPosition::new((pos.x - size / 2.0).max(8.0), y.max(8.0)));
    }
    let _ = panel.show();
    let _ = panel.set_focus();
}

fn main() {
    if std::env::args().any(|arg| arg == "--diagnostics-only") {
        println!(
            "{}",
            serde_json::to_string(&drivers::detect()).expect("Diagnóstico inválido.")
        );
        println!("{}", tools::snapshot(&drivers::detect(), 1));
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {let _=window.show();let _=window.set_focus();}
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            diagnostics,
            choose_folder,
            revoke_folder, pair_begin, pair_confirm, pair_disconnect, checkpoint_preview, checkpoint_commit, export_project_context,
            companion_get, companion_set, health_get, processes_list, process_terminate, update_check, update_install, open_review, main_show
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
            #[cfg(target_os = "macos")]
            if !state.settings.lock().map(|s| s.companion.show_in_dock).unwrap_or(true) {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            app.manage(state);
            app.manage(companion::Runtime::new());
            // Saúde (C3): amostra no ritmo do perfil; com a janela oculta, três vezes mais devagar.
            let sampler = app.handle().clone();
            std::thread::spawn(move || {
                while !process::stopping() {
                    let state = sampler.state::<LocalState>();
                    let rt = sampler.state::<companion::Runtime>();
                    let c = state.settings.lock().map(|s| s.companion.clone()).unwrap_or_default();
                    let sample = rt.sampler.lock().map(|mut s| s.sample(companion::now_ms()));
                    if let Ok(sample) = sample {
                        let reason = rt.protection.lock().ok().and_then(|mut p| health::evaluate(&c.protection, &mut p, &sample));
                        let changed = rt.pause_reason.lock().map(|mut r| { let ch = *r != reason; *r = reason.clone(); ch }).unwrap_or(false);
                        if changed {
                            let _ = audit(&state, if reason.is_some() { "queue_paused_by_protection" } else { "queue_resumed_by_protection" });
                        }
                        if let Ok(mut l) = rt.last.lock() { *l = Some(sample.clone()); }
                        let _ = sampler.emit("od-health", serde_json::json!({ "sample": sample, "paused": rt.paused(&c) }));
                    }
                    let secs = match rt.profile(&c) { perf::Profile::Leve => 10, perf::Profile::Equilibrado => 5, perf::Profile::Maximo => 3 } * if rt.hidden() { 3 } else { 1 };
                    for _ in 0..secs { if process::stopping() { break } std::thread::sleep(std::time::Duration::from_secs(1)); }
                }
            });
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
                        let claude_opt_in=claude::experimental_enabled(std::env::var("OPEN_DOT_EXPERIMENTAL_DRIVERS").ok().as_deref());
                        if let Some(claude_code)=detected.iter_mut().find(|d|d.id=="claude-code" && d.authenticated) {
                            if !claude_opt_in {claude_code.executable=false;claude_code.reason="Driver implementado, ainda não validado com o CLI real. Desligado nesta beta.".into();}
                            else {
                                match journal::load(&state.dir).and_then(|_|claude::installed()).and_then(|cli|claude::preflight(&cli)) {
                                    Ok(())=>{claude_code.executable=true;claude_code.reason="Experimental: Claude Code sem ferramentas; proposta aprovada pelo dono no worktree. Não validado com chamada real.".into();},
                                    Err(reason)=>{claude_code.executable=false;claude_code.reason=reason;}
                                }
                            }
                        }
                        if let Some(cursor_agent)=detected.iter_mut().find(|d|d.id=="cursor" && d.installed) {cursor_agent.executable=cursor::safe_contract_available();cursor_agent.reason=cursor::UNAVAILABLE_REASON.into();}
                        for driver in &mut detected {driver.features=drivers::features(driver.id,driver.installed&&driver.authenticated&&driver.executable);}
                        let observed=SystemTime::now().duration_since(UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(1);
                        // Snapshot sem credenciais para o orquestrador; falha de rede não muda o diagnóstico local.
                        let _=channel::device_request(&state.channel,"/api/runner/device/tools",Some(&tools::snapshot(&detected,observed)));
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
                // G2: sem laço fixo de 2 s. Recuo progressivo quando ocioso (mais longo com a janela
                // oculta); volta ao mínimo quando há trabalho. Pausa (manual ou proteção) só deixa
                // de PEGAR tarefa nova: a que está rodando nunca é cancelada por aqui.
                let mut wait=std::time::Duration::from_secs(2);
                let mut last_phase:Option<String>=None;
                while !process::stopping() {
                    let state=worker.state::<LocalState>();
                    let rt=worker.state::<companion::Runtime>();
                    let c=state.settings.lock().map(|s|s.companion.clone()).unwrap_or_default();
                    let k=perf::knobs(rt.profile(&c));
                    let enabled=state.drivers.lock().map(|d|d.iter().any(|d|d.executable&&d.authenticated)).unwrap_or(false);
                    let mut had_work=false;
                    if enabled && (rt.paused(&c).is_none() || journal::summary(&state.dir).is_some()) {
                        let folders=state.settings.lock().map(|s|s.folders.clone()).unwrap_or_default();
                        let permitted=|p:&std::path::Path|state.settings.lock().map(|s|s.folders.iter().any(|f|f==p&&f.canonicalize().ok().as_deref()==Some(p))).unwrap_or(false);
                        had_work=matches!(executor::poll(&state.channel,&folders,&state.dir,&permitted),Ok(true));
                    }
                    // Notificação nativa opt-in, sem trecho de código ou e-mail.
                    let phase=journal::summary(&state.dir).map(|s|s.phase);
                    if c.notifications && phase.as_deref()==Some("awaiting_approval") && last_phase.as_deref()!=Some("awaiting_approval") {
                        let _=worker.notification().builder().title("Open Dot Runner").body("Há uma proposta esperando a sua aprovação.").show();
                    }
                    if phase.is_some() { had_work=true; }
                    last_phase=phase;
                    wait=perf::next_poll(wait,had_work,rt.hidden(),&k);
                    let until=std::time::Instant::now()+wait;
                    while std::time::Instant::now()<until && !process::stopping() { std::thread::sleep(std::time::Duration::from_millis(500)); }
                }
            });
            let open = MenuItem::with_id(app, "open", "Abrir Runner", true, None::<&str>)?;
            let review = MenuItem::with_id(app, "review", "Revisar aprovações", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pausar ou retomar a fila", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair do Runner", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &review, &pause, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Open Dot Runner · clique para ver o estado");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => main_show(app.clone()),
                "review" => { let _ = open_review(app.state::<LocalState>()); }
                "pause" => {
                    let paused = app.state::<LocalState>().settings.lock().map(|s| s.companion.queue_paused).unwrap_or(false);
                    let _ = companion_set(app.clone(), serde_json::json!({ "queuePaused": !paused }));
                }
                "quit" => {process::shutdown();app.exit(0)},
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = event {
                    let p = rect.position.to_physical::<f64>(1.0);
                    toggle_panel(tray.app_handle(), Some(tauri::PhysicalPosition::new(p.x, p.y)));
                }
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Fechar a janela mantém o Runner na bandeja (a interface diz isso).
                    if window.hide().is_ok() {
                        api.prevent_close();
                        if window.label() == "main" {
                            app.state::<companion::Runtime>().hidden.store(true, std::sync::atomic::Ordering::Relaxed);
                            let _ = app.emit("od-visibility", serde_json::json!({ "hidden": true }));
                        }
                    }
                }
                tauri::WindowEvent::Focused(focused) => {
                    if window.label() == "panel" && !focused {
                        let _ = window.hide();
                    }
                    if window.label() == "main" && *focused {
                        app.state::<companion::Runtime>().hidden.store(false, std::sync::atomic::Ordering::Relaxed);
                        let _ = app.emit("od-visibility", serde_json::json!({ "hidden": false }));
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("Não foi possível iniciar o Open Dot Runner.")
        .run(|_, event| { if matches!(event,tauri::RunEvent::Exit|tauri::RunEvent::ExitRequested{..}){process::shutdown();} });
}
