//! Fixture sem modelo: HTTP/SQLite, cofre, processos, Git e escrita são reais.
use crate::{
    channel, executor,
    journal::{self, Journal},
    process, worktree,
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap()
}
fn origin() -> String {
    let url = std::env::var("OPEN_DOT_CHANNEL_TEST_ORIGIN").expect("API isolada necessária");
    assert!(url.starts_with("http://127.0.0.1:"));
    url
}
fn beat(c: &channel::SharedChannel, project: &Path) {
    channel::heartbeat(
        c,
        json!([{"id":worktree::project_id(project),"label":"Recovery fixture"}]),
        json!([{"id":"codex","installed":true,"authenticated":true,"executable":true,"reason":"Fixture sem modelo; somente recuperação nativa"}]),
    );
}

#[test]
#[ignore = "Processo auxiliar descartável; só iniciar pelo teste crash_restart"]
fn crash_child() {
    let dir =
        PathBuf::from(std::env::var("OPEN_DOT_RECOVERY_FIXTURE").expect("fixture necessária"));
    assert_eq!(
        fs::read_to_string(dir.join("fixture-kind")).unwrap(),
        "open-dot-recovery-test"
    );
    let j = journal::load(&dir).unwrap().unwrap();
    let c = Arc::new(Mutex::new(channel::restore(&dir)));
    let response = channel::device_request(
        &c,
        &format!("/api/runner/device/tasks/{}/approval", j.task),
        None,
    )
    .unwrap();
    assert_eq!(response["decision"], "approve");
    let proposal: worktree::Proposal =
        serde_json::from_value(response["proposal"].clone()).unwrap();
    assert_eq!(
        Some(worktree::hash(
            serde_json::to_string(&proposal).unwrap().as_bytes()
        )),
        j.proposal_hash
    );
    // Injeção de falha no limite entre dois efeitos aprovados; mesma rotina de escrita do host.
    let first = worktree::Proposal {
        summary: proposal.summary,
        files: vec![proposal.files[0].clone()],
    };
    worktree::apply(&dir.join("worktrees").join(j.task), &first).unwrap();
    fs::write(dir.join("crash-ready"), "first approved file synced").unwrap();
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}

