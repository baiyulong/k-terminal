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
  group_id?: string;
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
  group_id?: string;
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
  group_id?: string;
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

export interface Group {
  id: string;
  name: string;
  parent_id?: string;
  sort_order: number;
  created_at: string;
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

export interface ConnectionLog {
  id: string;
  server_id: string;
  connected_at: string;
  status: string;
}
