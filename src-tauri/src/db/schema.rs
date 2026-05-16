diesel::table! {
    servers (id) {
        id -> Text,
        name -> Text,
        host -> Text,
        port -> Integer,
        username -> Text,
        auth_type -> Text,
        password -> Nullable<Text>,
        private_key_path -> Nullable<Text>,
        passphrase -> Nullable<Text>,
        group_id -> Nullable<Text>,
        description -> Nullable<Text>,
        terminal_profile_id -> Nullable<Text>,
        startup_command -> Nullable<Text>,
        encoding -> Text,
        is_favorite -> Bool,
        tags -> Nullable<Text>,
        jump_host -> Nullable<Text>,
        keep_alive -> Bool,
        compression -> Bool,
        agent_forward -> Bool,
        port_forwards -> Nullable<Text>,
        last_connected_at -> Nullable<Timestamp>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    groups (id) {
        id -> Text,
        name -> Text,
        parent_id -> Nullable<Text>,
        sort_order -> Integer,
        created_at -> Timestamp,
    }
}

diesel::table! {
    terminal_profiles (id) {
        id -> Text,
        name -> Text,
        platform -> Text,
        command -> Text,
        args_template -> Text,
        is_default -> Bool,
        created_at -> Timestamp,
    }
}

diesel::table! {
    connection_logs (id) {
        id -> Text,
        server_id -> Text,
        connected_at -> Timestamp,
        status -> Text,
    }
}

diesel::allow_tables_to_appear_in_same_query!(servers, groups, terminal_profiles, connection_logs,);
