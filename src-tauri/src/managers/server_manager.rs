use chrono::Utc;
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::models::{NewServer, Server, UpdateServer};
use crate::db::schema::servers;
use crate::db::DbPool;
use crate::security::keyring::CredentialStore;

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("Pool error: {0}")]
    Pool(String),
    #[error("Server not found: {0}")]
    NotFound(String),
    #[error("Credential error: {0}")]
    Credential(String),
}

impl From<r2d2::Error> for ServerError {
    fn from(e: r2d2::Error) -> Self {
        ServerError::Pool(e.to_string())
    }
}

use diesel::r2d2;

pub struct ServerManager;

impl ServerManager {
    pub fn list(pool: &DbPool) -> Result<Vec<Server>, ServerError> {
        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;
        let results = servers::table
            .order(servers::name.asc())
            .load::<Server>(&mut conn)?;
        Ok(results)
    }

    pub fn get(pool: &DbPool, server_id: &str) -> Result<Server, ServerError> {
        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;
        let server = servers::table
            .find(server_id)
            .first::<Server>(&mut conn)
            .map_err(|_| ServerError::NotFound(server_id.to_string()))?;
        Ok(server)
    }

    pub fn create(pool: &DbPool, mut new_server: NewServer) -> Result<Server, ServerError> {
        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;

        new_server.id = Uuid::new_v4().to_string();

        // Encrypt password if provided
        if let Some(ref password) = new_server.password {
            if !password.is_empty() {
                let encrypted = CredentialStore::store_password(&new_server.id, password)
                    .map_err(|e| ServerError::Credential(e.to_string()))?;
                new_server.password = Some(encrypted);
            }
        }

        diesel::insert_into(servers::table)
            .values(&new_server)
            .execute(&mut conn)?;

        Self::get(pool, &new_server.id)
    }

    pub fn update(
        pool: &DbPool,
        server_id: &str,
        mut changes: UpdateServer,
    ) -> Result<Server, ServerError> {
        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;

        // Encrypt password if being updated
        if let Some(ref password) = changes.password {
            if !password.is_empty() {
                let encrypted = CredentialStore::store_password(server_id, password)
                    .map_err(|e| ServerError::Credential(e.to_string()))?;
                changes.password = Some(encrypted);
            }
        }

        let now = Utc::now().naive_utc();
        diesel::update(servers::table.find(server_id))
            .set((&changes, servers::updated_at.eq(now)))
            .execute(&mut conn)?;

        Self::get(pool, server_id)
    }

    pub fn delete(pool: &DbPool, server_id: &str) -> Result<(), ServerError> {
        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;

        // Clean up stored credentials
        let _ = CredentialStore::delete_password(server_id);

        diesel::delete(servers::table.find(server_id)).execute(&mut conn)?;
        Ok(())
    }

    pub fn clone_server(pool: &DbPool, server_id: &str) -> Result<Server, ServerError> {
        let original = Self::get(pool, server_id)?;
        let new_id = Uuid::new_v4().to_string();

        let new_server = NewServer {
            id: new_id,
            name: format!("{} (Copy)", original.name),
            host: original.host,
            port: original.port,
            username: original.username,
            auth_type: original.auth_type,
            password: original.password,
            private_key_path: original.private_key_path,
            passphrase: original.passphrase,
            group_id: original.group_id,
            description: original.description,
            terminal_profile_id: original.terminal_profile_id,
            startup_command: original.startup_command,
            encoding: original.encoding,
            is_favorite: false,
            tags: original.tags,
            jump_host: original.jump_host,
            keep_alive: original.keep_alive,
            compression: original.compression,
            agent_forward: original.agent_forward,
            port_forwards: original.port_forwards,
            proxy_type: original.proxy_type,
            proxy_host: original.proxy_host,
            proxy_port: original.proxy_port,
        };

        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;
        diesel::insert_into(servers::table)
            .values(&new_server)
            .execute(&mut conn)?;

        Self::get(pool, &new_server.id)
    }

    pub fn toggle_favorite(pool: &DbPool, server_id: &str) -> Result<Server, ServerError> {
        let server = Self::get(pool, server_id)?;
        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;

        diesel::update(servers::table.find(server_id))
            .set(servers::is_favorite.eq(!server.is_favorite))
            .execute(&mut conn)?;

        Self::get(pool, server_id)
    }

    pub fn update_last_connected(pool: &DbPool, server_id: &str) -> Result<(), ServerError> {
        let mut conn = pool.get().map_err(|e| ServerError::Pool(e.to_string()))?;
        let now = Utc::now().naive_utc();

        diesel::update(servers::table.find(server_id))
            .set(servers::last_connected_at.eq(Some(now)))
            .execute(&mut conn)?;

        Ok(())
    }
}
