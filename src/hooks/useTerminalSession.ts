import { useCallback } from "react";
import { terminalSessionApi } from "@/lib/tauri";
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
      const channel = createChannel((sessionId, status, reason) => {
        updateSessionStatus(sessionId, status, reason);
      });
      const sessionId = await terminalSessionApi.connect(serverId, channel);
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
        await terminalSessionApi.disconnect(sessionId);
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