#[test]
#[ignore = "Requer API isolada e cofre real; SIGKILL em filho próprio, sem chamada de modelo"]
fn crash_restart() {
    let url = origin();
    let http = client();
    let session = http
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
    let dir = std::env::temp_dir().join(format!(
        "open-dot-recovery-{}-{}",
        std::process::id(),
        rand::random::<u64>()
    ));
    let project = dir.join("project");
    fs::create_dir_all(&project).unwrap();
    fs::write(dir.join("fixture-kind"), "open-dot-recovery-test").unwrap();
    fs::write(project.join("README.md"), "# Recovery fixture\n").unwrap();
    worktree::git(&project, &["init"], 16384).unwrap();
    worktree::git(&project, &["add", "README.md"], 16384).unwrap();
    worktree::git(
        &project,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "--no-gpg-sign",
            "-m",
            "test: isolated recovery base",
        ],
        16384,
    )
    .unwrap();
    let project = project.canonicalize().unwrap();
    let c = Arc::new(Mutex::new(channel::Channel::default()));
    let p = channel::begin(&c, url.clone(), "Recovery fixture".into()).unwrap();
    let pair = http
        .post(format!("{url}/api/runner/pairings/approve"))
        .header("cookie", &cookie)
        .header("x-open-dot", "1")
        .json(&json!({"code":p["code"],"name":"Recovery fixture"}))
        .send()
        .unwrap();
    assert_eq!(pair.status().as_u16(), 201);
    channel::confirm(&c, &dir).unwrap();
    struct Cleanup(channel::SharedChannel, PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = channel::disconnect(&self.0, &self.1);
        }
    }
    let _cleanup = Cleanup(c.clone(), dir.clone());
    beat(&c, &project);
    let device = channel::identity(&c).unwrap();
    let project_id = worktree::project_id(&project);
    let create = || {
        let r=http.post(format!("{url}/api/runner/tasks")).header("cookie",&cookie).header("x-open-dot","1").json(&json!({"deviceId":device,"projectId":project_id,"mechanism":"codex","prompt":"Synthetic recovery fixture; no model call","worktreeConsent":true,"requestKey":format!("{:08x}-1234-4234-8234-123456789abc",rand::random::<u32>())})).send().unwrap();
        assert_eq!(r.status().as_u16(), 201);
        r.json::<Value>().unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string()
    };
    let task = create();
    assert_eq!(
        channel::device_request(&c, "/api/runner/device/claim", Some(&json!({}))).unwrap()["task"]
            ["id"],
        task
    );
    let root = worktree::create(&project, &dir.join("worktrees"), &task, true).unwrap();
    let proposal = worktree::prepare(
        &root,
        worktree::Proposal {
            summary: "Two approved fixture files".into(),
            files: vec![
                worktree::Edit {
                    path: "one.txt".into(),
                    content: "approved one\n".into(),
                    before_content: None,
                        before_hash: None,
                },
                worktree::Edit {
                    path: "two.txt".into(),
                    content: "approved two\n".into(),
                    before_content: None,
                        before_hash: None,
                },
            ],
        },
    )
    .unwrap();
    let text = serde_json::to_string(&proposal).unwrap();
    let digest = worktree::hash(text.as_bytes());
    channel::device_request(
        &c,
        &format!("/api/runner/device/tasks/{task}/event"),
        Some(&json!({"seq":1,"kind":"proposal","text":text})),
    )
    .unwrap();
    let approved = http
        .post(format!("{url}/api/runner/tasks/{task}/decision"))
        .header("cookie", &cookie)
        .header("x-open-dot", "1")
        .json(&json!({"hash":digest,"decision":"approve"}))
        .send()
        .unwrap();
    assert!(approved.status().is_success());
    journal::save(
        &dir,
        &Journal {
            task: task.clone(),
            device: device.clone(),
            project: project_id.clone(),
            phase: "applying".into(),
            proposal_hash: Some(digest),
            seq: 1,
        },
    )
    .unwrap();
    let mut cmd = process::command(&std::env::current_exe().unwrap());
    cmd.args(["recovery_tests::crash_child", "--exact", "--ignored"])
        .env("OPEN_DOT_RECOVERY_FIXTURE", &dir);
    let mut child = process::Guard::new(cmd.spawn().unwrap());
    let until = Instant::now() + Duration::from_secs(20);
    while !dir.join("crash-ready").exists() {
        assert!(Instant::now() < until, "Filho não atingiu checkpoint");
        assert!(child.0.try_wait().unwrap().is_none());
        std::thread::sleep(Duration::from_millis(50));
    }
    assert_eq!(
        fs::read_to_string(root.join("one.txt")).unwrap(),
        "approved one\n"
    );
    assert!(!root.join("two.txt").exists());
    child.0.kill().unwrap();
    child.0.wait().unwrap();
    drop(child); // SIGKILL no Unix, sem limpeza cooperativa.
    let restored = Arc::new(Mutex::new(channel::restore(&dir)));
    beat(&restored, &project);
    assert!(executor::poll(&restored, &[project.clone()], &dir, &|p| p == project).unwrap());
    assert_eq!(
        fs::read_to_string(root.join("one.txt")).unwrap(),
        "approved one\n"
    );
    assert_eq!(
        fs::read_to_string(root.join("two.txt")).unwrap(),
        "approved two\n"
    );
    assert!(journal::load(&dir).unwrap().is_none());
    let events = http
        .get(format!("{url}/api/runner/tasks/{task}/events"))
        .header("cookie", &cookie)
        .send()
        .unwrap()
        .json::<Value>()
        .unwrap();
    assert_eq!(
        events["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["kind"] == "completed")
            .count(),
        1
    );
    assert!(!executor::poll(&restored, &[project.clone()], &dir, &|p| p == project).unwrap());
    // Explicit local commit consent is separate from the fixture file approval above.
    let (cp,reviewed)=crate::git_checkpoint::context(&dir,&task,&restored,&[project.clone()]).unwrap();
    let receipt=crate::git_checkpoint::create(&dir,&cp,&reviewed,"commit-exact-reviewed-files-locally").unwrap();
    assert_eq!(receipt.stage,"committed");
    let repeat=crate::git_checkpoint::create(&dir,&cp,&reviewed,"commit-exact-reviewed-files-locally").unwrap();
    assert_eq!(repeat.commit_sha,receipt.commit_sha);
    assert_eq!(String::from_utf8(worktree::git(&root,&["rev-list","--count",&format!("{}..HEAD",receipt.base_sha)],4096).unwrap()).unwrap().trim(),"1");
    println!("REAL_NATIVE_GIT_CHECKPOINT_PASS: authenticated receipt, exact fixture files, separate local consent, one semantic commit on owned branch; retry returned same SHA. No model or native-window click claim.");
    // Outra tarefa fica reservada sem journal: não reiniciar geração nem tocar em arquivos existentes.
    let orphan = create();
    channel::device_request(&restored, "/api/runner/device/claim", Some(&json!({}))).unwrap();
    let orphan_root = worktree::create(&project, &dir.join("worktrees"), &orphan, true).unwrap();
    fs::write(orphan_root.join("preserved.txt"), "uncertain prior effect").unwrap();
    assert!(executor::poll(&restored, &[project.clone()], &dir, &|p| p == project).unwrap());
    assert_eq!(
        fs::read_to_string(orphan_root.join("preserved.txt")).unwrap(),
        "uncertain prior effect"
    );
    assert_eq!(
        channel::device_request(
            &restored,
            &format!("/api/runner/device/tasks/{orphan}/approval"),
            None
        )
        .unwrap()["state"],
        "uncertain"
    );
    assert!(
        channel::device_request(&restored, "/api/runner/device/active", None).unwrap()["active"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(worktree::git(&project, &["status", "--porcelain"], 16384)
        .unwrap()
        .is_empty());
    channel::disconnect(&restored, &dir).unwrap();
    println!("RECOVERY_CRASH_PASS: actual child killed, HTTP/SQLite/vault/worktree restored; approved fixture finished once; orphan closed without replay; original clean. No model call, no GUI proof.");
}
