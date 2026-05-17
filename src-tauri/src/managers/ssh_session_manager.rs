use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
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
