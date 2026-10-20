use crate::{
    channel::{self, SharedChannel},
    codex,
    journal::{self, Journal},
    process, worktree,
};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
fn emit(
    c: &SharedChannel,
    j: &mut Journal,
    dir: &Path,
    kind: &str,
    text: &str,
) -> Result<(), String> {
    if j.seq >= 500 {
        return Err("Limite de eventos da tarefa atingido.".into());
    }
    j.seq += 1;
    journal::save(dir, j)?;
    channel::device_request(
        c,
        &format!("/api/runner/device/tasks/{}/event", j.task),
        Some(&json!({"seq":j.seq,"kind":kind,"text":text})),
    )?;
    Ok(())
}
fn status(c: &SharedChannel, j: &Journal) -> Result<Value, String> {
    channel::device_request(
        c,
        &format!("/api/runner/device/tasks/{}/approval", j.task),
        None,
    )
}
fn root(dir: &Path, j: &Journal) -> Result<PathBuf, String> {
    let store = dir
        .join("worktrees")
        .canonicalize()
        .map_err(|_| "Pasta isolada indisponível.")?;
    let root = store
        .join(&j.task)
        .canonicalize()
        .map_err(|_| "Worktree da tarefa indisponível.")?;
    if root.parent() != Some(store.as_path()) {
        return Err("Worktree de recuperação fora da raiz permitida.".into());
    }
    Ok(root)
}
fn finish_proposal(
    c: &SharedChannel,
    j: &mut Journal,
    dir: &Path,
    project: &Path,
    permitted: &dyn Fn(&Path) -> bool,
) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(600);
    loop {
        if process::stopping() || !channel::live(c, &j.device, &j.task) || !permitted(project) {
            return Err("Tarefa interrompida ou sem disponibilidade confirmada.".into());
        }
        if Instant::now() > deadline {
            return Err("O tempo de espera pela aprovação terminou.".into());
        }
        let decision = status(c, j)?;
        j.seq = j.seq.max(decision["lastSeq"].as_u64().unwrap_or(0));
        if matches!(
            decision["state"].as_str(),
            Some("completed" | "cancelled" | "failed")
        ) {
            journal::clear(dir)?;
            return Ok(());
        }
        if decision["cancelRequested"] == 1 {
            emit(
                c,
                j,
                dir,
                "cancelled",
                "Interrupção confirmada. Nenhuma edição nova será aplicada.",
            )?;
            journal::clear(dir)?;
            return Ok(());
        }
        if decision["hash"].as_str() != j.proposal_hash.as_deref() {
            return Err(
                "A proposta do servidor não corresponde ao journal local. Nenhuma edição aplicada."
                    .into(),
            );
        }
        match decision["decision"].as_str() {
            Some("approve") if decision["state"] == "running" => {
                let proposal: worktree::Proposal =
                    serde_json::from_value(decision["proposal"].clone())
                        .map_err(|_| "Proposta de recuperação inválida.")?;
                let serialized =
                    serde_json::to_string(&proposal).map_err(|_| "Proposta inválida.")?;
                if Some(worktree::hash(serialized.as_bytes())).as_deref()
                    != j.proposal_hash.as_deref()
                {
                    return Err(
                        "O conteúdo foi alterado após a aprovação. Execução bloqueada.".into(),
                    );
                }
                let root = root(dir, j)?;
                if !channel::live(c, &j.device, &j.task) || !permitted(project) {
                    return Err("Permissão revogada antes da escrita.".into());
                }
                j.phase = "applying".into();
                journal::save(dir, j)?;
                worktree::apply(&root, &proposal)?;
                j.phase = "applied".into();
                journal::save(dir, j)?;
                let reported = decision["reported"].as_array().cloned().unwrap_or_default();
                if !reported.iter().any(|k| k == "files") {
                    let files=proposal.files.iter().map(|f|json!({"path":f.path,"sha256":worktree::hash(f.content.as_bytes())})).collect::<Vec<Value>>();
                    emit(
                        c,
                        j,
                        dir,
                        "files",
                        &serde_json::to_string(&files).map_err(|_| "Resultado inválido.")?,
                    )?;
                }
                if !reported.iter().any(|k| k == "tests") {
                    emit(c,j,dir,"tests","Não executados: comandos locais e shell estão desabilitados neste modo. Nenhum resultado de teste foi inventado.")?;
                }
                emit(c,j,dir,"completed","Conteúdo exato aprovado aplicado ao worktree isolado. A pasta original não foi alterada; não houve commit, push, merge ou publicação.")?;
                journal::clear(dir)?;
                return Ok(());
            }
            Some("reject") => {
                journal::clear(dir)?;
                return Ok(());
            }
            Some("expired") => {
                emit(
                    c,
                    j,
                    dir,
                    "failed",
                    "Aprovação expirada. Nenhuma edição foi aplicada.",
                )?;
                journal::clear(dir)?;
                return Ok(());
            }
            Some("pending") if decision["state"] == "awaiting_approval" => {
                j.phase = "awaiting_approval".into();
                journal::save(dir, j)?;
            }
            _ => return Err("Decisão incompatível. Nenhuma edição foi aplicada.".into()),
        }
        std::thread::sleep(Duration::from_millis(700));
    }
}
/// Recupera propostas já geradas sem chamar o modelo outra vez. Geração interrompida não é repetida.
fn recover(
    c: &SharedChannel,
    mut j: Journal,
    folders: &[PathBuf],
    dir: &Path,
    permitted: &dyn Fn(&Path) -> bool,
) -> Result<bool, String> {
    let Some(device) = channel::identity(c) else {
        return Ok(false);
    };
    if device != j.device {
        journal::clear(dir)?;
        return Ok(false);
    }
    if !channel::live(c, &device, "") {
        return Ok(false);
    }
    let project = folders
        .iter()
        .find(|p| worktree::project_id(p) == j.project);
    if project.is_none() || !permitted(project.unwrap()) {
        emit(
            c,
            &mut j,
            dir,
            "cancelled",
            "Pasta revogada. Recuperação recusada; worktree preservado.",
        )?;
        journal::clear(dir)?;
        return Ok(true);
    }
    let current = status(c, &j)?;
    if matches!(
        current["state"].as_str(),
        Some("completed" | "cancelled" | "failed")
    ) {
        journal::clear(dir)?;
        return Ok(true);
    }
    if current["cancelRequested"] == 1 {
        emit(
            c,
            &mut j,
            dir,
            "cancelled",
            "Interrupção confirmada após reconexão; worktree preservado.",
        )?;
        journal::clear(dir)?;
        return Ok(true);
    }
    if j.proposal_hash.is_none() || current["decision"] == "missing" {
        emit(c,&mut j,dir,"failed","Runner interrompido antes de confirmar uma proposta. A geração não foi repetida automaticamente; envie outra tarefa se desejar.")?;
        journal::clear(dir)?;
        return Ok(true);
    }
    finish_proposal(c, &mut j, dir, project.unwrap(), permitted)?;
    Ok(true)
}
/// Um worker sequencial por processo; instância única e CAS remoto evitam execução duplicada.
pub fn poll(
    c: &SharedChannel,
    folders: &[PathBuf],
    dir: &Path,
    permitted: &dyn Fn(&Path) -> bool,
) -> Result<bool, String> {
    if let Some(j) = journal::load(dir)? {
        return recover(c, j, folders, dir, permitted);
    }
    let device = channel::identity(c).ok_or("Dispositivo sem vínculo.")?;
    if !channel::live(c, &device, "") || process::stopping() {
        return Ok(false);
    }
    // Uma reserva pode ter sido confirmada no servidor antes de o journal chegar ao disco.
    // Não chamar o modelo novamente e não reconstruir uma aprovação só do servidor.
    let remote = channel::device_request(c, "/api/runner/device/active", None)?;
    let active = remote["active"]
        .as_array()
        .ok_or("Reconciliação remota incompatível.")?;
    if active.len() > 1 {
        return Err(
            "Mais de uma tarefa ativa: recuperação exige revisão. Arquivos preservados.".into(),
        );
    }
    if let Some(task) = active.first() {
        let mut orphan = Journal {
            task: task["id"]
                .as_str()
                .ok_or("Tarefa de recuperação inválida.")?
                .into(),
            device,
            project: task["projectId"]
                .as_str()
                .ok_or("Projeto de recuperação inválido.")?
                .into(),
            phase: "preparing".into(),
            proposal_hash: None,
            seq: task["seq"]
                .as_u64()
                .ok_or("Sequência de recuperação inválida.")?,
        };
        journal::save(dir, &orphan)?;
        emit(c, &mut orphan, dir, "failed", "Reserva sem journal local: estado anterior incerto. Worktree preservado; nenhuma nova escrita ou chamada ao modelo. Revise os arquivos antes de enviar outra tarefa.")?;
        journal::clear(dir)?;
        return Ok(true);
    }
    let claim = channel::device_request(c, "/api/runner/device/claim", Some(&json!({})))?;
    let Some(task) = claim.get("task").filter(|v| !v.is_null()) else {
        return Ok(false);
    };
    let id = task["id"].as_str().ok_or("Tarefa inválida.")?;
    let project_id = task["projectId"].as_str().ok_or("Projeto inválido.")?;
    let mut j = Journal {
        task: id.into(),
        device,
        project: project_id.into(),
        phase: "preparing".into(),
        proposal_hash: None,
        seq: 0,
    };
    journal::save(dir, &j)?;
    let result = (|| {
        if task["mechanism"] != "codex" {
            return Err("Este executor só oferece o modo seguro do Codex.".into());
        }
        let project = folders
            .iter()
            .find(|p| worktree::project_id(p) == project_id)
            .ok_or("Pasta revogada ou não autorizada no aplicativo.")?;
        if !permitted(project) {
            return Err("A pasta foi revogada antes da execução.".into());
        }
        let root = worktree::create(project, &dir.join("worktrees"), id)?;
        emit(c,&mut j,dir,"status","Worktree isolado criado a partir de HEAD sem hooks ou filtros de checkout. Credenciais e symlinks não são materializados. Arquivos originais preservados.")?;
        let cli = codex::installed()?;
        codex::preflight(&cli, &dir.join("proofs"))?;
        j.phase = "proposing".into();
        journal::save(dir, &j)?;
        let project_for_cancel = project.clone();
        let device_for_cancel = j.device.clone();
        let task_for_cancel = j.task.clone();
        let cancel = || {
            process::stopping()
                || !channel::live(c, &device_for_cancel, &task_for_cancel)
                || !permitted(&project_for_cancel)
        };
        let prompt = task["prompt"].as_str().ok_or("Prompt inválido.")?;
        let mut status_error = None;
        let proposal = codex::propose(&cli, &root, prompt, &cancel, &mut |s| {
            if let Err(e) = emit(c, &mut j, dir, "status", s) {
                status_error = Some(e);
            }
        })?;
        if let Some(error) = status_error {
            return Err(error);
        }
        if cancel() {
            return Err("Tarefa interrompida antes da proposta.".into());
        }
        let serialized = serde_json::to_string(&proposal).map_err(|_| "Proposta inválida.")?;
        j.proposal_hash = Some(worktree::hash(serialized.as_bytes()));
        j.phase = "awaiting_approval".into();
        journal::save(dir, &j)?;
        emit(c, &mut j, dir, "proposal", &serialized)?;
        finish_proposal(c, &mut j, dir, project, permitted)
    })();
    if let Err(error) = result {
        // Uma proposta já confirmada pode ser retomada após reconexão; nunca repetir geração.
        if channel::live(c, &j.device, "") && !process::stopping() {
            let definitive = j.proposal_hash.is_none()
                || !folders
                    .iter()
                    .any(|p| worktree::project_id(p) == j.project && permitted(p));
            if definitive {
                if emit(c, &mut j, dir, "failed", &error).is_ok() {
                    let _ = journal::clear(dir);
                }
            }
        }
        return Err(error);
    }
    Ok(true)
}
#[cfg(test)]
mod live_tests {
    use super::*;
    use crate::{channel, drivers, policy::Settings};
    use std::{
        fs,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc, Mutex,
        },
    };
    #[test]
    #[ignore = "Requer API isolada, Keychain e Codex com ChatGPT; usa uma chamada real de modelo"]
    fn real_codex_flow() {
        let url = std::env::var("OPEN_DOT_CHANNEL_TEST_ORIGIN").expect("API isolada necessária");
        assert!(url.starts_with("http://127.0.0.1:"));
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let session = client
            .post(format!("{url}/api/session/dev"))
            .header("x-open-dot", "1")
            .send()
            .unwrap();
        assert!(session.status().is_success());
        let cookie = session
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();
        let root = std::env::temp_dir().join(format!("open-dot-real-codex-{}", std::process::id()));
        // Nunca limpar uma pasta antiga automaticamente: ela pode conter evidência da execução anterior.
        assert!(
            !root.exists(),
            "Pasta de evidência anterior existe; preservar para revisão"
        );
        let project = root.join("project");
        let dir = root.join("state");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            project.join("README.md"),
            "# Isolated Open Dot integration fixture\n",
        )
        .unwrap();
        worktree::git(&project, &["init"], 16384).unwrap();
        worktree::git(&project, &["add", "README.md"], 16384).unwrap();
        worktree::git(
            &project,
            &[
                "-c",
                "user.name=Open Dot Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "--no-gpg-sign",
                "-m",
                "Isolated fixture",
            ],
            16384,
        )
        .unwrap();
        let cli = codex::installed().unwrap();
        codex::preflight(&cli, &dir.join("proofs")).expect("isolation must pass before model call");
        let detected = drivers::detect();
        assert!(
            detected
                .iter()
                .any(|d| d.id == "codex" && d.installed && d.authenticated),
            "ChatGPT login required; no API fallback"
        );
        let mut settings = Settings::default();
        settings.grant(project.clone()).unwrap();
        let project = settings.folders[0].clone();
        let project_id = worktree::project_id(&project);
        let c = Arc::new(Mutex::new(channel::Channel::default()));
        let pairing = channel::begin(&c, url.clone(), "Real Codex fixture".into()).unwrap();
        let approval = client
            .post(format!("{url}/api/runner/pairings/approve"))
            .header("cookie", &cookie)
            .header("x-open-dot", "1")
            .json(&json!({"code":pairing["code"],"name":"Real Codex fixture"}))
            .send()
            .unwrap();
        assert_eq!(approval.status().as_u16(), 201);
        channel::confirm(&c, &dir).unwrap();
        let projects = json!([{"id":project_id,"label":"Isolated real fixture"}]);
        let capabilities = json!([{"id":"codex","installed":true,"authenticated":true,"executable":true,"reason":"Real CLI authentication and sandbox preflight passed"}]);
        channel::heartbeat(&c, projects.clone(), capabilities.clone());
        struct Cleanup {
            channel: SharedChannel,
            dir: PathBuf,
            stop: Arc<AtomicBool>,
        }
        impl Drop for Cleanup {
            fn drop(&mut self) {
                self.stop.store(true, Ordering::Relaxed);
                let _ = channel::disconnect(&self.channel, &self.dir);
            }
        }
        let stop = Arc::new(AtomicBool::new(false));
        let _cleanup = Cleanup {
            channel: c.clone(),
            dir: dir.clone(),
            stop: stop.clone(),
        };
        let keep = stop.clone();
        let beat_c = c.clone();
        let heartbeat = std::thread::spawn(move || {
            while !keep.load(Ordering::Relaxed) {
                channel::heartbeat(&beat_c, projects.clone(), capabilities.clone());
                std::thread::sleep(Duration::from_millis(300));
            }
        });
        let device = channel::identity(&c).unwrap();
        let expected = "# Open Dot Runner\n\nReal Codex execution validated.\n";
        let submitted=client.post(format!("{url}/api/runner/tasks")).header("cookie",&cookie).header("x-open-dot","1").json(&json!({"deviceId":device,"projectId":project_id,"mechanism":"codex","prompt":format!("Create exactly one new file named RUNNER_RESULT.md with these exact UTF-8 contents, including the final newline: {}. Return the requested structured proposal. Do not change any other file, do not use tools and do not run commands.",serde_json::to_string(expected).unwrap()),"requestKey":"f11c1820-5a7c-47e9-90d4-22c78ed0ca21"})).send().unwrap();
        assert_eq!(submitted.status().as_u16(), 201);
        let task_id = submitted.json::<Value>().unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let work_c = c.clone();
        let work_dir = dir.clone();
        let work_project = project.clone();
        let worker = std::thread::spawn(move || {
            poll(&work_c, &[work_project.clone()], &work_dir, &|p| {
                p == work_project
            })
        });
        let deadline = Instant::now() + Duration::from_secs(300);
        let mut approved = false;
        loop {
            assert!(
                Instant::now() < deadline,
                "Timed out waiting for real proposal"
            );
            let events: Value = client
                .get(format!("{url}/api/runner/tasks/{task_id}/events"))
                .header("cookie", &cookie)
                .send()
                .unwrap()
                .json()
                .unwrap();
            if let Some(event) = events["events"]
                .as_array()
                .unwrap()
                .iter()
                .find(|e| e["kind"] == "failed")
            {
                panic!("Real executor failed safely: {}", event["text"])
            }
            if events["approval"]["decision"] == "pending" && !approved {
                let proposal_event = events["events"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|e| e["kind"] == "proposal")
                    .unwrap();
                let proposed: Value =
                    serde_json::from_str(proposal_event["text"].as_str().unwrap()).unwrap();
                assert_eq!(proposed["files"].as_array().unwrap().len(), 1);
                assert_eq!(proposed["files"][0]["path"], "RUNNER_RESULT.md");
                assert_eq!(proposed["files"][0]["content"], expected);
                assert_eq!(proposed["files"][0]["beforeHash"], Value::Null);
                // Esta automação autoriza SOMENTE o conteúdo inofensivo exato acima, nunca uma proposta arbitrária.
                assert!(
                    !dir.join("worktrees")
                        .join(&task_id)
                        .join("RUNNER_RESULT.md")
                        .exists(),
                    "No file before approval"
                );
                let rejected = client
                    .post(format!("{url}/api/runner/tasks/{task_id}/decision"))
                    .header("cookie", &cookie)
                    .header("x-open-dot", "1")
                    .json(&json!({"hash":"0".repeat(64),"decision":"approve"}))
                    .send()
                    .unwrap();
                assert_eq!(rejected.status().as_u16(), 409);
                let accepted = client
                    .post(format!("{url}/api/runner/tasks/{task_id}/decision"))
                    .header("cookie", &cookie)
                    .header("x-open-dot", "1")
                    .json(&json!({"hash":events["approval"]["hash"],"decision":"approve"}))
                    .send()
                    .unwrap();
                assert_eq!(accepted.status().as_u16(), 200);
                approved = true;
            }
            if events["events"]
                .as_array()
                .unwrap()
                .iter()
                .any(|e| e["kind"] == "completed")
            {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        assert!(worker.join().unwrap().unwrap());
        stop.store(true, Ordering::Relaxed);
        heartbeat.join().unwrap();
        assert!(approved);
        assert_eq!(
            fs::read_to_string(
                dir.join("worktrees")
                    .join(&task_id)
                    .join("RUNNER_RESULT.md")
            )
            .unwrap(),
            expected
        );
        assert!(!project.join("RUNNER_RESULT.md").exists());
        assert!(worktree::git(&project, &["status", "--porcelain"], 16384)
            .unwrap()
            .is_empty());
        let revoked = client
            .post(format!("{url}/api/runner/devices/{device}/revoke"))
            .header("cookie", &cookie)
            .header("x-open-dot", "1")
            .send()
            .unwrap();
        assert!(revoked.status().is_success());
        channel::disconnect(&c, &dir).unwrap();
        println!("REAL_CODEX_FLOW_PASS: official ChatGPT auth, native vault pairing, authorized Git project, CAS claim, readonly profile, no shell/MCP, real model proposal, exact-content approval, isolated file applied, real events/result, original project clean. Project commands/tests were NOT run.");
        println!("Evidence directory: {}", root.display());
    }
}
