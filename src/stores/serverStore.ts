import { create } from "zustand";
import type { Server } from "@/lib/types";

interface ServerState {
  servers: Server[];
  selectedServerId: string | null;
  setServers: (servers: Server[]) => void;
  setSelectedServerId: (id: string | null) => void;
  addServer: (server: Server) => void;
  updateServer: (server: Server) => void;
  removeServer: (id: string) => void;
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  selectedServerId: null,
  setServers: (servers) => set({ servers }),
  setSelectedServerId: (id) => set({ selectedServerId: id }),
  addServer: (server) =>
    set((state) => ({ servers: [...state.servers, server] })),
  updateServer: (server) =>
    set((state) => ({
      servers: state.servers.map((s) => (s.id === server.id ? server : s)),
    })),
  removeServer: (id) =>
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      selectedServerId:
        state.selectedServerId === id ? null : state.selectedServerId,
    })),
}));
