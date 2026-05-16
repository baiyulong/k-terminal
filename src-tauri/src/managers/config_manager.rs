use std::collections::HashSet;
use std::path::PathBuf;

use diesel::prelude::*;
use diesel::r2d2;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::models::{Group, NewGroup, NewServer, Server};
use crate::db::schema::{groups, servers};
use crate::db::DbPool;

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("Pool error: {0}")]
    Pool(String),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl From<r2d2::Error> for ConfigError {
    fn from(error: r2d2::Error) -> Self {
        Self::Pool(error.to_string())
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ExportBundle {
    version: u32,
    groups: Vec<ExportGroup>,
    servers: Vec<ExportServer>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportGroup {
    id: String,
    name: String,
    parent_id: Option<String>,
    sort_order: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportServer {
    id: String,
    name: String,
    host: String,
    port: i32,
    username: String,
    auth_type: String,
    private_key_path: Option<String>,
    group_id: Option<String>,
    description: Option<String>,
    terminal_profile_id: Option<String>,
    startup_command: Option<String>,
    encoding: String,
    is_favorite: bool,
    tags: Option<String>,
    jump_host: Option<String>,
    keep_alive: bool,
    compression: bool,
    agent_forward: bool,
    port_forwards: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ImportPayload {
    #[serde(default)]
    groups: Vec<ImportGroup>,
    #[serde(default)]
    servers: Vec<ImportServer>,
}

#[derive(Debug, Clone, Deserialize)]
struct ImportGroup {
    id: String,
    name: String,
    #[serde(default)]
    parent_id: Option<String>,
    #[serde(default)]
    sort_order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
struct ImportServer {
    #[serde(default)]
    id: String,
    name: String,
    host: String,
    #[serde(default)]
    port: Option<i32>,
    username: String,
    #[serde(default)]
    auth_type: Option<String>,
    #[serde(default)]
    private_key_path: Option<String>,
    #[serde(default)]
    group_id: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    terminal_profile_id: Option<String>,
    #[serde(default)]
    startup_command: Option<String>,
    #[serde(default)]
    encoding: Option<String>,
    #[serde(default)]
    is_favorite: bool,
    #[serde(default)]
    tags: Option<String>,
    #[serde(default)]
    jump_host: Option<String>,
    #[serde(default = "default_true")]
    keep_alive: bool,
    #[serde(default)]
    compression: bool,
    #[serde(default)]
    agent_forward: bool,
    #[serde(default)]
    port_forwards: Option<String>,
}

pub fn get_config_dir() -> PathBuf {
    match std::env::consts::OS {
        "windows" => dirs::config_dir()
            .or_else(|| dirs::home_dir().map(|home| home.join("AppData").join("Roaming")))
            .unwrap_or_else(|| PathBuf::from("."))
            .join("kterminal"),
        "macos" => dirs::home_dir()
            .map(|home| home.join("Library").join("Application Support"))
            .or_else(dirs::config_dir)
            .unwrap_or_else(|| PathBuf::from("."))
            .join("kterminal"),
        _ => dirs::home_dir()
            .map(|home| home.join(".config"))
            .or_else(dirs::config_dir)
            .unwrap_or_else(|| PathBuf::from("."))
            .join("kterminal"),
    }
}

pub fn export_servers(pool: &DbPool) -> Result<String, ConfigError> {
    let mut conn = pool.get().map_err(|error| ConfigError::Pool(error.to_string()))?;
    let stored_groups = groups::table
        .order((groups::sort_order.asc(), groups::name.asc()))
        .load::<Group>(&mut conn)?;
    let stored_servers = servers::table
        .order(servers::name.asc())
        .load::<Server>(&mut conn)?;

    let payload = ExportBundle {
        version: 1,
        groups: stored_groups.into_iter().map(ExportGroup::from).collect(),
        servers: stored_servers.into_iter().map(ExportServer::from).collect(),
    };

    serde_json::to_string_pretty(&payload).map_err(Into::into)
}

pub fn import_servers(pool: &DbPool, json: &str) -> Result<ImportResult, ConfigError> {
    let payload: ImportPayload = serde_json::from_str(json)?;
    let mut conn = pool.get().map_err(|error| ConfigError::Pool(error.to_string()))?;

    conn.transaction::<ImportResult, ConfigError, _>(|conn| {
        let mut result = ImportResult::default();
        let mut known_group_ids: HashSet<String> = groups::table
            .select(groups::id)
            .load::<String>(conn)?
            .into_iter()
            .collect();

        import_groups(conn, payload.groups, &mut known_group_ids, &mut result.errors)?;

        let stored_servers = servers::table.load::<Server>(conn)?;
        let mut known_server_ids: HashSet<String> =
            stored_servers.iter().map(|server| server.id.clone()).collect();
        let mut known_fingerprints: HashSet<String> = stored_servers
            .iter()
            .map(|server| server_fingerprint(&server.name, &server.host, server.port, &server.username))
            .collect();

        for server in payload.servers {
            let normalized_name = server.name.trim().to_string();
            let normalized_host = server.host.trim().to_string();
            let normalized_username = server.username.trim().to_string();

            if normalized_name.is_empty() || normalized_host.is_empty() || normalized_username.is_empty() {
                result.skipped += 1;
                result
                    .errors
                    .push("Skipped a server with missing name, host, or username.".to_string());
                continue;
            }

            let server_id = if server.id.trim().is_empty() {
                Uuid::new_v4().to_string()
            } else {
                server.id.trim().to_string()
            };
            let fingerprint = server_fingerprint(
                &normalized_name,
                &normalized_host,
                server.port.unwrap_or(22),
                &normalized_username,
            );

            if known_server_ids.contains(&server_id) || known_fingerprints.contains(&fingerprint) {
                result.skipped += 1;
                continue;
            }

            let requested_group_id = normalize_optional_text(server.group_id);
            let group_id = requested_group_id.clone().filter(|group_id| known_group_ids.contains(group_id));
            if let Some(missing_group_id) = requested_group_id.filter(|group_id| !known_group_ids.contains(group_id)) {
                result.errors.push(format!(
                    "Server '{}' referenced missing group '{}'; imported without a group.",
                    normalized_name, missing_group_id
                ));
            }

            diesel::insert_into(servers::table)
                .values(&NewServer {
                    id: server_id.clone(),
                    name: normalized_name.clone(),
                    host: normalized_host.clone(),
                    port: server.port.unwrap_or(22),
                    username: normalized_username.clone(),
                    auth_type: server
                        .auth_type
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty())
                        .unwrap_or_else(|| "password".to_string()),
                    password: None,
                    private_key_path: normalize_optional_text(server.private_key_path),
                    passphrase: None,
                    group_id,
                    description: normalize_optional_text(server.description),
                    terminal_profile_id: normalize_optional_text(server.terminal_profile_id),
                    startup_command: normalize_optional_text(server.startup_command),
                    encoding: server
                        .encoding
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty())
                        .unwrap_or_else(|| "utf8".to_string()),
                    is_favorite: server.is_favorite,
                    tags: normalize_optional_text(server.tags),
                    jump_host: normalize_optional_text(server.jump_host),
                    keep_alive: server.keep_alive,
                    compression: server.compression,
                    agent_forward: server.agent_forward,
                    port_forwards: normalize_optional_text(server.port_forwards),
                })
                .execute(conn)?;

            result.imported += 1;
            known_server_ids.insert(server_id);
            known_fingerprints.insert(fingerprint);
        }

        Ok(result)
    })
}

fn import_groups(
    conn: &mut SqliteConnection,
    imported_groups: Vec<ImportGroup>,
    known_group_ids: &mut HashSet<String>,
    errors: &mut Vec<String>,
) -> Result<(), ConfigError> {
    let mut pending_groups = imported_groups;

    while !pending_groups.is_empty() {
        let mut next_round = Vec::new();
        let mut inserted_any = false;

        for group in pending_groups {
            let group_id = group.id.trim().to_string();
            let group_name = group.name.trim().to_string();

            if group_id.is_empty() || group_name.is_empty() {
                errors.push("Skipped a group with missing id or name.".to_string());
                continue;
            }

            if known_group_ids.contains(&group_id) {
                continue;
            }

            let parent_id = normalize_optional_text(group.parent_id.clone());
            let parent_ready = parent_id
                .as_ref()
                .map(|parent_id| known_group_ids.contains(parent_id))
                .unwrap_or(true);

            if !parent_ready {
                next_round.push(group);
                continue;
            }

            diesel::insert_into(groups::table)
                .values(&NewGroup {
                    id: group_id.clone(),
                    name: group_name,
                    parent_id,
                    sort_order: group.sort_order.unwrap_or(0),
                })
                .execute(conn)?;

            known_group_ids.insert(group_id);
            inserted_any = true;
        }

        if next_round.is_empty() {
            break;
        }

        if !inserted_any {
            for group in next_round {
                errors.push(format!(
                    "Skipped group '{}' because parent '{}' was not available.",
                    group.name,
                    group.parent_id.unwrap_or_else(|| "unknown".to_string())
                ));
            }
            break;
        }

        pending_groups = next_round;
    }

    Ok(())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn server_fingerprint(name: &str, host: &str, port: i32, username: &str) -> String {
    format!(
        "{}|{}|{}|{}",
        name.trim().to_lowercase(),
        host.trim().to_lowercase(),
        port,
        username.trim().to_lowercase()
    )
}

fn default_true() -> bool {
    true
}

impl From<Group> for ExportGroup {
    fn from(group: Group) -> Self {
        Self {
            id: group.id,
            name: group.name,
            parent_id: group.parent_id,
            sort_order: group.sort_order,
        }
    }
}

impl From<Server> for ExportServer {
    fn from(server: Server) -> Self {
        Self {
            id: server.id,
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            auth_type: server.auth_type,
            private_key_path: server.private_key_path,
            group_id: server.group_id,
            description: server.description,
            terminal_profile_id: server.terminal_profile_id,
            startup_command: server.startup_command,
            encoding: server.encoding,
            is_favorite: server.is_favorite,
            tags: server.tags,
            jump_host: server.jump_host,
            keep_alive: server.keep_alive,
            compression: server.compression,
            agent_forward: server.agent_forward,
            port_forwards: server.port_forwards,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{export_servers, get_config_dir, import_servers};
    use crate::db::{
        models::{NewGroup, NewServer},
        schema::{groups, servers},
        DbPool, MIGRATIONS,
    };
    use diesel::prelude::*;
    use diesel::r2d2::{ConnectionManager, Pool};
    use diesel::sqlite::SqliteConnection;
    use diesel_migrations::MigrationHarness;
    use std::sync::Arc;
    use uuid::Uuid;

    fn test_pool(name: &str) -> DbPool {
        let database_url = format!("file:{name}?mode=memory&cache=shared");
        let manager = ConnectionManager::<SqliteConnection>::new(database_url);
        let pool = Pool::builder().max_size(1).build(manager).unwrap();
        let mut conn = pool.get().unwrap();
        conn.run_pending_migrations(MIGRATIONS).unwrap();
        Arc::new(pool)
    }

    fn insert_group(pool: &DbPool, id: &str, name: &str, parent_id: Option<&str>) {
        let mut conn = pool.get().unwrap();
        diesel::insert_into(groups::table)
            .values(&NewGroup {
                id: id.to_string(),
                name: name.to_string(),
                parent_id: parent_id.map(str::to_string),
                sort_order: 0,
            })
            .execute(&mut conn)
            .unwrap();
    }

    fn insert_server(pool: &DbPool, group_id: Option<&str>, password: Option<&str>) {
        let mut conn = pool.get().unwrap();
        diesel::insert_into(servers::table)
            .values(&NewServer {
                id: Uuid::new_v4().to_string(),
                name: "Example".to_string(),
                host: "example.com".to_string(),
                port: 22,
                username: "alice".to_string(),
                auth_type: "password".to_string(),
                password: password.map(str::to_string),
                private_key_path: None,
                passphrase: None,
                group_id: group_id.map(str::to_string),
                description: Some("Imported server".to_string()),
                terminal_profile_id: None,
                startup_command: None,
                encoding: "utf8".to_string(),
                is_favorite: true,
                tags: Some("prod".to_string()),
                jump_host: None,
                keep_alive: true,
                compression: false,
                agent_forward: false,
                port_forwards: None,
            })
            .execute(&mut conn)
            .unwrap();
    }

    #[test]
    fn get_config_dir_targets_kterminal_folder() {
        let config_dir = get_config_dir();
        assert!(config_dir.ends_with("kterminal"));
    }

    #[test]
    fn export_servers_omits_passwords_and_includes_groups() {
        let pool = test_pool("config-export");
        insert_group(&pool, "group-1", "Production", None);
        insert_server(&pool, Some("group-1"), Some("keyring://server-1"));

        let exported = export_servers(&pool).unwrap();

        assert!(exported.contains("\"groups\""));
        assert!(exported.contains("Production"));
        assert!(!exported.contains("keyring://server-1"));
    }

    #[test]
    fn import_servers_reports_imported_and_skipped_counts() {
        let pool = test_pool("config-import");
        let json = r#"{
            "servers": [
                {
                    "id": "server-1",
                    "name": "Imported",
                    "host": "example.com",
                    "port": 22,
                    "username": "alice",
                    "auth_type": "password",
                    "group_id": "group-1",
                    "encoding": "utf8",
                    "is_favorite": false,
                    "keep_alive": true,
                    "compression": false,
                    "agent_forward": false
                },
                {
                    "id": "server-1",
                    "name": "Imported duplicate",
                    "host": "example.com",
                    "port": 22,
                    "username": "alice",
                    "auth_type": "password",
                    "encoding": "utf8",
                    "is_favorite": false,
                    "keep_alive": true,
                    "compression": false,
                    "agent_forward": false
                }
            ],
            "groups": [
                {
                    "id": "group-1",
                    "name": "Imported Group",
                    "parent_id": null,
                    "sort_order": 0
                }
            ]
        }"#;

        let result = import_servers(&pool, json).unwrap();

        assert_eq!(result.imported, 1);
        assert_eq!(result.skipped, 1);
        assert!(result.errors.is_empty());
    }
}
