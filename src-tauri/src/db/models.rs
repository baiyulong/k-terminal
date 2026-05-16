use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use super::schema::{connection_logs, groups, servers, terminal_profiles};

#[derive(Debug, Queryable, Selectable, Serialize, Deserialize)]
#[diesel(table_name = servers)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Server {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub group_id: Option<String>,
    pub description: Option<String>,
    pub terminal_profile_id: Option<String>,
    pub startup_command: Option<String>,
    pub encoding: String,
    pub is_favorite: bool,
    pub tags: Option<String>,
    pub jump_host: Option<String>,
    pub keep_alive: bool,
    pub compression: bool,
    pub agent_forward: bool,
    pub port_forwards: Option<String>,
    pub last_connected_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Insertable, Deserialize)]
#[diesel(table_name = servers)]
pub struct NewServer {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub group_id: Option<String>,
    pub description: Option<String>,
    pub terminal_profile_id: Option<String>,
    pub startup_command: Option<String>,
    pub encoding: String,
    pub is_favorite: bool,
    pub tags: Option<String>,
    pub jump_host: Option<String>,
    pub keep_alive: bool,
    pub compression: bool,
    pub agent_forward: bool,
    pub port_forwards: Option<String>,
}

#[derive(Debug, AsChangeset, Deserialize)]
#[diesel(table_name = servers)]
pub struct UpdateServer {
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<i32>,
    pub username: Option<String>,
    pub auth_type: Option<String>,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub group_id: Option<String>,
    pub description: Option<String>,
    pub terminal_profile_id: Option<String>,
    pub startup_command: Option<String>,
    pub encoding: Option<String>,
    pub is_favorite: Option<bool>,
    pub tags: Option<String>,
    pub jump_host: Option<String>,
    pub keep_alive: Option<bool>,
    pub compression: Option<bool>,
    pub agent_forward: Option<bool>,
    pub port_forwards: Option<String>,
}

#[derive(Debug, Clone, Queryable, Selectable, Serialize, Deserialize)]
#[diesel(table_name = terminal_profiles)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct TerminalProfile {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub command: String,
    pub args_template: String,
    pub is_default: bool,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Insertable, Deserialize)]
#[diesel(table_name = terminal_profiles)]
pub struct NewTerminalProfile {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub command: String,
    pub args_template: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, AsChangeset, Deserialize)]
#[diesel(table_name = terminal_profiles)]
pub struct UpdateTerminalProfile {
    pub name: Option<String>,
    pub platform: Option<String>,
    pub command: Option<String>,
    pub args_template: Option<String>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Queryable, Selectable, Serialize, Deserialize)]
#[diesel(table_name = connection_logs)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ConnectionLog {
    pub id: String,
    pub server_id: String,
    pub connected_at: NaiveDateTime,
    pub status: String,
}

#[derive(Debug, Clone, Insertable, Deserialize)]
#[diesel(table_name = connection_logs)]
pub struct NewConnectionLog {
    pub id: String,
    pub server_id: String,
    pub connected_at: NaiveDateTime,
    pub status: String,
}

#[derive(Debug, Clone, Queryable, Selectable, Serialize, Deserialize)]
#[diesel(table_name = groups)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Group {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i32,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Insertable, Deserialize)]
#[diesel(table_name = groups)]
pub struct NewGroup {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Clone, AsChangeset, Deserialize)]
#[diesel(table_name = groups)]
pub struct UpdateGroup {
    pub name: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub sort_order: Option<i32>,
}
