export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key" | "agent";
  password?: string;
  private_key_path?: string;
  passphrase?: string;
  group_id?: string | null;
  description?: string;
  terminal_profile_id?: string;
  startup_command?: string;
  encoding: string;
  is_favorite: boolean;
  tags?: string;
  jump_host?: string;
  keep_alive: boolean;
  compression: boolean;
  agent_forward: boolean;
  port_forwards?: string;
  last_connected_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateServerRequest {
  name: string;
  host: string;
  port?: number;
  username: string;
  auth_type: string;
  password?: string;
  private_key_path?: string;
  passphrase?: string;
  group_id?: string | null;
  description?: string;
  terminal_profile_id?: string;
  startup_command?: string;
  encoding?: string;
  tags?: string;
  jump_host?: string;
  keep_alive?: boolean;
  compression?: boolean;
  agent_forward?: boolean;
  port_forwards?: string;
}

export interface UpdateServerRequest {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_type?: string;
  password?: string;
  private_key_path?: string;
  passphrase?: string;
  group_id?: string | null;
  description?: string;
  terminal_profile_id?: string;
  startup_command?: string;
  encoding?: string;
  is_favorite?: boolean;
  tags?: string;
  jump_host?: string;
  keep_alive?: boolean;
  compression?: boolean;
  agent_forward?: boolean;
  port_forwards?: string;
}

export interface SshCommand {
  full_command: string;
  host: string;
  port: number;
  user: string;
}

export interface Group {
  id: string;
  name: string;
  parent_id?: string | null;
  sort_order: number;
  created_at: string;
}

export interface CreateGroupRequest {
  name: string;
  parent_id?: string | null;
  sort_order?: number;
}

export interface UpdateGroupRequest {
  name?: string;
  parent_id?: string | null;
  sort_order?: number;
}

export interface ReorderGroupUpdate {
  id: string;
  sort_order: number;
}

export interface GroupNode {
  id: string;
  name: string;
  parent_id?: string | null;
  sort_order: number;
  children: GroupNode[];
  servers: Server[];
}

export interface TerminalProfile {
  id: string;
  name: string;
  platform: string;
  command: string;
  args_template: string;
  is_default: boolean;
  created_at: string;
}

export interface CreateTerminalProfileRequest {
  name: string;
  platform: string;
  command: string;
  args_template: string;
  is_default?: boolean;
}

export interface UpdateTerminalProfileRequest {
  name?: string;
  platform?: string;
  command?: string;
  args_template?: string;
  is_default?: boolean;
}

export interface DetectedTerminal {
  name: string;
  platform: string;
  command: string;
  args_template: string;
}

export interface ConnectionLog {
  id: string;
  server_id: string;
  connected_at: string;
  status: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface AppInfo {
  version: string;
  config_path: string;
  db_path: string;
}
