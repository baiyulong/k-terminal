use diesel::prelude::*;
use diesel::r2d2;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};
use std::env;
use std::ffi::OsString;
use std::path::Path;
use uuid::Uuid;

use crate::db::models::{
    ConnectionLog, NewTerminalProfile, TerminalProfile, UpdateTerminalProfile,
};
use crate::db::schema::{connection_logs, terminal_profiles};
use crate::db::DbPool;

#[derive(Debug, thiserror::Error)]
pub enum TerminalManagerError {
    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("Pool error: {0}")]
    Pool(String),
    #[error("Terminal profile not found: {0}")]
    NotFound(String),
}

impl From<r2d2::Error> for TerminalManagerError {
    fn from(error: r2d2::Error) -> Self {
        Self::Pool(error.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedTerminal {
    pub name: String,
    pub platform: String,
    pub command: String,
    pub args_template: String,
}

#[derive(Clone, Copy)]
struct DefaultProfileTemplate {
    name: &'static str,
    platform: &'static str,
    command: &'static str,
    args_template: &'static str,
    is_default: bool,
}

pub struct TerminalManager;

impl TerminalManager {
    pub fn list_profiles(pool: &DbPool) -> Result<Vec<TerminalProfile>, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        terminal_profiles::table
            .order((
                terminal_profiles::is_default.desc(),
                terminal_profiles::name.asc(),
            ))
            .load::<TerminalProfile>(&mut conn)
            .map_err(Into::into)
    }

    pub fn get_profile(
        pool: &DbPool,
        profile_id: &str,
    ) -> Result<TerminalProfile, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        fetch_profile(&mut conn, profile_id)
    }

    pub fn create_profile(
        pool: &DbPool,
        mut new_profile: NewTerminalProfile,
    ) -> Result<TerminalProfile, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;

        if new_profile.id.trim().is_empty() {
            new_profile.id = Uuid::new_v4().to_string();
        }

        let profile_id = new_profile.id.clone();
        conn.transaction::<TerminalProfile, TerminalManagerError, _>(|conn| {
            if new_profile.is_default {
                unset_default_profiles(conn, &new_profile.platform, Some(&profile_id))?;
            }

            diesel::insert_into(terminal_profiles::table)
                .values(&new_profile)
                .execute(conn)?;

            fetch_profile(conn, &profile_id)
        })
    }

    pub fn update_profile(
        pool: &DbPool,
        profile_id: &str,
        changes: UpdateTerminalProfile,
    ) -> Result<TerminalProfile, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        let profile_id = profile_id.to_string();

