import { Channel } from "@tauri-apps/api/core";
import type { TerminalChannelMessage } from "./tauri";
import type { SessionStatus } from "@/stores/terminalSessionStore";

type DataHandler = (data: Uint8Array) => void;
type StatusHandler = (sessionId: string, status: SessionStatus, reason?: string) => void;

// Keep channels alive (prevent GC), keyed by sessionId
const channelMap = new Map<string, Channel<TerminalChannelMessage>>();
// Route terminal data to the correct TerminalView, keyed by sessionId
const dataHandlerMap = new Map<string, DataHandler>();

export function createChannel(onStatus: StatusHandler): Channel<TerminalChannelMessage> {
  const channel = new Channel<TerminalChannelMessage>();

  channel.onmessage = (message) => {
    if (message.type === "Status") {
      const { session_id, status, reason } = message.payload;
      onStatus(session_id, status as SessionStatus, reason ?? undefined);
    } else if (message.type === "Data") {
      const { session_id, data } = message.payload;
      dataHandlerMap.get(session_id)?.(new Uint8Array(data));
    }
  };

  return channel;
}

export function storeChannel(sessionId: string, channel: Channel<TerminalChannelMessage>): void {
  channelMap.set(sessionId, channel);
}

export function releaseChannel(sessionId: string): void {
  channelMap.delete(sessionId);
  dataHandlerMap.delete(sessionId);
}

export function registerDataHandler(sessionId: string, handler: DataHandler): void {
  dataHandlerMap.set(sessionId, handler);
}

export function unregisterDataHandler(sessionId: string): void {
  dataHandlerMap.delete(sessionId);
}
