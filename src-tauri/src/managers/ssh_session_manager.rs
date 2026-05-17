use std::collections::HashMap;
use std::sync::Arc;

use russh::client::{self, Config, Handle};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use russh::ChannelMsg;
use serde::Serialize;
use tauri::ipc::Channel;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_socks::tcp::socks5::Socks5Stream;

// ── Public event types (sent to frontend via Tauri Channel) ─────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TerminalDataEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalStatusEvent {
    pub session_id: String,
    /// "connecting" | "connected" | "disconnected" | "error"
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum TerminalChannelMessage {
    Data(TerminalDataEvent),
    Status(TerminalStatusEvent),
}

// ── Session handle (stored in manager) ──────────────────────────────────────

pub struct SshSessionHandle {
    pub id: String,
    pub server_id: String,
    /// Send raw bytes to the SSH channel stdin
    pub input_tx: mpsc::Sender<Vec<u8>>,
    /// Send (cols, rows) resize events to the SSH channel
    pub resize_tx: mpsc::Sender<(u16, u16)>,
    /// Signal the pump loop to exit gracefully
    pub abort_tx: oneshot::Sender<()>,
}

// ── Manager ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct SshSessionManager {
    pub sessions: Arc<Mutex<HashMap<String, SshSessionHandle>>>,
}

impl SshSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn add(&self, handle: SshSessionHandle) {
        let mut sessions = self.sessions.lock().await;
        sessions.insert(handle.id.clone(), handle);
    }

    pub async fn remove(&self, session_id: &str) -> bool {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            let _ = handle.abort_tx.send(());
            true
        } else {
            false
        }
    }

    pub async fn send_input(&self, session_id: &str, data: Vec<u8>) -> bool {
        let sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.get(session_id) {
            handle.input_tx.try_send(data).is_ok()
        } else {
            false
        }
    }

    pub async fn send_resize(&self, session_id: &str, cols: u16, rows: u16) -> bool {
        let sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.get(session_id) {
            handle.resize_tx.try_send((cols, rows)).is_ok()
        } else {
            false
        }
    }
}

impl Default for SshSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

// ── Config for establishing a session (passed to spawn task) ────────────────

#[derive(Clone)]
pub struct SshConnectConfig {
    pub session_id: String,
    pub server_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuthMethod,
    pub initial_cols: u16,
    pub initial_rows: u16,
    pub channel: Channel<TerminalChannelMessage>,
    pub proxy: Option<ProxyConfig>,
}

#[derive(Debug, Clone)]
pub enum SshAuthMethod {
    Password(String),
    PrivateKey { path: String, passphrase: Option<String> },
}

/// Proxy configuration resolved by the frontend before connecting.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ProxyConfig {
    /// "http" | "socks5"
    pub proxy_type: String,
    pub host: String,
    pub port: u16,
    /// newline-separated bypass list; used by local PTY for NO_PROXY injection
    pub bypass: Option<String>,
}

// ── russh client handler ─────────────────────────────────────────────────────

struct SshClientHandler;

impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
        // MVP: accept all host keys
        async { Ok(true) }
    }
}

// ── Session lifecycle ────────────────────────────────────────────────────────

/// Spawns an async task that connects via russh, authenticates, opens a PTY
/// channel, and pumps data bidirectionally until the session ends.
pub async fn establish_session(
    manager: SshSessionManager,
    config: SshConnectConfig,
) {
    let session_id = config.session_id.clone();
    let channel = config.channel.clone();

    // Send "connecting" immediately so frontend shows yellow dot
    channel.send(TerminalChannelMessage::Status(TerminalStatusEvent {
        session_id: session_id.clone(),
        status: "connecting".to_string(),
        reason: None,
    })).ok();

    if let Err(err) = run_session(manager.clone(), config).await {
        channel.send(TerminalChannelMessage::Status(TerminalStatusEvent {
            session_id: session_id.clone(),
            status: "error".to_string(),
            reason: Some(err.to_string()),
        })).ok();
        manager.remove(&session_id).await;
    }
}

/// Opens a TCP stream to `target_host:target_port`, tunnelling through `proxy` if provided.
async fn build_proxied_stream(
    target_host: &str,
    target_port: u16,
    proxy: Option<&ProxyConfig>,
) -> Result<TcpStream, Box<dyn std::error::Error + Send + Sync>> {
    match proxy {
        None => {
            let stream = TcpStream::connect((target_host, target_port)).await?;
            Ok(stream)
        }
        Some(p) if p.proxy_type == "socks5" => {
            eprintln!("[proxy] SOCKS5 via {}:{}", p.host, p.port);
            let socks = Socks5Stream::connect(
                (p.host.as_str(), p.port),
                (target_host, target_port),
            )
            .await
            .map_err(|e| format!("SOCKS5 proxy error: {}", e))?;
            Ok(socks.into_inner())
        }
        Some(p) => {
            // HTTP CONNECT
            eprintln!("[proxy] HTTP CONNECT via {}:{}", p.host, p.port);
            let mut stream = TcpStream::connect((p.host.as_str(), p.port)).await?;
            let req = format!(
                "CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n",
                host = target_host,
                port = target_port,
            );
            stream.write_all(req.as_bytes()).await?;

            // Read response headers byte-by-byte until \r\n\r\n
            let mut resp = Vec::with_capacity(256);
            let mut buf = [0u8; 1];
            loop {
                if resp.len() >= 4096 {
                    return Err("HTTP proxy response too large".into());
                }
                stream.read_exact(&mut buf).await?;
                resp.push(buf[0]);
                if resp.ends_with(b"\r\n\r\n") {
                    break;
                }
            }

            let resp_str = String::from_utf8_lossy(&resp);
            let status_line = resp_str.lines().next().unwrap_or("");
            let status_code = status_line.split_whitespace().nth(1).unwrap_or("");
            if status_code != "200" {
                return Err(format!("HTTP proxy rejected: {}", status_line.trim()).into());
            }
            eprintln!("[proxy] HTTP CONNECT OK");
            Ok(stream)
        }
    }
}