        conn.transaction::<TerminalProfile, TerminalManagerError, _>(|conn| {
            let existing = fetch_profile(conn, &profile_id)?;
            let target_platform = changes
                .platform
                .clone()
                .unwrap_or_else(|| existing.platform.clone());
            let should_reset_defaults = changes.is_default == Some(true)
                || (existing.is_default
                    && changes.platform.is_some()
                    && changes.is_default != Some(false));

            if should_reset_defaults {
                unset_default_profiles(conn, &target_platform, Some(&profile_id))?;
            }

            let updated = diesel::update(terminal_profiles::table.find(&profile_id))
                .set(&changes)
                .execute(conn)?;

            if updated == 0 {
                return Err(TerminalManagerError::NotFound(profile_id.clone()));
            }

            fetch_profile(conn, &profile_id)
        })
    }

    pub fn delete_profile(pool: &DbPool, profile_id: &str) -> Result<(), TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        let deleted =
            diesel::delete(terminal_profiles::table.find(profile_id)).execute(&mut conn)?;

        if deleted == 0 {
            return Err(TerminalManagerError::NotFound(profile_id.to_string()));
        }

        Ok(())
    }

    pub fn get_default_profile(
        pool: &DbPool,
        platform_name: &str,
    ) -> Result<Option<TerminalProfile>, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        terminal_profiles::table
            .filter(terminal_profiles::platform.eq(platform_name))
            .filter(terminal_profiles::is_default.eq(true))
            .order(terminal_profiles::name.asc())
            .first::<TerminalProfile>(&mut conn)
            .optional()
            .map_err(Into::into)
    }

    pub fn set_default_profile(
        pool: &DbPool,
        profile_id: &str,
    ) -> Result<TerminalProfile, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        let profile_id = profile_id.to_string();

        conn.transaction::<TerminalProfile, TerminalManagerError, _>(|conn| {
            let profile = fetch_profile(conn, &profile_id)?;
            unset_default_profiles(conn, &profile.platform, Some(&profile_id))?;

            diesel::update(terminal_profiles::table.find(&profile_id))
                .set(terminal_profiles::is_default.eq(true))
                .execute(conn)?;

            fetch_profile(conn, &profile_id)
        })
    }

    pub fn detect_available_terminals() -> Vec<DetectedTerminal> {
        let platform = current_platform();

        default_profiles_for_platform(platform)
            .into_iter()
            .filter(is_terminal_available)
            .map(|profile| DetectedTerminal {
                name: profile.name.to_string(),
                platform: profile.platform.to_string(),
                command: profile.command.to_string(),
                args_template: profile.args_template.to_string(),
            })
            .collect()
    }

    pub fn seed_default_profiles(
        pool: &DbPool,
    ) -> Result<Vec<TerminalProfile>, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        let profile_count = terminal_profiles::table
            .count()
            .get_result::<i64>(&mut conn)?;

        if profile_count > 0 {
            return Self::list_profiles(pool);
        }

        let platform = current_platform();
        let defaults = default_profiles_for_platform(platform);

        if defaults.is_empty() {
            return Ok(Vec::new());
        }

        conn.transaction::<Vec<TerminalProfile>, TerminalManagerError, _>(|conn| {
            let profiles: Vec<NewTerminalProfile> = defaults
                .iter()
                .map(|profile| NewTerminalProfile {
                    id: Uuid::new_v4().to_string(),
                    name: profile.name.to_string(),
                    platform: profile.platform.to_string(),
                    command: profile.command.to_string(),
                    args_template: profile.args_template.to_string(),
                    is_default: profile.is_default,
                })
                .collect();

            diesel::insert_into(terminal_profiles::table)
                .values(&profiles)
                .execute(conn)?;

            terminal_profiles::table
                .filter(terminal_profiles::platform.eq(platform))
                .order((
                    terminal_profiles::is_default.desc(),
                    terminal_profiles::name.asc(),
                ))
                .load::<TerminalProfile>(conn)
                .map_err(Into::into)
        })
    }

    pub fn get_recent_connections(
        pool: &DbPool,
        limit: Option<i32>,
    ) -> Result<Vec<ConnectionLog>, TerminalManagerError> {
        let mut conn = pool
            .get()
            .map_err(|error| TerminalManagerError::Pool(error.to_string()))?;
        let row_limit = i64::from(limit.unwrap_or(10).max(1));

        connection_logs::table
            .order(connection_logs::connected_at.desc())
            .limit(row_limit)
            .load::<ConnectionLog>(&mut conn)
            .map_err(Into::into)
    }
}

fn fetch_profile(
    conn: &mut SqliteConnection,
    profile_id: &str,
) -> Result<TerminalProfile, TerminalManagerError> {
    terminal_profiles::table
        .find(profile_id)
        .first::<TerminalProfile>(conn)
        .map_err(|error| match error {
            diesel::result::Error::NotFound => {
                TerminalManagerError::NotFound(profile_id.to_string())
            }
            other => TerminalManagerError::Database(other),
        })
}

fn unset_default_profiles(
    conn: &mut SqliteConnection,
    platform_name: &str,
    exclude_id: Option<&str>,
) -> Result<(), TerminalManagerError> {
    match exclude_id {
        Some(profile_id) => {
            diesel::update(
                terminal_profiles::table
                    .filter(terminal_profiles::platform.eq(platform_name))
                    .filter(terminal_profiles::id.ne(profile_id)),
            )
            .set(terminal_profiles::is_default.eq(false))
            .execute(conn)?;
        }
        None => {
            diesel::update(
                terminal_profiles::table.filter(terminal_profiles::platform.eq(platform_name)),
            )
            .set(terminal_profiles::is_default.eq(false))
            .execute(conn)?;
        }
    }

    Ok(())
}

