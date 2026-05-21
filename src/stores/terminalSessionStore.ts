import { create } from "zustand";

export type SessionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  status: SessionStatus;
  errorReason?: string;
}

interface TerminalSessionStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;

  addSession: (session: TerminalSession) => void;
  removeSession: (sessionId: string) => void;
  updateSessionStatus: (
    sessionId: string,
    status: SessionStatus,
    reason?: string,
  ) => void;
  setActiveSession: (sessionId: string | null) => void;
  reorderSessions: (fromIndex: number, toIndex: number) => void;
}

export const useTerminalSessionStore = create<TerminalSessionStore>((set) => ({
  sessions: [],
  activeSessionId: null,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    })),

  removeSession: (sessionId) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      const wasActive = state.activeSessionId === sessionId;
      const newActive = wasActive
        ? (remaining[remaining.length - 1]?.id ?? null)
        : state.activeSessionId;
      return { sessions: remaining, activeSessionId: newActive };
    }),

  updateSessionStatus: (sessionId, status, reason) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status, errorReason: reason } : s,
      ),
    })),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  reorderSessions: (fromIndex, toIndex) =>
    set((state) => {
      const sessions = [...state.sessions];
      const [moved] = sessions.splice(fromIndex, 1);
      sessions.splice(toIndex, 0, moved);
      return { sessions };
    }),
}));
