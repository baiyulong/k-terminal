import { useCallback, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalActions } from "@/hooks/useTerminalSession";
import { registerDataHandler, unregisterDataHandler } from "@/lib/terminalChannels";
import { useTerminalSessionStore } from "@/stores/terminalSessionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { copyTextToClipboard } from "@/lib/clipboard";

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
      // Allow Ctrl+C/V to be intercepted by customKeyEventHandler below
      // instead of sending raw control codes
      macOptionIsMeta: false,
    });

    // Ctrl+C: copy selection (don't send ^C to shell when text is selected)
    // Ctrl+V: return false to suppress xterm's keydown handling;
    //         actual paste is handled by the capture-phase paste listener below
    terminal.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== "keydown" || !ev.ctrlKey) return true;

      if (ev.key === "c" && terminal.hasSelection()) {
        copyTextToClipboard(terminal.getSelection()).catch(() => {});
        return false;
      }

      if (ev.key === "v") {
        // Don't call terminal.paste() here — the browser will fire a `paste`
        // event that we intercept below. Returning false only suppresses the
        // raw ^V from being sent to the shell.
        return false;
      }

      return true;
    });

    // Intercept paste events in capture phase so we handle them before xterm's
    // internal textarea listener. This prevents the double-paste that would
    // otherwise occur (once from our handler, once from xterm's native paste).
    // Guard: only handle if this terminal's container contains the focused element,
    // so that multiple mounted tabs don't all receive the same paste.
    const handlePaste = (e: ClipboardEvent) => {
      if (!container.contains(document.activeElement)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      sendInput(sessionId, new TextEncoder().encode(text));
    };
    document.addEventListener("paste", handlePaste, true);

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    // OSC 52 clipboard write handler — used by TUI apps (Copilot CLI, vim, tmux…)
    // xterm.js v6 has no built-in OSC 52 support, so we register our own.
    // Format: \e]52;Pc;Pd\07  where Pd is base64-encoded UTF-8 text.
    const osc52 = terminal.parser.registerOscHandler(52, (data: string) => {
      const semi = data.indexOf(";");
      if (semi === -1) return false;
      const b64 = data.slice(semi + 1);
      if (!b64 || b64 === "?") return false; // read request — ignore
      try {
        // Use TextDecoder for proper UTF-8 (handles CJK characters)
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const text = new TextDecoder().decode(bytes);
        copyTextToClipboard(text).catch(() => {});
      } catch {
        // Malformed base64 — ignore
      }
      return true;
    });

    // Re-fit after fonts load: web fonts may not be ready at open() time,
    // causing wrong charWidth → too many columns → text overflows right edge
    // and IME candidate window appears at wrong position initially.
    document.fonts.ready.then(() => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
      }
    });

    // Prevent browser auto-scroll from causing horizontal jitter during IME composition.
    // CSS overflow:hidden still allows programmatic scroll (unlike overflow:clip);
    // when the IME activates the helper textarea the browser can scroll the container.
    // Resetting scrollLeft to 0 on every scroll event eliminates the jitter.
    const xtermEl = container.querySelector(".xterm") as HTMLElement | null;
    const resetContainerScroll = () => { container.scrollLeft = 0; };
    const resetXtermScroll = () => { if (xtermEl) xtermEl.scrollLeft = 0; };
    container.addEventListener("scroll", resetContainerScroll, { passive: true });
    if (xtermEl) xtermEl.addEventListener("scroll", resetXtermScroll, { passive: true });

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
      osc52.dispose();
      container.removeEventListener("scroll", resetContainerScroll);
      xtermEl?.removeEventListener("scroll", resetXtermScroll);
      document.removeEventListener("paste", handlePaste, true);
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
