CREATE TABLE servers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT NOT NULL DEFAULT 'password',
    password TEXT,
    private_key_path TEXT,
    passphrase TEXT,
    group_id TEXT,
    description TEXT,
    terminal_profile_id TEXT,
    startup_command TEXT,
    encoding TEXT NOT NULL DEFAULT 'utf8',
    is_favorite BOOLEAN NOT NULL DEFAULT 0,
    tags TEXT,
    jump_host TEXT,
    keep_alive BOOLEAN NOT NULL DEFAULT 1,
    compression BOOLEAN NOT NULL DEFAULT 0,
    agent_forward BOOLEAN NOT NULL DEFAULT 0,
    port_forwards TEXT,
    last_connected_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES groups(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE terminal_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    command TEXT NOT NULL,
    args_template TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE connection_logs (
    id TEXT PRIMARY KEY NOT NULL,
    server_id TEXT NOT NULL REFERENCES servers(id),
    connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'success'
);

CREATE INDEX idx_servers_group_id ON servers(group_id);
CREATE INDEX idx_servers_name ON servers(name);
CREATE INDEX idx_servers_host ON servers(host);
CREATE INDEX idx_servers_is_favorite ON servers(is_favorite);
CREATE INDEX idx_groups_parent_id ON groups(parent_id);
CREATE INDEX idx_connection_logs_server_id ON connection_logs(server_id);
