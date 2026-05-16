use tauri::State;

use crate::db::DbPool;
use crate::managers::server_manager::ServerManager;
use crate::managers::ssh_manager::{self, SshCommand};

#[tauri::command]
pub fn generate_ssh_command(
    pool: State<'_, DbPool>,
    server_id: String,
) -> Result<SshCommand, String> {
    let server = ServerManager::get(&pool, &server_id).map_err(|error| error.to_string())?;

    ssh_manager::generate_ssh_command(&server).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_ssh_command_preview(
    pool: State<'_, DbPool>,
    server_id: String,
) -> Result<String, String> {
    let server = ServerManager::get(&pool, &server_id).map_err(|error| error.to_string())?;
    let command = ssh_manager::generate_ssh_command(&server).map_err(|error| error.to_string())?;

    Ok(command.full_command)
}
