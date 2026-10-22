// SPDX-License-Identifier: AGPL-3.0-only
//! Processos do host: argv estruturado, ambiente mínimo, saída e tempo limitados.
//! v0.3 (C4/G4): registro dos processos que o PRÓPRIO Runner iniciou (PID, grupo, horário, tarefa),
//! encerramento só desses (educado e depois forçado, nunca por nome) e prioridade baixa.
use std::{
    io::{Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};
pub struct Guard(pub Child);
impl Drop for Guard {
    fn drop(&mut self) {
        #[cfg(unix)]
        unsafe {
            libc::kill(-(self.0.id() as i32), libc::SIGKILL);
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
        if let Ok(mut ids) = children().lock() {
            ids.retain(|e| e.pid != self.0.id());
        }
    }
}
pub fn command(executable: &Path) -> Command {
    let mut c = Command::new(executable);
    // O CLI continua responsável pela sua própria autenticação; nenhum cache é copiado.
    let keep = [
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "PATH",
        "SystemRoot",
        "WINDIR",
        "TMPDIR",
        "TEMP",
        "TMP",
        "LANG",
        "LC_ALL",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "CODEX_HOME",
    ];
    let vars: Vec<_> = keep
        .iter()
        .filter_map(|k| std::env::var_os(k).map(|v| (*k, v)))
        .collect();
    c.env_clear().envs(vars);
    c.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            c.pre_exec(|| {
                if libc::setpgid(0, 0) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                libc::umask(0o077);
                // Boa vizinhança (G4): prioridade reduzida (nice 10) para não disputar com o usuário.
                libc::setpriority(libc::PRIO_PROCESS, 0, 10);
                for (resource, value) in [(libc::RLIMIT_CPU, 120), (libc::RLIMIT_NOFILE, 256)] {
                    let limit = libc::rlimit {
                        rlim_cur: value,
                        rlim_max: value,
                    };
                    if libc::setrlimit(resource, &limit) != 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                }
                Ok(())
            });
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS (G4; sem teste real no Windows).
        c.creation_flags(0x08000000 | 0x00004000);
    }
    c
}
pub fn bounded(mut command: Command, timeout: Duration, cap: usize) -> Result<Vec<u8>, String> {
    if stopping() {
        return Err("Runner encerrando: não vou iniciar outro processo.".into());
    }
    let mut g = Guard::new(
        command
            .spawn()
            .map_err(|_| "Não consegui iniciar a ferramenta oficial.")?,
    );
    let out = g.0.stdout.take().ok_or("Saída indisponível.")?;
    let (tx, rx) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut b = Vec::new();
        let r = out.take((cap + 1) as u64).read_to_end(&mut b);
        let _ = tx.send((r, b));
    });
    let start = Instant::now();
    let status = loop {
        match g.0.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if start.elapsed() < timeout => std::thread::sleep(Duration::from_millis(25)),
            _ => return Err("A ferramenta excedeu o tempo permitido ou foi interrompida.".into()),
        }
    };
    let (r, b) = rx
        .recv_timeout(Duration::from_secs(1))
        .map_err(|_| "Saída interrompida.")?;
    r.map_err(|_| "Saída ilegível.")?;
    if !status.success() || b.len() > cap {
        return Err("A ferramenta recusou a operação ou excedeu o limite de saída.".into());
    }
    Ok(b)
}
pub fn write_json(child: &mut Guard, value: &serde_json::Value) -> Result<(), String> {
    let input = child
        .0
        .stdin
        .as_mut()
        .ok_or("Canal do mecanismo indisponível.")?;
    let mut bytes = serde_json::to_vec(value).map_err(|_| "Mensagem inválida.")?;
    bytes.push(b'\n');
    input
        .write_all(&bytes)
        .map_err(|_| "O mecanismo encerrou a conexão.".into())
}
/// Metadados de um processo iniciado pelo Runner. Nada de caminho, argumento ou conteúdo.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub pid: u32,
    /// Grupo de processos (= pid no Unix, por `setpgid(0, 0)`).
    pub group: u32,
    pub started_ms: u64,
    pub task: Option<String>,
    pub kind: &'static str,
    pub label: String,
}
static CHILDREN: std::sync::OnceLock<std::sync::Mutex<Vec<Entry>>> = std::sync::OnceLock::new();
static STOPPING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
fn children() -> &'static std::sync::Mutex<Vec<Entry>> {
    CHILDREN.get_or_init(|| std::sync::Mutex::new(Vec::new()))
}
fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
/// Processos que o Runner iniciou e ainda estão registrados.
pub fn list() -> Vec<Entry> {
    children().lock().map(|v| v.clone()).unwrap_or_default()
}
#[cfg_attr(not(test), allow(dead_code))]
pub fn owned(pid: u32) -> bool {
    children().lock().map(|v| v.iter().any(|e| e.pid == pid)).unwrap_or(false)
}
/// Encerra SÓ um processo do registro: sinal educado ao grupo, espera, depois forçado.
/// Processo fora do registro é recusado (não foi iniciado pelo Runner).
pub fn terminate(pid: u32, grace: Duration) -> Result<(), String> {
    let entry = children().lock().map_err(|_| "Registro indisponível.")?.iter().find(|e| e.pid == pid).cloned();
    let Some(entry) = entry else { return Err("Esse processo não foi iniciado pelo Runner: só pode ser encerrado por você.".into()) };
    #[cfg(unix)]
    {
        let group = -(entry.group as i32);
        unsafe {
            libc::kill(group, libc::SIGTERM);
        }
        let start = Instant::now();
        while start.elapsed() < grace {
            if unsafe { libc::kill(entry.pid as i32, 0) } != 0 {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        unsafe {
            libc::kill(group, libc::SIGKILL);
        }
    }
    #[cfg(not(unix))]
    {
        let _ = grace;
        return Err("Encerrar processos ainda não está disponível neste sistema.".into());
    }
    if let Ok(mut v) = children().lock() {
        v.retain(|e| e.pid != entry.pid);
    }
    Ok(())
}
impl Guard {
    pub fn new(child: Child) -> Self {
        Self::with_meta(child, None, "ferramenta", "Ferramenta de IA oficial")
    }
    pub fn with_meta(child: Child, task: Option<String>, kind: &'static str, label: &str) -> Self {
        let g = Self(child);
        if let Ok(mut ids) = children().lock() {
            ids.push(Entry { pid: g.0.id(), group: g.0.id(), started_ms: now_ms(), task, kind, label: label.chars().take(80).collect() });
        }
        if STOPPING.load(std::sync::atomic::Ordering::SeqCst) {
            #[cfg(unix)]
            unsafe {
                libc::kill(-(g.0.id() as i32), libc::SIGKILL);
            }
        }
        g
    }
}
pub fn stopping() -> bool {
    STOPPING.load(std::sync::atomic::Ordering::SeqCst)
}
pub fn shutdown() {
    STOPPING.store(true, std::sync::atomic::Ordering::SeqCst);
    if let Ok(ids) = children().lock() {
        for e in ids.iter() {
            #[cfg(unix)]
            unsafe {
                libc::kill(-(e.group as i32), libc::SIGKILL);
            }
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    fn sleeper() -> Guard {
        let mut c = command(Path::new("/bin/sleep"));
        c.arg("30");
        Guard::with_meta(c.spawn().unwrap(), Some("tarefa-teste".into()), "teste", "processo sintético de teste")
    }
    #[test]
    fn registry_lists_and_terminates_only_own_children() {
        let g = sleeper();
        let pid = g.0.id();
        let e = list().into_iter().find(|e| e.pid == pid).expect("registrado");
        assert_eq!(e.task.as_deref(), Some("tarefa-teste"));
        assert_eq!(e.group, pid);
        // O pai do teste não está no registro: recusado.
        assert!(terminate(std::process::id(), Duration::from_millis(10)).is_err());
        assert!(terminate(1, Duration::from_millis(10)).is_err(), "nunca encerra processo de terceiros");
        terminate(pid, Duration::from_secs(2)).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        assert!(!owned(pid));
        drop(g);
    }
    #[test]
    fn children_run_with_lower_priority() {
        let mut c = command(Path::new("/bin/sh"));
        c.args(["-c", "ps -o nice= -p $$"]);
        let out = bounded(c, Duration::from_secs(5), 64).unwrap();
        let nice: i32 = String::from_utf8(out).unwrap().trim().parse().unwrap();
        assert!(nice >= 10, "nice {nice}");
    }
}
