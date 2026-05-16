pub mod models;
pub mod schema;

use diesel::r2d2::{self, ConnectionManager};
use diesel::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::sync::Arc;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

pub type DbPool = Arc<r2d2::Pool<ConnectionManager<SqliteConnection>>>;

pub fn establish_connection_pool() -> DbPool {
    let db_path = get_db_path();

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(parent).expect("Failed to create database directory");
    }

    let manager = ConnectionManager::<SqliteConnection>::new(&db_path);
    let pool = r2d2::Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create database pool");

    // Run migrations
    let mut conn = pool.get().expect("Failed to get connection from pool");
    conn.run_pending_migrations(MIGRATIONS)
        .expect("Failed to run migrations");

    Arc::new(pool)
}

fn get_db_path() -> String {
    let config_dir = dirs::config_dir()
        .expect("Failed to get config directory")
        .join("kterminal");

    std::fs::create_dir_all(&config_dir).expect("Failed to create config directory");

    config_dir
        .join("kterminal.db")
        .to_str()
        .expect("Invalid path")
        .to_string()
}
