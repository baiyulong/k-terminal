use tauri::State;

use crate::db::models::Server;
use crate::db::DbPool;
use crate::managers::search_manager;

#[tauri::command]
pub fn search_servers(pool: State<'_, DbPool>, query: String) -> Result<Vec<Server>, String> {
    search_manager::search_servers(&pool, &query).map_err(|error| error.to_string())
}
