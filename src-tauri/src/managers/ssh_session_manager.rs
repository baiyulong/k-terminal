use std::collections::HashMap;
use std::sync::Arc;

use russh::client::{self, Config, Handle};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use russh::ChannelMsg;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

// ── Public event types (emitted to frontend via Tauri) ──────────────────────

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

// ── Session handle (stored in manager) ──────────────────────────────────────

pub struct SshSessionHandle {
    pub id: String,
    pub server_id: String,
    /// Send raw bytes to the SSH channel stdin
    pub input_tx: mpsc::Sender<Vec<u8>>,
    /// Send (cols, rows) resize events to the SSH channel
    pub resize_tx: mpsc::Sender<(u16, u16)>,
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
        sessions.remove(session_id).is_some()
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

#[derive(Debug, Clone)]
pub struct SshConnectConfig {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuthMethod,
    pub initial_cols: u16,
    pub initial_rows: u16,
}

#[derive(Debug, Clone)]
pub enum SshAuthMethod {
    Password(String),
    PrivateKey { path: String, passphrase: Option<String> },
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
    app: AppHandle,
    manager: SshSessionManager,
    config: SshConnectConfig,
) {
    let session_id = config.session_id.clone();
    let app_emit = app.clone();

    if let Err(err) = run_session(app, manager.clone(), config).await {
        let _ = app_emit.emit(
            "terminal:status",
            TerminalStatusEvent {
                session_id: session_id.clone(),
                status: "error".to_string(),
                reason: Some(err.to_string()),
            },
        );
        manager.remove(&session_id).await;
    }
}

async fn run_session(
    app: AppHandle,
    manager: SshSessionManager,
    config: SshConnectConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let session_id = config.session_id.clone();

    // 1. TCP connect + SSH handshake
    let russh_config = Arc::new(Config::default());
    let addr = format!("{}:{}", config.host, config.port);
    let mut ssh_handle: Handle<SshClientHandler> =
        client::connect(russh_config, addr.as_str(), SshClientHandler).await?;

    // 2. Authenticate
    let auth_result = match &config.auth {
        SshAuthMethod::Password(password) => {
            ssh_handle
                .authenticate_password(config.username.as_str(), password.as_str())
                .await?
        }
        SshAuthMethod::PrivateKey { path, passphrase } => {
            let expanded = shellexpand::tilde(path).to_string();
            let key = load_secret_key(&expanded, passphrase.as_deref())?;
            let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(key), None);
            ssh_handle
                .authenticate_publickey(config.username.as_str(), key_with_alg)
                .await?
        }
    };

    if !auth_result.success() {
        return Err("Authentication failed".into());
    }

    // 3. Open session channel, request PTY and shell
    let mut channel = ssh_handle.channel_open_session().await?;
    channel
        .request_pty(
            false,
            "xterm-256color",
            config.initial_cols as u32,
            config.initial_rows as u32,
            0,
            0,
            &[],
        )
        .await?;
    channel.request_shell(false).await?;

    // 4. Register session with input/resize channels
    let (input_tx, mut input_rx) = mpsc::channel::<Vec<u8>>(256);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u16, u16)>(32);

    manager
        .add(SshSessionHandle {
            id: session_id.clone(),
            server_id: String::new(),
            input_tx,
            resize_tx,
        })
        .await;

    // Notify frontend that we are connected
    let _ = app.emit(
        "terminal:status",
        TerminalStatusEvent {
            session_id: session_id.clone(),
            status: "connected".to_string(),
            reason: None,
        },
    );

    // 5. Bidirectional pump loop
    loop {
        tokio::select! {
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { ref data }) => {
                        let _ = app.emit("terminal:data", TerminalDataEvent {
                            session_id: session_id.clone(),
                            data: data.to_vec(),
                        });
                    }
                    Some(ChannelMsg::ExitStatus { .. }) | None => break,
                    _ => {}
                }
            }
            Some(data) = input_rx.recv() => {
                let _ = channel.data(std::io::Cursor::new(data)).await;
            }
            Some((cols, rows)) = resize_rx.recv() => {
                let _ = channel.window_change(cols as u32, rows as u32, 0, 0).await;
            }
        }
    }

    manager.remove(&session_id).await;
    let _ = app.emit(
        "terminal:status",
        TerminalStatusEvent {
            session_id,
            status: "disconnected".to_string(),
            reason: None,
        },
    );

    Ok(())
}
