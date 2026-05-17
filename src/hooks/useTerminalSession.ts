import { useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { terminalSessionApi } from "@/lib/tauri";
import {
  useTerminalSessionStore,
  type SessionStatus,
} from "@/stores/terminalSessionStore";

interface TerminalDataPayload {
  session_id: string;
  data: number[];
}

interface TerminalStatusPayload {
  session_id: string;
  status: SessionStatus;
  reason?: string;
}

/**
 * Subscribe to terminal:data events for a single session.
 * Returns a cleanup function.
 */
export function useTerminalDataListener(
  sessionId: string | null,
  onData: (data: Uint8Array) => void,
) {
  useEffect(() => {
    if (!sessionId) return;

    let unlisten: (() => void) | undefined;

    listen<TerminalDataPayload>("terminal:data", (event) => {
      if (event.payload.session_id === sessionId) {
        onData(new Uint8Array(event.payload.data));
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [sessionId, onData]);
}

/**
 * Global status listener — updates the store for ALL sessions.
 * Mount once at the app root (TerminalPage).
 */
export function useTerminalStatusListener() {
  const updateSessionStatus = useTerminalSessionStore(
    (state) => state.updateSessionStatus,
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<TerminalStatusPayload>("terminal:status", (event) => {
      const { session_id, status, reason } = event.payload;
      updateSessionStatus(session_id, status, reason);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [updateSessionStatus]);
}

/**
 * Returns helpers for connecting to / disconnecting from a server.
 */
export function useTerminalActions() {
  const addSession = useTerminalSessionStore((state) => state.addSession);
  const removeSession = useTerminalSessionStore((state) => state.removeSession);

  const connect = useCallback(
    async (serverId: string, serverName: string) => {
      const sessionId = await terminalSessionApi.connect(serverId);
      addSession({
        id: sessionId,
        serverId,
        serverName,
        status: "connecting",
      });
      return sessionId;
    },
    [addSession],
  );

  const disconnect = useCallback(
    async (sessionId: string) => {
      await terminalSessionApi.disconnect(sessionId);
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
