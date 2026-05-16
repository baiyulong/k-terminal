import { invoke } from "@tauri-apps/api/core";
import type {
  Server,
  CreateServerRequest,
  UpdateServerRequest,
} from "./types";

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
