use std::collections::HashMap;

use diesel::dsl::max;
use diesel::prelude::*;
use diesel::r2d2;
use diesel::sqlite::SqliteConnection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::models::{Group, NewGroup, Server, UpdateGroup};
use crate::db::schema::{groups, servers};
use crate::db::DbPool;

#[derive(Debug, thiserror::Error)]
pub enum GroupError {
    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("Pool error: {0}")]
    Pool(String),
    #[error("Group not found: {0}")]
    NotFound(String),
    #[error("Invalid parent group: {0}")]
    InvalidParent(String),
    #[error("Validation error: {0}")]
    Validation(String),
}

impl From<r2d2::Error> for GroupError {
    fn from(error: r2d2::Error) -> Self {
        Self::Pool(error.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GroupNode {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i32,
    pub children: Vec<GroupNode>,
    pub servers: Vec<Server>,
}

pub struct GroupManager;

impl GroupManager {
    pub fn list(pool: &DbPool) -> Result<Vec<Group>, GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;
        fetch_sorted_groups(&mut conn)
    }

    pub fn get(pool: &DbPool, group_id: &str) -> Result<Group, GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;
        fetch_group(&mut conn, group_id)
    }

    pub fn create(pool: &DbPool, mut new_group: NewGroup) -> Result<Group, GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;

        if new_group.id.trim().is_empty() {
            new_group.id = Uuid::new_v4().to_string();
        }

        new_group.name = normalize_group_name(new_group.name)?;
        new_group.parent_id = normalize_parent_id(new_group.parent_id);
        let group_id = new_group.id.clone();

        conn.transaction::<Group, GroupError, _>(|conn| {
            validate_parent_target(conn, None, new_group.parent_id.as_deref())?;

            if new_group.sort_order < 0 {
                new_group.sort_order = next_sort_order(conn, new_group.parent_id.as_deref())?;
            }

            diesel::insert_into(groups::table)
                .values(&new_group)
                .execute(conn)?;

            fetch_group(conn, &group_id)
        })
    }

    pub fn update(
        pool: &DbPool,
        group_id: &str,
        mut changes: UpdateGroup,
    ) -> Result<Group, GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;
        let group_id = group_id.to_string();

        conn.transaction::<Group, GroupError, _>(|conn| {
            fetch_group(conn, &group_id)?;

            if let Some(name) = changes.name.take() {
                changes.name = Some(normalize_group_name(name)?);
            }

            if let Some(parent_id) = changes.parent_id.take() {
                let normalized_parent_id = normalize_parent_id(parent_id);
                validate_parent_target(conn, Some(&group_id), normalized_parent_id.as_deref())?;
                changes.parent_id = Some(normalized_parent_id);
            }

            if changes.name.is_none() && changes.parent_id.is_none() && changes.sort_order.is_none()
            {
                return fetch_group(conn, &group_id);
            }

            let updated = diesel::update(groups::table.find(&group_id))
                .set(&changes)
                .execute(conn)?;

            if updated == 0 {
                return Err(GroupError::NotFound(group_id.clone()));
            }

            fetch_group(conn, &group_id)
        })
    }

    pub fn delete(pool: &DbPool, group_id: &str) -> Result<(), GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;
        let group_id = group_id.to_string();

        conn.transaction::<(), GroupError, _>(|conn| {
            fetch_group(conn, &group_id)?;

            let all_groups = fetch_sorted_groups(conn)?;
            let mut deletion_order = collect_descendant_ids(&all_groups, &group_id);
            deletion_order.push(group_id.clone());

            let server_group_ids: Vec<Option<String>> =
                deletion_order.iter().cloned().map(Some).collect();

            if !server_group_ids.is_empty() {
                diesel::update(servers::table.filter(servers::group_id.eq_any(server_group_ids)))
                    .set(servers::group_id.eq::<Option<String>>(None))
                    .execute(conn)?;
            }

            for delete_id in deletion_order {
                diesel::delete(groups::table.find(&delete_id)).execute(conn)?;
            }

            Ok(())
        })
    }

    pub fn move_group(
        pool: &DbPool,
        group_id: &str,
        new_parent_id: Option<String>,
    ) -> Result<Group, GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;
        let group_id = group_id.to_string();
        let normalized_parent_id = normalize_parent_id(new_parent_id);

        conn.transaction::<Group, GroupError, _>(|conn| {
            fetch_group(conn, &group_id)?;
            validate_parent_target(conn, Some(&group_id), normalized_parent_id.as_deref())?;

            let updated = diesel::update(groups::table.find(&group_id))
                .set(groups::parent_id.eq(normalized_parent_id.clone()))
                .execute(conn)?;

            if updated == 0 {
                return Err(GroupError::NotFound(group_id.clone()));
            }

            fetch_group(conn, &group_id)
        })
    }

    pub fn reorder_groups(
        pool: &DbPool,
        updates: Vec<(String, i32)>,
    ) -> Result<Vec<Group>, GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;

        if updates.is_empty() {
            return fetch_sorted_groups(&mut conn);
        }

        conn.transaction::<Vec<Group>, GroupError, _>(|conn| {
            for (group_id, sort_order) in updates {
                let updated = diesel::update(groups::table.find(&group_id))
                    .set(groups::sort_order.eq(sort_order))
                    .execute(conn)?;

                if updated == 0 {
                    return Err(GroupError::NotFound(group_id));
                }
            }

            fetch_sorted_groups(conn)
        })
    }

    pub fn get_tree(pool: &DbPool) -> Result<Vec<GroupNode>, GroupError> {
        let mut conn = pool
            .get()
            .map_err(|error| GroupError::Pool(error.to_string()))?;
        let all_groups = fetch_sorted_groups(&mut conn)?;
        let all_servers = servers::table
            .order(servers::name.asc())
            .load::<Server>(&mut conn)?;

        Ok(build_group_tree(all_groups, all_servers))
    }
}

