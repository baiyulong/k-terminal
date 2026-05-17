use serde::Deserialize;
use tauri::State;

use crate::db::models::{
    ConnectionLog, NewTerminalProfile, TerminalProfile, UpdateTerminalProfile,
};
use crate::db::DbPool;
use crate::managers::terminal_manager::{DetectedTerminal, TerminalManager};

#[derive(Debug, Deserialize)]
pub struct CreateTerminalProfileRequest {
    pub name: String,
    pub platform: String,
    pub command: String,
    pub args_template: String,
    pub is_default: Option<bool>,
}

#[tauri::command]
pub fn list_terminal_profiles(pool: State<'_, DbPool>) -> Result<Vec<TerminalProfile>, String> {
    TerminalManager::list_profiles(&pool).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_terminal_profile(
    pool: State<'_, DbPool>,
    id: String,
) -> Result<TerminalProfile, String> {
    TerminalManager::get_profile(&pool, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_terminal_profile(
    pool: State<'_, DbPool>,
    request: CreateTerminalProfileRequest,
) -> Result<TerminalProfile, String> {
    let new_profile = NewTerminalProfile {
        id: String::new(),
        name: request.name,
        platform: request.platform,
        command: request.command,
        args_template: request.args_template,
        is_default: request.is_default.unwrap_or(false),
    };

    TerminalManager::create_profile(&pool, new_profile).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_terminal_profile(
    pool: State<'_, DbPool>,
    id: String,
    changes: UpdateTerminalProfile,
) -> Result<TerminalProfile, String> {
    TerminalManager::update_profile(&pool, &id, changes).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_terminal_profile(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    TerminalManager::delete_profile(&pool, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_default_terminal_profile(
    pool: State<'_, DbPool>,
    platform: String,
) -> Result<Option<TerminalProfile>, String> {
    TerminalManager::get_default_profile(&pool, &platform).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_default_terminal_profile(
    pool: State<'_, DbPool>,
    id: String,
) -> Result<TerminalProfile, String> {
    TerminalManager::set_default_profile(&pool, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn detect_available_terminals() -> Vec<DetectedTerminal> {
    TerminalManager::detect_available_terminals()
}

#[tauri::command]
pub fn seed_default_terminal_profiles(
    pool: State<'_, DbPool>,
) -> Result<Vec<TerminalProfile>, String> {
    TerminalManager::seed_default_profiles(&pool).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_recent_connections(
    pool: State<'_, DbPool>,
    limit: Option<i32>,
) -> Result<Vec<ConnectionLog>, String> {
    TerminalManager::get_recent_connections(&pool, limit).map_err(|error| error.to_string())
}
