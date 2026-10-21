// SPDX-License-Identifier: AGPL-3.0-only
//! Canal de saída. Token nunca passa pelo IPC ou frontend. Sem fallback em arquivo.
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub origin: String,
    pub device_id: String,
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub paired: bool,
    pub online: bool,
    pub message: String,
    pub device_id: Option<String>,
}
struct Pending {
    origin: String,
    id: String,
    secret: String,
    token: String,
    deadline: Instant,
}
#[derive(Default)]
pub struct Channel {
    pub status: Status,
    pending: Option<Pending>,
    link: Option<Link>,
    token: Option<String>,
    revocation_dir: Option<std::path::PathBuf>,
    revoking: bool,
    cancelled: std::collections::HashSet<String>,
}
pub type SharedChannel = Arc<Mutex<Channel>>;
fn digest(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
fn secret() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut b = [0u8; 43];
    rand::rngs::OsRng.fill_bytes(&mut b);
    b.iter()
        .map(|v| ALPHABET[(v & 63) as usize] as char)
        .collect()
}
fn origin(s: &str) -> Result<String, String> {
    let u = reqwest::Url::parse(s).map_err(|_| "URL inválida.")?;
    let local = matches!(u.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(u.scheme() == "https" || (cfg!(debug_assertions) && local && u.scheme() == "http"))
        || u.path() != "/"
        || u.query().is_some()
        || u.fragment().is_some()
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return Err("Use a origem HTTPS do Open Dot, sem caminho ou credenciais. HTTP local somente em debug.".into());
    }
    Ok(u.origin().ascii_serialization())
}
fn http() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Rede indisponível.".into())
}
fn entry(link: &Link) -> Result<keyring::Entry, String> {
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Err("Cofre nativo não suportado nesta plataforma.".into());
    }
    keyring::Entry::new(
        "com.opendot.runner",
        &format!("{}:{}", digest(&link.origin), link.device_id),
    )
    .map_err(|_| "Cofre do sistema indisponível; nenhum token foi salvo.".into())
}
pub fn restore(dir: &Path) -> Channel {
    let mut c = Channel::default();
    if let Ok(bytes) = fs::read(dir.join("link.json")) {
        if let Ok(link) = serde_json::from_slice::<Link>(&bytes) {
            if origin(&link.origin).is_ok() {
                if let Ok(token) =
                    entry(&link).and_then(|e| e.get_password().map_err(|_| "".into()))
                {
                    c.status = Status {
                        paired: true,
                        online: false,
                        message: "Reconectando…".into(),
                        device_id: Some(link.device_id.clone()),
                    };
                    c.revocation_dir=Some(dir.to_path_buf());
                    c.revoking=dir.join("revocation-pending").exists();
                    if c.revoking {c.status.message="Revogação remota pendente. Execução bloqueada.".into();}
                    c.link = Some(link);
                    c.token = Some(token);
                }
            }
        }
    }
    c
}
pub fn begin(c: &SharedChannel, url: String, name: String) -> Result<Value, String> {
    let url = origin(&url)?;
    let mut guard = c.lock().map_err(|_| "Canal ocupado.")?;
    if guard.link.is_some() {
        return Err("Desconecte o dispositivo atual antes de parear outro.".into());
    }
    let token = secret();
    let proof = secret();
    let res = http()?
        .post(format!("{url}/api/runner/pairings"))
        .json(&json!({"secretHash":digest(&proof),"tokenHash":digest(&token),"name":name}))
        .send()
        .map_err(|_| "Não consegui alcançar o Open Dot.")?;
    if !res.status().is_success() {
        return Err("Pareamento recusado. Confira o endereço e tente novamente.".into());
    }
    let data: Value = read_json(res)?;
    let id = data["id"].as_str().ok_or("Resposta inválida.")?.to_string();
    guard.pending = Some(Pending {
        origin: url,
        id,
        secret: proof,
        token,
        deadline: Instant::now() + Duration::from_secs(300),
    });
    guard.status.message = "Confirme o código e o nome no Workspace autenticado.".into();
    Ok(json!({"code":data["code"],"expiresAt":data["expiresAt"]}))
}
pub fn confirm(c: &SharedChannel, dir: &Path) -> Result<Status, String> {
    let mut guard = c.lock().map_err(|_| "Canal ocupado.")?;
    let p = guard.pending.as_ref().ok_or("Gere um código primeiro.")?;
    if Instant::now() > p.deadline {
        guard.pending = None;
        return Err("Código expirado.".into());
    }
    let res = http()?
        .post(format!("{}/api/runner/pairings/{}/status", p.origin, p.id))
        .json(&json!({"secret":p.secret}))
        .send()
        .map_err(|_| "Conexão interrompida. Tente novamente.")?;
    if !res.status().is_success() {
        return Err("Pareamento expirado ou recusado.".into());
    }
    let data: Value = read_json(res)?;
    let Some(id) = data["deviceId"].as_str() else {
        return Err("A confirmação ainda não chegou. Confira o Workspace.".into());
    };
    let link = Link {
        origin: p.origin.clone(),
        device_id: id.into(),
    };
    let token = p.token.clone();
    entry(&link)?
        .set_password(&token)
        .map_err(|_| "Não consegui salvar no cofre do sistema; pareamento não ativado.")?;
    let bytes = serde_json::to_vec(&link).map_err(|_| "Configuração inválida.")?;
    if fs::write(dir.join("link.json"), bytes).is_err() {
        let _ = entry(&link)?.delete_credential();
        return Err("Não consegui salvar o vínculo.".into());
    }
    guard.status = Status {
        paired: true,
        online: false,
        message: "Vínculo confirmado. Aguardando heartbeat.".into(),
        device_id: Some(link.device_id.clone()),
    };
    guard.revocation_dir=Some(dir.to_path_buf());
    guard.link = Some(link);
    guard.token = Some(token);
    guard.pending = None;
    Ok(guard.status.clone())
}
pub fn disconnect(c: &SharedChannel, dir: &Path) -> Result<(), String> {
    let mut g = c.lock().map_err(|_| "Canal ocupado.")?;
    // Marcar antes da rede: nunca anunciar revogação sem confirmação nem retomar ao reiniciar.
    if let (Some(link),Some(token))=(g.link.clone(),g.token.clone()) {
        use std::io::Write;
        let mut marker=fs::OpenOptions::new().write(true).create(true).truncate(true).open(dir.join("revocation-pending"))
            .map_err(|_|"Não consegui preservar o pedido de revogação. Tente novamente.")?;
        marker.write_all(b"pending").and_then(|_|marker.sync_all()).map_err(|_|"Pedido de revogação não persistido.")?;
        crate::journal::sync_directory(dir)?;
        g.revoking=true;g.revocation_dir=Some(dir.to_path_buf());g.status.online=false;
        g.status.message="Desconectado localmente; revogação remota pendente.".into();
        let res=http()?.post(format!("{}/api/runner/device/revoke",link.origin)).bearer_auth(token).json(&json!({})).send()
            .map_err(|_|"Desconectado localmente. Sem rede para confirmar revogação; tentarei novamente. Você também pode revogar pelo Workspace.")?;
        if res.status().as_u16()!=401 {
            if !res.status().is_success() || read_json(res)?["revoked"]!=true {
                return Err("Desconectado localmente; servidor não confirmou revogação. Atualize ou revogue pelo Workspace.".into());
            }
        }
    }
    if let Some(l) = &g.link {
        entry(l)?
            .delete_credential()
            .map_err(|_| "Não consegui remover o vínculo do cofre.")?;
    }
    match fs::remove_file(dir.join("link.json")) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Não consegui remover o vínculo local.".into()),
    }
    match fs::remove_file(dir.join("revocation-pending")) {
        Ok(())=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(_)=>return Err("Revogado remotamente; limpeza local pendente.".into())
    }
    *g = Channel::default();
    g.status.message="Acesso remoto revogado ou expirado; vínculo local removido.".into();
    Ok(())
}
fn hello()->Value { json!({"version":2,"approval":"sha256-utf8-json-v1","capabilities":["exact-content-approval","uncertain-terminal","lease-fencing","event-receipts","worktree-consent","review-before-content"]}) }
fn compatible(p:&Value)->bool {
 p["version"]==2 && p["approval"]=="sha256-utf8-json-v1" && p["schemaReady"]==true && hello()["capabilities"].as_array().unwrap().iter().all(|c|p["capabilities"].as_array().is_some_and(|v|v.contains(c)))
}
fn negotiated_drivers(mut drivers:Value,protocol:&Value)->Value {
    if protocol["driverFeaturesVersion"]!=1 {
        if let Some(list)=drivers.as_array_mut(){for driver in list {if let Some(row)=driver.as_object_mut(){row.remove("features");}}}
    }
    drivers
}
pub fn heartbeat(c: &SharedChannel, projects: Value, drivers: Value) {
    let retry=c.lock().ok().and_then(|g|if g.revoking {g.revocation_dir.clone()}else{None});
    if let Some(dir)=retry {let _=disconnect(c,&dir);return;}
    // Não guardar o lock durante a rede: a UI e a revogação continuam disponíveis.
    let snapshot = c
        .lock()
        .ok()
        .and_then(|g| Some((g.link.clone()?, g.token.clone()?)));
    let Some((link, token)) = snapshot else {
        return;
    };
    let res = http().and_then(|h| {
        let negotiation=h.get(format!("{}/api/runner/protocol",link.origin)).send().map_err(|_| "Negociação indisponível.")?;
        if !negotiation.status().is_success(){return Err("Servidor sem negociação de protocolo.".into());}
        let protocol=read_json(negotiation)?;
        if !compatible(&protocol){return Err("Servidor incompatível ou migração pendente.".into());}
        h.post(format!("{}/api/runner/device/heartbeat", link.origin))
            .bearer_auth(token)
            .json(&json!({"projects":projects,"drivers":negotiated_drivers(drivers,&protocol),"protocol":hello()}))
            .send()
            .map_err(|_| "Conexão interrompida.".into())
    });
    if let Ok(mut g) = c.lock() {
        if g.revoking || g.link.as_ref().map(|l| &l.device_id) != Some(&link.device_id) {
            return;
        }
        match res {
            Ok(r) if r.status().is_success() => {
                if let Ok(data) = read_json(r) {
                    if let Some(active) = data["active"].as_array().filter(|_|data["compatible"]==true) {
                        g.cancelled = active
                            .iter()
                            .filter(|v| v["cancel_requested"] == 1)
                            .filter_map(|v| v["id"].as_str().map(str::to_string))
                            .collect();
                        g.status.online = true;
                        g.status.message =
                            "Conectado · disponibilidade confirmada pelo servidor.".into();
                    } else {
                        g.status.online = false;
                        g.status.message = "Resposta de heartbeat incompatível.".into();
                    }
                } else {
                    g.status.online = false;
                    g.status.message = "Não consegui confirmar a disponibilidade.".into();
                }
            }
            Ok(r) if r.status().as_u16() == 401 => {
                g.token = None;
                g.status.paired = false;
                g.status.online = false;
                g.status.message =
                    "Vínculo revogado ou expirado. Desconecte e pareie novamente.".into();
            }
            Err(ref reason) => {
                g.status.online=false;
                g.status.message=reason.clone();
            }
            _ => {
                g.status.online = false;
                g.status.message = "Sem confirmação do servidor. Tentando reconectar…".into();
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn driver_features_are_only_sent_to_opted_in_servers() {
        let driver=json!([{"id":"codex","features":{"version":1}}]);
        assert!(negotiated_drivers(driver.clone(),&json!({}))[0].get("features").is_none());
        assert!(negotiated_drivers(driver.clone(),&json!({"driverFeaturesVersion":2}))[0].get("features").is_none());
        assert_eq!(negotiated_drivers(driver.clone(),&json!({"driverFeaturesVersion":1})),driver);
    }
    #[test]
    fn protocol_must_match_and_migrations_be_ready() {
        let mut p=hello(); p["schemaReady"]=json!(true);assert!(compatible(&p));
        for (key,value) in [("version",json!(1)),("approval",json!("other")),("schemaReady",json!(false)),("capabilities",json!([]))] {
            let mut bad=p.clone();bad[key]=value;assert!(!compatible(&bad));
        }
        assert!(!compatible(&json!({"active":[]})));
    }
    #[test]
    fn disconnect_network_failure_is_pending_and_blocks_execution() {
        use std::net::TcpListener;
        use std::io::{Read,Write};
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
        let server=std::thread::spawn(move||{let(mut stream,_)=listener.accept().unwrap();let mut bytes=[0;4096];let _=stream.read(&mut bytes);stream.write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();});
        let dir=std::env::temp_dir().join(format!("od-revoke-pending-{}",rand::random::<u64>()));fs::create_dir(&dir).unwrap();
        let mut channel=Channel::default();let id="f11c1820-5a7c-47e9-90d4-22c78ed0ca21";
        channel.link=Some(Link{origin:format!("http://{address}"),device_id:id.into()});channel.token=Some(secret());
        channel.status=Status{paired:true,online:true,message:String::new(),device_id:Some(id.into())};
        let c=Arc::new(Mutex::new(channel));assert!(disconnect(&c,&dir).is_err());assert!(dir.join("revocation-pending").exists());
        assert!(!live(&c,id,""));assert!(c.lock().unwrap().token.is_some());assert!(c.lock().unwrap().status.message.contains("pendente"));server.join().unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn urls() {
        assert!(origin("https://example.com").is_ok());
        assert!(origin("https://u:p@example.com").is_err());
        assert!(origin("https://example.com/path").is_err());
        assert!(origin("http://example.com").is_err());
    }
    #[test]
    fn secrets() {
        let a = secret();
        assert_eq!(a.len(), 43);
        assert_ne!(a, secret());
        assert_eq!(digest(&a).len(), 64);
    }
}

#[cfg(test)]
mod live_tests {
    use super::*;
    #[test]
    #[ignore = "Requer servidor HTTP local isolado e cofre nativo real; não é E2E de tarefas"]
    fn real_channel_and_vault() {
        let url =
            std::env::var("OPEN_DOT_CHANNEL_TEST_ORIGIN").expect("servidor isolado necessário");
        assert!(url.starts_with("http://127.0.0.1:"));
        let client = http().unwrap();
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
        let dir = std::env::temp_dir().join(format!("open-dot-channel-smoke-{}", secret()));
        fs::create_dir(&dir).unwrap();
        let c = Arc::new(Mutex::new(Channel::default()));
        let p = begin(&c, url.clone(), "Native channel smoke".into()).unwrap();
        let r = client
            .post(format!("{url}/api/runner/pairings/approve"))
            .header("cookie", &cookie)
            .header("x-open-dot", "1")
            .json(&json!({"code":p["code"],"name":"Native channel smoke"}))
            .send()
            .unwrap();
        assert_eq!(r.status().as_u16(), 201);
        let state = confirm(&c, &dir).unwrap();
        assert!(state.paired);
        assert!(!state.online);
        let restored = Arc::new(Mutex::new(restore(&dir)));
        assert!(restored.lock().unwrap().status.paired);
        heartbeat(&restored, json!([]), json!([]));
        assert!(restored.lock().unwrap().status.online);
        let r: Value = client
            .get(format!("{url}/api/runner/devices"))
            .header("cookie", &cookie)
            .send()
            .unwrap()
            .json()
            .unwrap();
        assert_eq!(r["devices"][0]["online"], true);
        let device_id = state.device_id.unwrap();
        let r = client
            .post(format!("{url}/api/runner/devices/{device_id}/revoke"))
            .header("cookie", &cookie)
            .header("x-open-dot", "1")
            .send()
            .unwrap();
        assert!(r.status().is_success());
        heartbeat(&restored, json!([]), json!([]));
        assert!(!restored.lock().unwrap().status.paired);
        assert!(!restored.lock().unwrap().status.online);
        disconnect(&restored, &dir).unwrap();
        assert!(!restore(&dir).status.paired);
        let p=begin(&restored,url.clone(),"Native disconnect smoke".into()).unwrap();
        let r=client.post(format!("{url}/api/runner/pairings/approve")).header("cookie",&cookie).header("x-open-dot","1").json(&json!({"code":p["code"],"name":"Native disconnect smoke"})).send().unwrap();assert!(r.status().is_success());
        confirm(&restored,&dir).unwrap();
        let prior_token=restored.lock().unwrap().token.clone().unwrap();
        disconnect(&restored,&dir).unwrap();
        let replay=client.post(format!("{url}/api/runner/device/heartbeat")).bearer_auth(prior_token).json(&json!({"projects":[],"drivers":[],"protocol":hello()})).send().unwrap();assert_eq!(replay.status().as_u16(),401);
        assert!(!restore(&dir).status.paired);
        fs::remove_dir(&dir).unwrap();
        println!("REAL_CHANNEL_PASS: HTTP, SQLite, session, pairing, native vault, restart, heartbeat, revocation, cleanup. No driver task executed.");
    }
}

/// API interna do nativo. Não é comando Tauri e nunca retorna o bearer para a UI.
pub fn device_request(
    c: &SharedChannel,
    path: &str,
    body: Option<&Value>,
) -> Result<Value, String> {
    if !path.starts_with("/api/runner/device/") {
        return Err("Rota de dispositivo inválida.".into());
    }
    let snapshot = {
        let g = c.lock().map_err(|_| "Canal indisponível.")?;
        g.link.clone().zip(g.token.clone())
    };
    let Some((link, token)) = snapshot else {
        return Err("Dispositivo sem vínculo ativo.".into());
    };
    let h = http()?;
    let request = if let Some(data) = body {
        h.post(format!("{}{path}", link.origin)).json(data)
    } else {
        h.get(format!("{}{path}", link.origin))
    };
    let response = request
        .bearer_auth(token)
        .send()
        .map_err(|_| "Conexão interrompida com o Open Dot.")?;
    if !response.status().is_success() {
        return Err(
            "O servidor recusou a operação de dispositivo. Confira conexão, revogação e versão."
                .into(),
        );
    }
    read_json(response)
}
fn read_json(response: reqwest::blocking::Response) -> Result<Value, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    response
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|_| "Resposta interrompida.")?;
    if bytes.len() > 65536 {
        return Err("Resposta excedeu o limite de segurança.".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "Resposta inválida do Open Dot.".into())
}
pub fn live(c: &SharedChannel, device: &str, task: &str) -> bool {
    c.lock()
        .map(|g| {
            !g.revoking
                && g.status.paired
                && g.status.online
                && g.status.device_id.as_deref() == Some(device)
                && !g.cancelled.contains(task)
        })
        .unwrap_or(false)
}
pub fn identity(c: &SharedChannel) -> Option<String> {
    c.lock().ok()?.status.device_id.clone()
}