fn fetch_group(conn: &mut SqliteConnection, group_id: &str) -> Result<Group, GroupError> {
    groups::table
        .find(group_id)
        .first::<Group>(conn)
        .map_err(|error| match error {
            diesel::result::Error::NotFound => GroupError::NotFound(group_id.to_string()),
            other => GroupError::Database(other),
        })
}

fn fetch_sorted_groups(conn: &mut SqliteConnection) -> Result<Vec<Group>, GroupError> {
    groups::table
        .order((groups::sort_order.asc(), groups::name.asc()))
        .load::<Group>(conn)
        .map_err(Into::into)
}

fn next_sort_order(
    conn: &mut SqliteConnection,
    parent_id: Option<&str>,
) -> Result<i32, GroupError> {
    let max_sort_order = match parent_id {
        Some(parent_id) => groups::table
            .filter(groups::parent_id.eq(parent_id))
            .select(max(groups::sort_order))
            .first::<Option<i32>>(conn)?,
        None => groups::table
            .filter(groups::parent_id.is_null())
            .select(max(groups::sort_order))
            .first::<Option<i32>>(conn)?,
    };

    Ok(max_sort_order.unwrap_or(-1) + 1)
}

fn normalize_group_name(name: String) -> Result<String, GroupError> {
    let normalized_name = name.trim().to_string();
    if normalized_name.is_empty() {
        return Err(GroupError::Validation(
            "Group name cannot be empty".to_string(),
        ));
    }

    Ok(normalized_name)
}

fn normalize_parent_id(parent_id: Option<String>) -> Option<String> {
    parent_id.and_then(|value| {
        let trimmed_value = value.trim().to_string();
        if trimmed_value.is_empty() {
            None
        } else {
            Some(trimmed_value)
        }
    })
}

fn validate_parent_target(
    conn: &mut SqliteConnection,
    current_group_id: Option<&str>,
    parent_id: Option<&str>,
) -> Result<(), GroupError> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };

    if current_group_id == Some(parent_id) {
        return Err(GroupError::InvalidParent(
            "A group cannot be its own parent".to_string(),
        ));
    }

    let all_groups = fetch_sorted_groups(conn)?;
    let parent_exists = all_groups.iter().any(|group| group.id == parent_id);

    if !parent_exists {
        return Err(GroupError::InvalidParent(parent_id.to_string()));
    }

    if let Some(current_group_id) = current_group_id {
        let descendant_ids = collect_descendant_ids(&all_groups, current_group_id);
        if descendant_ids
            .iter()
            .any(|descendant_id| descendant_id == parent_id)
        {
            return Err(GroupError::InvalidParent(
                "A group cannot be moved inside one of its descendants".to_string(),
            ));
        }
    }

    Ok(())
}

fn collect_descendant_ids(all_groups: &[Group], group_id: &str) -> Vec<String> {
    let mut descendant_ids = Vec::new();
    collect_descendant_ids_recursive(all_groups, group_id, &mut descendant_ids);
    descendant_ids
}

fn collect_descendant_ids_recursive(
    all_groups: &[Group],
    parent_id: &str,
    descendant_ids: &mut Vec<String>,
) {
    for child in all_groups
        .iter()
        .filter(|group| group.parent_id.as_deref() == Some(parent_id))
    {
        collect_descendant_ids_recursive(all_groups, &child.id, descendant_ids);
        descendant_ids.push(child.id.clone());
    }
}

fn build_group_tree(all_groups: Vec<Group>, all_servers: Vec<Server>) -> Vec<GroupNode> {
    let mut groups_by_parent: HashMap<Option<String>, Vec<Group>> = HashMap::new();
    for group in all_groups {
        groups_by_parent
            .entry(group.parent_id.clone())
            .or_default()
            .push(group);
    }

    let mut servers_by_group: HashMap<String, Vec<Server>> = HashMap::new();
    for server in all_servers {
        if let Some(group_id) = server.group_id.clone() {
            servers_by_group.entry(group_id).or_default().push(server);
        }
    }

    build_group_nodes(None, &mut groups_by_parent, &mut servers_by_group)
}

fn build_group_nodes(
    parent_id: Option<String>,
    groups_by_parent: &mut HashMap<Option<String>, Vec<Group>>,
    servers_by_group: &mut HashMap<String, Vec<Server>>,
) -> Vec<GroupNode> {
    groups_by_parent
        .remove(&parent_id)
        .unwrap_or_default()
        .into_iter()
        .map(|group| {
            let group_id = group.id.clone();
            let group_parent_id = group.parent_id.clone();
            GroupNode {
                id: group.id,
                name: group.name,
                parent_id: group_parent_id,
                sort_order: group.sort_order,
                children: build_group_nodes(
                    Some(group_id.clone()),
                    groups_by_parent,
                    servers_by_group,
                ),
                servers: servers_by_group.remove(&group_id).unwrap_or_default(),
            }
        })
        .collect()
}
