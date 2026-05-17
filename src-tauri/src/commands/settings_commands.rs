use serde::Serialize;
use tauri::State;

use crate::db::{get_db_path, DbPool};
use crate::managers::config_manager::{
    export_servers, get_config_dir, import_servers, ImportResult,
};

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

/// List font family names installed on the system.
/// Uses fc-list on Linux/macOS; returns empty vec on Windows (JS Font Access API is used instead).
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    // Try fontconfig (Linux, macOS with brew fontconfig)
    if let Ok(out) = std::process::Command::new("fc-list")
        .args(["--format=%{family[0]}\n"])
        .output()
    {
        if out.status.success() {
            let mut fonts: Vec<String> = String::from_utf8_lossy(&out.stdout)
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            fonts.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
            fonts.dedup();
            return fonts;
        }
    }

    // Windows fallback: PowerShell
    if cfg!(target_os = "windows") {
        if let Ok(out) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "[System.Drawing.Text.InstalledFontCollection]::new().Families | Select-Object -ExpandProperty Name",
            ])
            .output()
        {
            if out.status.success() {
                let mut fonts: Vec<String> = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                fonts.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
                return fonts;
            }
        }
    }

    vec![]
}
