use tauri::State;
use tauri::ipc::Channel;
use uuid::Uuid;

use crate::db::DbPool;
use crate::managers::local_pty_manager::LocalPtyManager;
use crate::managers::server_manager::ServerManager;
use crate::managers::ssh_session_manager::{
    establish_session, ProxyConfig, SshAuthMethod, SshConnectConfig, SshSessionManager, TerminalChannelMessage,
};
use crate::security::keyring::CredentialStore;

#[tauri::command]
pub async fn connect_ssh_session(
    pool: State<'_, DbPool>,
    ssh_manager: State<'_, SshSessionManager>,
    server_id: String,
    channel: Channel<TerminalChannelMessage>,
    cols: Option<u16>,
    rows: Option<u16>,
    proxy: Option<ProxyConfig>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();

    let server = ServerManager::get(&pool, &server_id).map_err(|e| e.to_string())?;

    let auth = match server.auth_type.as_str() {
        "password" => {
            let raw = server.password.as_deref().unwrap_or("");
            let password = if raw.starts_with("keyring://") {
                CredentialStore::get_password(&server_id)
                    .map_err(|e| format!("Failed to retrieve password from keyring: {}", e))?
            } else {
                raw.to_string()
            };
            SshAuthMethod::Password(password)
        }
        "key" => {
            let path = server.private_key_path.clone().unwrap_or_default();
            let passphrase = server.passphrase.as_deref().and_then(|p| {
                if p.starts_with("keyring://") {
                    CredentialStore::get_password(&server_id).ok()
                } else if p.is_empty() {
                    None
                } else {
                    Some(p.to_string())
                }
            });
            SshAuthMethod::PrivateKey { path, passphrase }
        }
        _ => return Err(format!("Unsupported auth type: {}", server.auth_type)),
    };

    let config = SshConnectConfig {
        session_id: session_id.clone(),
        server_id: server_id.clone(),
        host: server.host.clone(),
        port: server.port as u16,
        username: server.username.clone(),
        auth,
        initial_cols: cols.unwrap_or(220),
        initial_rows: rows.unwrap_or(50),
        channel,
        proxy,
    };

    let manager_clone = ssh_manager.inner().clone();

    tokio::spawn(async move {
        establish_session(manager_clone, config).await;
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn disconnect_ssh_session(
    ssh_manager: State<'_, SshSessionManager>,
    session_id: String,
) -> Result<(), String> {
    let removed = ssh_manager.remove(&session_id).await;
    if removed {
        Ok(())
    } else {
        Err(format!("Session '{}' not found", session_id))
    }
}

#[tauri::command]
pub async fn connect_local_session(
    channel: tauri::ipc::Channel<TerminalChannelMessage>,
    cols: Option<u16>,
    rows: Option<u16>,
    proxy: Option<ProxyConfig>,
    state: tauri::State<'_, LocalPtyManager>,
) -> Result<String, String> {
    let cols = cols.unwrap_or(80);
    let rows = rows.unwrap_or(24);
    let session_id = Uuid::new_v4().to_string();
    state.connect(session_id.clone(), channel, cols, rows, proxy)?;
    Ok(session_id)
}

#[tauri::command]
pub async fn disconnect_local_session(
    session_id: String,
    state: tauri::State<'_, LocalPtyManager>,
) -> Result<(), String> {
    state.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn terminal_input(
    session_id: String,
    data: Vec<u8>,
    ssh_state: tauri::State<'_, SshSessionManager>,
    local_state: tauri::State<'_, LocalPtyManager>,
) -> Result<(), String> {
    // Try SSH sessions first, then local PTY
    if ssh_state.send_input(&session_id, data.clone()).await {
        return Ok(());
    }
    if local_state.send_input(&session_id, data) {
        return Ok(());
    }
    Err(format!("Session not found: {}", session_id))
}

#[tauri::command]
pub async fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    ssh_state: tauri::State<'_, SshSessionManager>,
    local_state: tauri::State<'_, LocalPtyManager>,
) -> Result<(), String> {
    // Try SSH sessions first, then local PTY
    if ssh_state.send_resize(&session_id, cols, rows).await {
        return Ok(());
    }
    if local_state.send_resize(&session_id, cols, rows) {
        return Ok(());
    }
    Err(format!("Session not found: {}", session_id))
}