fn default_profiles_for_platform(platform: &str) -> Vec<DefaultProfileTemplate> {
    match platform {
        "linux" => vec![
            DefaultProfileTemplate {
                name: "gnome-terminal",
                platform: "linux",
                command: "gnome-terminal",
                args_template: "-- {{SSH_COMMAND}}",
                is_default: true,
            },
            DefaultProfileTemplate {
                name: "kitty",
                platform: "linux",
                command: "kitty",
                args_template: "{{SSH_COMMAND}}",
                is_default: false,
            },
            DefaultProfileTemplate {
                name: "alacritty",
                platform: "linux",
                command: "alacritty",
                args_template: "-e {{SSH_COMMAND}}",
                is_default: false,
            },
        ],
        "windows" => vec![
            DefaultProfileTemplate {
                name: "PowerShell",
                platform: "windows",
                command: "powershell.exe",
                args_template: "-NoExit -Command \"{{SSH_COMMAND}}\"",
                is_default: true,
            },
            DefaultProfileTemplate {
                name: "Windows Terminal",
                platform: "windows",
                command: "wt.exe",
                args_template: "{{SSH_COMMAND}}",
                is_default: false,
            },
            DefaultProfileTemplate {
                name: "CMD",
                platform: "windows",
                command: "cmd.exe",
                args_template: "/k {{SSH_COMMAND}}",
                is_default: false,
            },
        ],
        "macos" => vec![
            DefaultProfileTemplate {
                name: "Terminal.app",
                platform: "macos",
                command: "osascript",
                args_template: "-e 'tell application \"Terminal\" to activate' -e 'tell application \"Terminal\" to do script \"{{SSH_COMMAND}}\"'",
                is_default: true,
            },
            DefaultProfileTemplate {
                name: "iTerm2",
                platform: "macos",
                command: "osascript",
                args_template: "-e 'tell application \"iTerm\" to activate' -e 'tell application \"iTerm\" to create window with default profile command \"{{SSH_COMMAND}}\"'",
                is_default: false,
            },
        ],
        _ => Vec::new(),
    }
}

fn is_terminal_available(profile: &DefaultProfileTemplate) -> bool {
    match profile.platform {
        "linux" | "windows" => binary_exists(profile.command),
        "macos" => {
            binary_exists(profile.command)
                && match profile.name {
                    "Terminal.app" => app_exists(&[
                        "/System/Applications/Utilities/Terminal.app",
                        "/Applications/Utilities/Terminal.app",
                    ]),
                    "iTerm2" => {
                        app_exists(&["/Applications/iTerm.app", "/Applications/iTerm2.app"])
                    }
                    _ => false,
                }
        }
        _ => false,
    }
}

