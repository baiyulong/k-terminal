use serde::Serialize;
use tauri::State;

use crate::db::{get_db_path, DbPool};
use crate::managers::config_manager::{export_servers, get_config_dir, import_servers, ImportResult};

#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub version: String,
    pub config_path: String,
    pub db_path: String,
}

#[tauri::command]
pub fn export_data(pool: State<'_, DbPool>) -> Result<String, String> {
    export_servers(&pool).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_data(pool: State<'_, DbPool>, json: String) -> Result<ImportResult, String> {
    import_servers(&pool, &json).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        config_path: get_config_dir().to_string_lossy().to_string(),
        db_path: get_db_path().to_string_lossy().to_string(),
    }
}
