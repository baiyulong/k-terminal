import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalActions } from "@/hooks/useTerminalSession";
import { registerDataHandler, unregisterDataHandler } from "@/lib/terminalChannels";
import { useTerminalSessionStore } from "@/stores/terminalSessionStore";
import { useSettingsStore } from "@/stores/settingsStore";

interface TerminalViewProps {
  sessionId: string;
  isActive: boolean;
}

export function TerminalView({ sessionId, isActive }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const session = useTerminalSessionStore((state) =>
    state.sessions.find((s) => s.id === sessionId),
  );
  const { sendInput, resize } = useTerminalActions();
  const fontFamily = useSettingsStore((state) => state.terminalFontFamily);
  const fontSize = useSettingsStore((state) => state.terminalFontSize);

  // Create xterm instance on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
        selectionBackground: "#264f78",
        black: "#0d1117",
        brightBlack: "#6e7681",
        red: "#ff7b72",
        brightRed: "#ffa198",
        green: "#3fb950",
        brightGreen: "#56d364",
        yellow: "#d29922",
        brightYellow: "#e3b341",
        blue: "#58a6ff",
        brightBlue: "#79c0ff",
        magenta: "#bc8cff",
        brightMagenta: "#d2a8ff",
        cyan: "#76e3ea",
        brightCyan: "#b3deef",
        white: "#b1bac4",
        brightWhite: "#f0f6fc",
      },
      fontFamily,
      fontSize,
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Route keyboard input → backend
    const inputDispose = terminal.onData((data) => {
      sendInput(sessionId, new TextEncoder().encode(data));
    });

    // Route binary input (e.g. function keys) → backend
    const binaryDispose = terminal.onBinary((data) => {
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i) & 0xff;
      }
      sendInput(sessionId, bytes);
    });

    return () => {
      inputDispose.dispose();
      binaryDispose.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, sendInput]);

  // Fit and sync PTY size when the tab becomes active
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;
      if (!fitAddon || !terminal) return;
      fitAddon.fit();
      resize(sessionId, terminal.cols, terminal.rows);
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, sessionId, resize]);

  // Sync PTY size the moment the SSH session transitions to "connected".
  // This is the authoritative resize — it fires AFTER the Rust session is
  // registered in the manager, so send_resize will actually succeed.
  // All earlier resize attempts (ResizeObserver, isActive) race against the
  // TCP/auth handshake and are silently dropped on the Rust side.
  useEffect(() => {
    if (session?.status !== "connected") return;
    const raf = requestAnimationFrame(() => {
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;
      if (!fitAddon || !terminal) return;
      fitAddon.fit();
      resize(sessionId, terminal.cols, terminal.rows);
    });
    return () => cancelAnimationFrame(raf);
  }, [session?.status, sessionId, resize]);

  // Resize observer → PTY resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;
      if (!fitAddon || !terminal) return;
      fitAddon.fit();
      resize(sessionId, terminal.cols, terminal.rows);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [sessionId, resize]);

  // Receive terminal data from SSH server
  const handleData = useCallback((data: Uint8Array) => {
    terminalRef.current?.write(data);
  }, []);

  useEffect(() => {
    registerDataHandler(sessionId, handleData);
    return () => unregisterDataHandler(sessionId);
  }, [sessionId, handleData]);

  // Apply font changes live without remounting the terminal
  useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal) return;
    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = fontSize;
    fitAddon?.fit();
  }, [fontFamily, fontSize]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d1117]">
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden bg-[#0d1117]"
      />
      {(session?.status === "error" || session?.status === "disconnected") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0d1117]/90">
          <span className="text-sm font-semibold text-red-400">
            {session.status === "error" ? "Connection failed" : "Disconnected"}
          </span>
          {session.errorReason && (
            <span className="max-w-sm text-center text-xs text-[#8b949e]">
              {session.errorReason}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