fn binary_exists(binary: &str) -> bool {
    let binary_path = Path::new(binary);
    if binary_path.components().count() > 1 {
        return binary_path.is_file();
    }

    let Some(path_var) = env::var_os("PATH") else {
        return false;
    };

    if cfg!(target_os = "windows") {
        let path_exts: Vec<OsString> = env::var_os("PATHEXT")
            .unwrap_or_else(|| OsString::from(".COM;.EXE;.BAT;.CMD"))
            .to_string_lossy()
            .split(';')
            .map(OsString::from)
            .collect();

        for directory in env::split_paths(&path_var) {
            let direct_match = directory.join(binary);
            if direct_match.is_file() {
                return true;
            }

            if binary_path.extension().is_none() {
                for extension in &path_exts {
                    let candidate =
                        directory.join(format!("{binary}{}", extension.to_string_lossy()));
                    if candidate.is_file() {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    env::split_paths(&path_var).any(|directory| directory.join(binary).is_file())
}

fn app_exists(paths: &[&str]) -> bool {
    paths.iter().any(|path| Path::new(path).exists())
}

pub fn get_current_platform() -> String {
    current_platform().to_string()
}

fn current_platform() -> &'static str {
    match env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        current_platform, default_profiles_for_platform, get_current_platform, TerminalManager,
    };
    use crate::db::{
        models::{NewConnectionLog, NewServer},
        schema::{connection_logs, servers},
        DbPool, MIGRATIONS,
    };
    use chrono::{Duration, Utc};
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

    fn insert_server(pool: &DbPool, terminal_profile_id: Option<String>) -> String {
        let server_id = Uuid::new_v4().to_string();
        let mut conn = pool.get().unwrap();

        diesel::insert_into(servers::table)
            .values(&NewServer {
                id: server_id.clone(),
                name: "Example".to_string(),
                host: "example.com".to_string(),
                port: 2222,
                username: "alice".to_string(),
                auth_type: "password".to_string(),
                password: None,
                private_key_path: None,
                passphrase: None,
                group_id: None,
                description: Some("Example server".to_string()),
                terminal_profile_id,
                startup_command: Some("tmux attach || tmux new".to_string()),
                encoding: "utf8".to_string(),
                is_favorite: false,
                tags: None,
                jump_host: None,
                keep_alive: true,
                compression: false,
                agent_forward: false,
                port_forwards: None,
                proxy_type: "global".to_string(),
                proxy_host: None,
                proxy_port: None,
            })
            .execute(&mut conn)
            .unwrap();

        server_id
    }

    fn insert_connection_log(
        pool: &DbPool,
        server_id: &str,
        connected_at: chrono::NaiveDateTime,
    ) -> String {
        let log_id = Uuid::new_v4().to_string();
        let mut conn = pool.get().unwrap();

        diesel::insert_into(connection_logs::table)
            .values(&NewConnectionLog {
                id: log_id.clone(),
                server_id: server_id.to_string(),
                connected_at,
                status: "success".to_string(),
            })
            .execute(&mut conn)
            .unwrap();

        log_id
    }

    #[test]
    fn default_linux_profiles_include_expected_commands() {
        let profiles = default_profiles_for_platform("linux");
        let names: Vec<_> = profiles.iter().map(|profile| profile.name).collect();

        assert_eq!(names, vec!["gnome-terminal", "kitty", "alacritty"]);
        assert_eq!(
            profiles.iter().filter(|profile| profile.is_default).count(),
            1
        );
    }

    #[test]
    fn detect_available_terminals_only_returns_current_platform_profiles() {
        let detected = TerminalManager::detect_available_terminals();
        let platform = current_platform();

        assert!(detected.iter().all(|profile| profile.platform == platform));
    }

    #[test]
    fn seed_default_profiles_creates_one_default_for_current_platform() {
        let pool = test_pool("terminal-seed-defaults");
        let profiles = TerminalManager::seed_default_profiles(&pool).unwrap();
        let platform = current_platform();

        assert_eq!(
            profiles.len(),
            default_profiles_for_platform(platform).len()
        );
        assert_eq!(
            profiles.iter().filter(|profile| profile.is_default).count(),
            1
        );
        assert!(profiles.iter().all(|profile| profile.platform == platform));
    }

    #[test]
    fn set_default_profile_switches_default_within_platform() {
        let pool = test_pool("terminal-switch-default");
        let profiles = TerminalManager::seed_default_profiles(&pool).unwrap();
        let target = profiles.iter().find(|profile| !profile.is_default).unwrap();

        let updated = TerminalManager::set_default_profile(&pool, &target.id).unwrap();
        let refreshed = TerminalManager::list_profiles(&pool).unwrap();
        let platform_profiles: Vec<_> = refreshed
            .into_iter()
            .filter(|profile| profile.platform == target.platform)
            .collect();

        assert!(updated.is_default);
        assert_eq!(
            platform_profiles
                .iter()
                .filter(|profile| profile.is_default)
                .count(),
            1
        );
        assert!(platform_profiles
            .iter()
            .any(|profile| profile.id == target.id && profile.is_default));
    }

    #[test]
    fn get_current_platform_returns_supported_value() {
        let platform = get_current_platform();

        assert!(matches!(platform.as_str(), "linux" | "windows" | "macos"));
    }

    #[test]
    fn get_recent_connections_returns_newest_records_first() {
        let pool = test_pool("terminal-recent-connections");
        let server_id = insert_server(&pool, None);
        let older_id = insert_connection_log(
            &pool,
            &server_id,
            (Utc::now() - Duration::minutes(5)).naive_utc(),
        );
        let newer_id = insert_connection_log(&pool, &server_id, Utc::now().naive_utc());

        let logs = TerminalManager::get_recent_connections(&pool, Some(1)).unwrap();

        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, newer_id);
        assert_ne!(logs[0].id, older_id);
    }
}