async fn run_session(
    manager: SshSessionManager,
    config: SshConnectConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let session_id = config.session_id.clone();
    let channel = config.channel.clone();

    // 1. TCP connect + SSH handshake
    let russh_config = Arc::new(Config {
        keepalive_interval: Some(std::time::Duration::from_secs(30)),
        keepalive_max: 5,
        ..Config::default()
    });
    let addr = format!("{}:{}", config.host, config.port);
    eprintln!("[ssh] Connecting to {}", addr);
    let stream = build_proxied_stream(&config.host, config.port, config.proxy.as_ref())
        .await
        .map_err(|e| { eprintln!("[ssh] TCP connect failed: {}", e); e })?;
    eprintln!("[ssh] TCP connect OK");
    let mut ssh_handle: Handle<SshClientHandler> =
        client::connect_stream(russh_config, stream, SshClientHandler).await
        .map_err(|e| { eprintln!("[ssh] SSH handshake failed: {}", e); e })?;
    eprintln!("[ssh] TCP+handshake OK");

    // 2. Authenticate
    eprintln!("[ssh] Authenticating as '{}'", config.username);
    let auth_result = match &config.auth {
        SshAuthMethod::Password(password) => {
            ssh_handle
                .authenticate_password(config.username.as_str(), password.as_str())
                .await
                .map_err(|e| { eprintln!("[ssh] authenticate_password error: {}", e); e })?
        }
        SshAuthMethod::PrivateKey { path, passphrase } => {
            let expanded = shellexpand::tilde(path).to_string();
            eprintln!("[ssh] Loading key from: {}", expanded);
            let key = load_secret_key(&expanded, passphrase.as_deref())
                .map_err(|e| { eprintln!("[ssh] load_secret_key error: {}", e); e })?;
            let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(key), None);
            ssh_handle
                .authenticate_publickey(config.username.as_str(), key_with_alg)
                .await
                .map_err(|e| { eprintln!("[ssh] authenticate_publickey error: {}", e); e })?
        }
    };

    if !auth_result.success() {
        eprintln!("[ssh] Authentication rejected by server");
        return Err("Authentication failed".into());
    }
    eprintln!("[ssh] Authenticated OK");

    // 3. Open session ssh_channel, request PTY and shell
    eprintln!("[ssh] Opening ssh_channel");
    let mut ssh_channel = ssh_handle.channel_open_session().await
        .map_err(|e| { eprintln!("[ssh] channel_open_session error: {}", e); e })?;
    eprintln!("[ssh] Requesting PTY");
    ssh_channel
        .request_pty(
            true,
            "xterm-256color",
            config.initial_cols as u32,
            config.initial_rows as u32,
            0,
            0,
            &[],
        )
        .await
        .map_err(|e| { eprintln!("[ssh] request_pty error: {}", e); e })?;
    eprintln!("[ssh] Requesting shell");
    ssh_channel.request_shell(true).await
        .map_err(|e| { eprintln!("[ssh] request_shell error: {}", e); e })?;
    eprintln!("[ssh] Shell started");

    // 4. Register session with input/resize channels
    let (input_tx, mut input_rx) = mpsc::channel::<Vec<u8>>(256);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u16, u16)>(32);
    let (abort_tx, mut abort_rx) = oneshot::channel::<()>();

    manager
        .add(SshSessionHandle {
            id: session_id.clone(),
            server_id: config.server_id.clone(),
            input_tx,
            resize_tx,
            abort_tx,
        })
        .await;

    // Notify frontend that we are connected
    let send_result = channel.send(TerminalChannelMessage::Status(TerminalStatusEvent {
        session_id: session_id.clone(),
        status: "connected".to_string(),
        reason: None,
    }));
    eprintln!("[ssh] Sent 'connected', result ok={}", send_result.is_ok());

    // 5. Bidirectional pump loop
    eprintln!("[ssh] Pump loop starting");
    loop {
        tokio::select! {
            msg = ssh_channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { ref data }) => {
                        eprintln!("[ssh] Data from server: {} bytes", data.len());
                        let send_ok = channel.send(TerminalChannelMessage::Data(TerminalDataEvent {
                            session_id: session_id.clone(),
                            data: data.to_vec(),
                        })).is_ok();
                        eprintln!("[ssh] terminal:data send ok={}", send_ok);
                    }
                    Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        // SSH extended data (e.g. stderr) — write to terminal too
                        channel.send(TerminalChannelMessage::Data(TerminalDataEvent {
                            session_id: session_id.clone(),
                            data: data.to_vec(),
                        })).ok();
                    }
                    Some(ChannelMsg::ExitStatus { .. }) | None => {
                        eprintln!("[ssh] ssh_channel closed (ExitStatus/None)");
                        break;
                    }
                    Some(other) => {
                        eprintln!("[ssh] Ignored ssh_channel msg: {:?}", other);
                    }
                }
            }
            Some(data) = input_rx.recv() => {
                if ssh_channel.data(data.as_slice()).await.is_err() {
                    break;
                }
            }
            Some((cols, rows)) = resize_rx.recv() => {
                let _ = ssh_channel.window_change(cols as u32, rows as u32, 0, 0).await;
            }
            _ = &mut abort_rx => break,
        }
    }

    manager.remove(&session_id).await;
    channel.send(TerminalChannelMessage::Status(TerminalStatusEvent {
        session_id,
        status: "disconnected".to_string(),
        reason: None,
    })).ok();

    Ok(())
}
