// SPDX-License-Identifier: AGPL-3.0-only
//! Processos do host: argv estruturado, ambiente mínimo, saída e tempo limitados.
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
            ids.retain(|id| *id != self.0.id());
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
        c.creation_flags(0x08000000);
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
static CHILDREN: std::sync::OnceLock<std::sync::Mutex<Vec<u32>>> = std::sync::OnceLock::new();
static STOPPING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
fn children() -> &'static std::sync::Mutex<Vec<u32>> {
    CHILDREN.get_or_init(|| std::sync::Mutex::new(Vec::new()))
}
impl Guard {
    pub fn new(child: Child) -> Self {
        let g = Self(child);
        if let Ok(mut ids) = children().lock() {
            ids.push(g.0.id());
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
        for id in ids.iter() {
            #[cfg(unix)]
            unsafe {
                libc::kill(-(*id as i32), libc::SIGKILL);
            }
        }
    }
}
