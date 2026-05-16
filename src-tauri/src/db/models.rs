use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use super::schema::servers;

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
