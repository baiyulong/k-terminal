use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::r2d2;
use diesel::sql_types::{Bool, Text};
use diesel::sqlite::Sqlite;
use diesel::BoxableExpression;

use crate::db::models::Server;
use crate::db::schema::servers;
use crate::db::DbPool;

#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("Pool error: {0}")]
    Pool(String),
}

impl From<r2d2::Error> for SearchError {
    fn from(error: r2d2::Error) -> Self {
        Self::Pool(error.to_string())
    }
}

pub fn search_servers(pool: &DbPool, query: &str) -> Result<Vec<Server>, SearchError> {
    let words = normalize_query(query);
    if words.is_empty() {
        return Ok(Vec::new());
    }

    let mut conn = pool
        .get()
        .map_err(|error| SearchError::Pool(error.to_string()))?;
    let mut search_query = servers::table.into_boxed::<Sqlite>();

    for word in &words {
        search_query = search_query.filter(word_filter(word));
    }

    let mut results = search_query.load::<Server>(&mut conn)?;
    results.sort_by_key(|server| {
        (
            relevance_score(server, &words),
            server.name.to_lowercase(),
            server.host.to_lowercase(),
        )
    });
    results.truncate(50);

    Ok(results)
}

fn normalize_query(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(str::trim)
        .filter(|word| !word.is_empty())
        .map(|word| word.to_lowercase())
        .collect()
}

type SearchFilter<'a> = Box<dyn BoxableExpression<servers::table, Sqlite, SqlType = Bool> + 'a>;

fn word_filter(word: &str) -> SearchFilter<'static> {
    let pattern = format!("%{word}%");

    Box::new(
        sql::<Bool>("name LIKE ")
            .bind::<Text, _>(pattern.clone())
            .or(sql::<Bool>("host LIKE ").bind::<Text, _>(pattern.clone()))
            .or(sql::<Bool>("COALESCE(tags, '') LIKE ").bind::<Text, _>(pattern.clone()))
            .or(sql::<Bool>("COALESCE(description, '') LIKE ").bind::<Text, _>(pattern)),
    )
}

fn relevance_score(server: &Server, words: &[String]) -> usize {
    words
        .iter()
        .map(|word| {
            if contains(&server.name, word) {
                0
            } else if contains(&server.host, word) {
                1
            } else if server
                .tags
                .as_deref()
                .is_some_and(|tags| contains(tags, word))
                || server
                    .description
                    .as_deref()
                    .is_some_and(|description| contains(description, word))
            {
                2
            } else {
                3
            }
        })
        .sum()
}

fn contains(value: &str, query: &str) -> bool {
    value.to_lowercase().contains(query)
}

#[cfg(test)]
mod tests {
    use super::search_servers;
    use crate::db::models::{NewServer, Server};
    use crate::db::schema::servers;
    use crate::db::{DbPool, MIGRATIONS};
    use diesel::prelude::*;
    use diesel::r2d2::{ConnectionManager, Pool};
    use diesel::sqlite::SqliteConnection;
    use diesel_migrations::MigrationHarness;
    use std::sync::Arc;

    fn test_pool(name: &str) -> DbPool {
        let database_url = format!("file:{name}?mode=memory&cache=shared");
        let manager = ConnectionManager::<SqliteConnection>::new(database_url);
        let pool = Pool::builder().max_size(1).build(manager).unwrap();
        let mut conn = pool.get().unwrap();

        conn.run_pending_migrations(MIGRATIONS).unwrap();

        Arc::new(pool)
    }

    fn insert_server(
        pool: &DbPool,
        id: &str,
        name: &str,
        host: &str,
        tags: Option<&str>,
        description: Option<&str>,
    ) -> Server {
        let mut conn = pool.get().unwrap();
        let new_server = NewServer {
            id: id.to_string(),
            name: name.to_string(),
            host: host.to_string(),
            port: 22,
            username: "root".to_string(),
            auth_type: "password".to_string(),
            password: None,
            private_key_path: None,
            passphrase: None,
            group_id: None,
            description: description.map(str::to_string),
            terminal_profile_id: None,
            startup_command: None,
            encoding: "utf8".to_string(),
            is_favorite: false,
            tags: tags.map(str::to_string),
            jump_host: None,
            keep_alive: true,
            compression: false,
            agent_forward: false,
            port_forwards: None,
        };

        diesel::insert_into(servers::table)
            .values(&new_server)
            .execute(&mut conn)
            .unwrap();

        servers::table.find(id).first(&mut conn).unwrap()
    }

    #[test]
    fn search_matches_all_words_across_name_host_tags_and_description() {
        let pool = test_pool("search-all-fields");

        insert_server(
            &pool,
            "alpha",
            "Production API",
            "api.prod.internal",
            Some("critical,blue"),
            Some("Primary gateway"),
        );
        insert_server(
            &pool,
            "beta",
            "Reports",
            "analytics.internal",
            Some("blue"),
            Some("Production dashboard"),
        );
        insert_server(
            &pool,
            "gamma",
            "Staging API",
            "api.staging.internal",
            Some("green"),
            Some("Non production"),
        );

        let results = search_servers(&pool, "prod blue").unwrap();
        let ids: Vec<_> = results.into_iter().map(|server| server.id).collect();

        assert_eq!(ids, vec!["alpha", "beta"]);
    }

    #[test]
    fn search_orders_name_matches_before_host_and_metadata_matches() {
        let pool = test_pool("search-relevance");

        insert_server(
            &pool,
            "name-match",
            "Alpha Node",
            "server.internal",
            None,
            None,
        );
        insert_server(&pool, "host-match", "Backend", "alpha.internal", None, None);
        insert_server(
            &pool,
            "metadata-match",
            "Worker",
            "worker.internal",
            Some("alpha"),
            Some("background jobs"),
        );

        let results = search_servers(&pool, "alpha").unwrap();
        let ids: Vec<_> = results.into_iter().map(|server| server.id).collect();

        assert_eq!(ids, vec!["name-match", "host-match", "metadata-match"]);
    }

    #[test]
    fn search_limits_results_to_fifty() {
        let pool = test_pool("search-limit");

        for index in 0..55 {
            insert_server(
                &pool,
                &format!("server-{index:02}"),
                &format!("Alpha {index:02}"),
                &format!("alpha-{index:02}.internal"),
                None,
                None,
            );
        }

        let results = search_servers(&pool, "alpha").unwrap();

        assert_eq!(results.len(), 50);
    }
}
