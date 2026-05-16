use serde::Deserialize;
use tauri::State;

use crate::db::models::{Group, NewGroup, UpdateGroup};
use crate::db::DbPool;
use crate::managers::group_manager::{GroupManager, GroupNode};

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub name: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderGroupRequest {
    pub id: String,
    pub sort_order: i32,
}

#[tauri::command]
pub fn list_groups(pool: State<'_, DbPool>) -> Result<Vec<Group>, String> {
    GroupManager::list(&pool).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_group(pool: State<'_, DbPool>, id: String) -> Result<Group, String> {
    GroupManager::get(&pool, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_group(
    pool: State<'_, DbPool>,
    request: CreateGroupRequest,
) -> Result<Group, String> {
    let new_group = NewGroup {
        id: String::new(),
        name: request.name,
        parent_id: normalize_optional_text(request.parent_id),
        sort_order: request.sort_order.unwrap_or(-1),
    };

    GroupManager::create(&pool, new_group).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_group(
    pool: State<'_, DbPool>,
    id: String,
    changes: UpdateGroupRequest,
) -> Result<Group, String> {
    let changes = UpdateGroup {
        name: changes.name,
        parent_id: changes.parent_id.map(normalize_optional_text),
        sort_order: changes.sort_order,
    };

    GroupManager::update(&pool, &id, changes).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_group(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    GroupManager::delete(&pool, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn move_group(
    pool: State<'_, DbPool>,
    id: String,
    new_parent_id: Option<String>,
) -> Result<Group, String> {
    GroupManager::move_group(&pool, &id, normalize_optional_text(new_parent_id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reorder_groups(
    pool: State<'_, DbPool>,
    updates: Vec<ReorderGroupRequest>,
) -> Result<Vec<Group>, String> {
    let updates = updates
        .into_iter()
        .map(|update| (update.id, update.sort_order))
        .collect();

    GroupManager::reorder_groups(&pool, updates).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_group_tree(pool: State<'_, DbPool>) -> Result<Vec<GroupNode>, String> {
    GroupManager::get_tree(&pool).map_err(|error| error.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed_value = value.trim().to_string();
        if trimmed_value.is_empty() {
            None
        } else {
            Some(trimmed_value)
        }
    })
}
