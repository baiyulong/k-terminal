pub mod commands;
pub mod db;
pub mod managers;
pub mod security;

use db::establish_connection_pool;
use managers::ssh_session_manager::SshSessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pool = establish_connection_pool();
    let ssh_manager = SshSessionManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pool)
        .manage(ssh_manager)
        .invoke_handler(tauri::generate_handler![
            commands::search_commands::search_servers,
            commands::server_commands::list_servers,
            commands::server_commands::get_server,
            commands::server_commands::create_server,
            commands::server_commands::update_server,
            commands::server_commands::delete_server,
            commands::server_commands::clone_server,
            commands::server_commands::toggle_favorite,
            commands::ssh_commands::generate_ssh_command,
            commands::ssh_commands::get_ssh_command_preview,
            commands::group_commands::list_groups,
            commands::group_commands::get_group,
            commands::group_commands::create_group,
            commands::group_commands::update_group,
            commands::group_commands::delete_group,
            commands::group_commands::move_group,
            commands::group_commands::reorder_groups,
            commands::group_commands::get_group_tree,
            commands::terminal_commands::list_terminal_profiles,
            commands::terminal_commands::get_terminal_profile,
            commands::terminal_commands::create_terminal_profile,
            commands::terminal_commands::update_terminal_profile,
            commands::terminal_commands::delete_terminal_profile,
            commands::terminal_commands::get_default_terminal_profile,
            commands::terminal_commands::set_default_terminal_profile,
            commands::terminal_commands::detect_available_terminals,
            commands::terminal_commands::seed_default_terminal_profiles,
            commands::terminal_commands::get_recent_connections,
            commands::settings_commands::export_data,
            commands::settings_commands::import_data,
            commands::settings_commands::get_app_info,
            // New embedded terminal commands
            commands::terminal_session_commands::connect_ssh_session,
            commands::terminal_session_commands::disconnect_ssh_session,
            commands::terminal_session_commands::terminal_input,
            commands::terminal_session_commands::terminal_resize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
