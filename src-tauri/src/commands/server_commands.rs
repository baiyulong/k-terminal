use serde::Deserialize;
use tauri::State;

use crate::db::models::{NewServer, Server, UpdateServer};
use crate::db::DbPool;
use crate::managers::server_manager::ServerManager;

#[derive(Debug, Deserialize)]
pub struct CreateServerRequest {
    pub name: String,
    pub host: String,
    pub port: Option<i32>,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub group_id: Option<String>,
    pub description: Option<String>,
    pub terminal_profile_id: Option<String>,
    pub startup_command: Option<String>,
    pub encoding: Option<String>,
    pub tags: Option<String>,
    pub jump_host: Option<String>,
    pub keep_alive: Option<bool>,
    pub compression: Option<bool>,
    pub agent_forward: Option<bool>,
    pub port_forwards: Option<String>,
}

#[tauri::command]
pub fn list_servers(pool: State<'_, DbPool>) -> Result<Vec<Server>, String> {
    ServerManager::list(&pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_server(pool: State<'_, DbPool>, id: String) -> Result<Server, String> {
    ServerManager::get(&pool, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_server(
    pool: State<'_, DbPool>,
    request: CreateServerRequest,
) -> Result<Server, String> {
    let new_server = NewServer {
        id: String::new(), // Will be generated
        name: request.name,
        host: request.host,
        port: request.port.unwrap_or(22),
        username: request.username,
        auth_type: request.auth_type,
        password: request.password,
        private_key_path: request.private_key_path,
        passphrase: request.passphrase,
        group_id: request.group_id,
        description: request.description,
        terminal_profile_id: request.terminal_profile_id,
        startup_command: request.startup_command,
        encoding: request.encoding.unwrap_or_else(|| "utf8".to_string()),
        is_favorite: false,
        tags: request.tags,
        jump_host: request.jump_host,
        keep_alive: request.keep_alive.unwrap_or(true),
        compression: request.compression.unwrap_or(false),
        agent_forward: request.agent_forward.unwrap_or(false),
        port_forwards: request.port_forwards,
        proxy_type: "global".to_string(),
        proxy_host: None,
        proxy_port: None,
    };

    ServerManager::create(&pool, new_server).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_server(
    pool: State<'_, DbPool>,
    id: String,
    changes: UpdateServer,
) -> Result<Server, String> {
    ServerManager::update(&pool, &id, changes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_server(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    ServerManager::delete(&pool, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clone_server(pool: State<'_, DbPool>, id: String) -> Result<Server, String> {
    ServerManager::clone_server(&pool, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_favorite(pool: State<'_, DbPool>, id: String) -> Result<Server, String> {
    ServerManager::toggle_favorite(&pool, &id).map_err(|e| e.to_string())
}
