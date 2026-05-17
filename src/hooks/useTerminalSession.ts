import { useCallback } from "react";
import { terminalSessionApi } from "@/lib/tauri";
import { LOCAL_MACHINE_ID } from "@/lib/constants";
import { resolveProxy } from "@/lib/proxyResolver";
import { useSettingsStore } from "@/stores/settingsStore";
import { useServerStore } from "@/stores/serverStore";
import {
  createChannel,
  storeChannel,
  releaseChannel,
  registerDataHandler,
  unregisterDataHandler,
} from "@/lib/terminalChannels";
import {
  useTerminalSessionStore,
} from "@/stores/terminalSessionStore";

export { registerDataHandler, unregisterDataHandler };

/**
 * Returns helpers for connecting to / disconnecting from a server.
 */
export function useTerminalActions() {
  const addSession = useTerminalSessionStore((state) => state.addSession);
  const removeSession = useTerminalSessionStore((state) => state.removeSession);
  const updateSessionStatus = useTerminalSessionStore((state) => state.updateSessionStatus);

  const connect = useCallback(
    async (serverId: string, serverName: string) => {
      // Fetch current store state at invocation time (not closure time) to ensure
      // proxy settings are fresh. getState() is intentional to keep the callback stable.
      const server = useServerStore.getState().servers.find((s) => s.id === serverId);
      const settings = useSettingsStore.getState();

      const targetHost = serverId === LOCAL_MACHINE_ID ? "localhost" : (server?.host ?? "");
      const proxy = resolveProxy(
        server?.proxy_type ?? "global",
        server?.proxy_host,
        server?.proxy_port,
        {
          proxyType: settings.proxyType,
          proxyHost: settings.proxyHost,
          proxyPort: settings.proxyPort,
          proxyBypass: settings.proxyBypass,
        },
        targetHost,
      );

      const channel = createChannel((sessionId, status, reason) => {
        updateSessionStatus(sessionId, status, reason);
      });
      // Diagnostic: log what shell value is in Zustand store vs localStorage
      const lsShell = typeof window !== "undefined" ? window.localStorage.getItem("kterminal.local.shell") : null;
      console.log("[k-terminal] connect localShell: store=", JSON.stringify(settings.localShell), " localStorage=", JSON.stringify(lsShell));
      const shellToUse = lsShell || null;
      const sessionId = serverId === LOCAL_MACHINE_ID
        ? await terminalSessionApi.connectLocal(channel, proxy, undefined, undefined, shellToUse)
        : await terminalSessionApi.connect(serverId, channel, proxy);
      storeChannel(sessionId, channel);
      addSession({
        id: sessionId,
        serverId,
        serverName,
        status: "connecting",
      });
      return sessionId;
    },
    [addSession, updateSessionStatus],
  );

  const disconnect = useCallback(
    async (sessionId: string) => {
      try {
        const session = useTerminalSessionStore.getState().sessions.find((s) => s.id === sessionId);
        if (session?.serverId === LOCAL_MACHINE_ID) {
          await terminalSessionApi.disconnectLocal(sessionId);
        } else {
          await terminalSessionApi.disconnect(sessionId);
        }
      } catch {
        // Session may have already been removed from backend (e.g. server closed connection)
      }
      releaseChannel(sessionId);
      removeSession(sessionId);
    },
    [removeSession],
  );

  const sendInput = useCallback(
    (sessionId: string, data: Uint8Array) => {
      void terminalSessionApi.sendInput(sessionId, Array.from(data));
    },
    [],
  );

  const resize = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      void terminalSessionApi.resize(sessionId, cols, rows);
    },
    [],
  );

  return { connect, disconnect, sendInput, resize };
}
