import { invoke } from "@tauri-apps/api/core";
import { Channel } from "@tauri-apps/api/core";
import type { ProxyConfig } from "./proxyResolver";
import type {
  AppInfo,
  CreateGroupRequest,
  CreateServerRequest,
  CreateTerminalProfileRequest,
  DetectedTerminal,
  Group,
  GroupNode,
  ImportResult,
  ReorderGroupUpdate,
  Server,
  SshCommand,
  TerminalProfile,
  UpdateGroupRequest,
  UpdateServerRequest,
  UpdateTerminalProfileRequest,
} from "./types";

export type TerminalChannelMessage =
  | { type: "Data"; payload: { session_id: string; data: number[] } }
  | { type: "Status"; payload: { session_id: string; status: string; reason?: string } };

export const serverApi = {
  list: () => invoke<Server[]>("list_servers"),
  get: (id: string) => invoke<Server>("get_server", { id }),
  create: (request: CreateServerRequest) =>
    invoke<Server>("create_server", { request }),
  update: (id: string, changes: UpdateServerRequest) =>
    invoke<Server>("update_server", { id, changes }),
  delete: (id: string) => invoke<void>("delete_server", { id }),
  clone: (id: string) => invoke<Server>("clone_server", { id }),
  toggleFavorite: (id: string) => invoke<Server>("toggle_favorite", { id }),
};

export const searchApi = {
  search: (query: string) => invoke<Server[]>("search_servers", { query }),
};

export const groupApi = {
  list: () => invoke<Group[]>("list_groups"),
  get: (id: string) => invoke<Group>("get_group", { id }),
  create: (request: CreateGroupRequest) =>
    invoke<Group>("create_group", { request }),
  update: (id: string, changes: UpdateGroupRequest) =>
    invoke<Group>("update_group", { id, changes }),
  delete: (id: string) => invoke<void>("delete_group", { id }),
  move: (id: string, newParentId?: string | null) =>
    invoke<Group>("move_group", { id, newParentId }),
  reorder: (updates: ReorderGroupUpdate[]) =>
    invoke<Group[]>("reorder_groups", { updates }),
  getTree: () => invoke<GroupNode[]>("get_group_tree"),
};

export const sshApi = {
  generateCommand: (serverId: string) =>
    invoke<SshCommand>("generate_ssh_command", { serverId }),
  getCommandPreview: (serverId: string) =>
    invoke<string>("get_ssh_command_preview", { serverId }),
};

export const terminalProfileApi = {
  list: () => invoke<TerminalProfile[]>("list_terminal_profiles"),
  get: (id: string) => invoke<TerminalProfile>("get_terminal_profile", { id }),
  create: (request: CreateTerminalProfileRequest) =>
    invoke<TerminalProfile>("create_terminal_profile", { request }),
  update: (id: string, changes: UpdateTerminalProfileRequest) =>
    invoke<TerminalProfile>("update_terminal_profile", { id, changes }),
  delete: (id: string) => invoke<void>("delete_terminal_profile", { id }),
  setDefault: (id: string) =>
    invoke<TerminalProfile>("set_default_terminal_profile", { id }),
  detectAvailable: () =>
    invoke<DetectedTerminal[]>("detect_available_terminals"),
  seedDefaults: () =>
    invoke<TerminalProfile[]>("seed_default_terminal_profiles"),
};

export const settingsApi = {
  exportData: () => invoke<string>("export_data"),
  importData: (json: string) => invoke<ImportResult>("import_data", { json }),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),
  listSystemFonts: () => invoke<string[]>("list_system_fonts"),
};

export const terminalSessionApi = {
  connect: (
    serverId: string,
    channel: Channel<TerminalChannelMessage>,
    proxy?: ProxyConfig | null,
    cols?: number,
    rows?: number,
  ): Promise<string> =>
    invoke("connect_ssh_session", { serverId, channel, proxy: proxy ?? null, cols, rows }),

  disconnect: (sessionId: string): Promise<void> =>
    invoke("disconnect_ssh_session", { sessionId }),

  sendInput: (sessionId: string, data: number[]): Promise<void> =>
    invoke("terminal_input", { sessionId, data }),

  resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
    invoke("terminal_resize", { sessionId, cols, rows }),
};
