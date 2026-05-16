pub mod commands;
pub mod db;
pub mod managers;
pub mod security;

use db::establish_connection_pool;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pool = establish_connection_pool();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pool)
        .invoke_handler(tauri::generate_handler![
            commands::server_commands::list_servers,
            commands::server_commands::get_server,
            commands::server_commands::create_server,
            commands::server_commands::update_server,
            commands::server_commands::delete_server,
            commands::server_commands::clone_server,
            commands::server_commands::toggle_favorite,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
