import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "kterminal.theme";
const FONT_SIZE_KEY = "kterminal.terminal.fontSize";
const FONT_FAMILY_KEY = "kterminal.terminal.fontFamily";

const PROXY_TYPE_KEY = "kterminal.proxy.type";
const PROXY_HOST_KEY = "kterminal.proxy.host";
const PROXY_PORT_KEY = "kterminal.proxy.port";
const PROXY_BYPASS_KEY = "kterminal.proxy.bypass";

const LOCAL_SHELL_KEY = "kterminal.local.shell";

const readStoredLocalShell = (): string =>
  (typeof window !== "undefined" && window.localStorage.getItem(LOCAL_SHELL_KEY)) || "";

export const TERMINAL_FONT_FAMILIES = [
  "Cascadia Code",
  "Fira Code",
  "JetBrains Mono",
  "Consolas",
  "Courier New",
  "monospace",
] as const;

export type TerminalFontFamily = string;

const isThemePreference = (value: string): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

const readStoredTheme = (): ThemePreference => {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && isThemePreference(v) ? v : "system";
};

const readStoredFontSize = (): number => {
  if (typeof window === "undefined") return 13;
  const v = Number(window.localStorage.getItem(FONT_SIZE_KEY));
  return v >= 10 && v <= 24 ? v : 13;
};

const readStoredFontFamily = (): string => {
  if (typeof window === "undefined") return "Cascadia Code";
  return window.localStorage.getItem(FONT_FAMILY_KEY) ?? "Cascadia Code";
};

const readStoredProxyType = (): "none" | "http" | "socks5" => {
  const v = typeof window !== "undefined" ? window.localStorage.getItem(PROXY_TYPE_KEY) : null;
  return (v === "http" || v === "socks5") ? v : "none";
};

const readStoredProxyHost = (): string =>
  (typeof window !== "undefined" && window.localStorage.getItem(PROXY_HOST_KEY)) || "";

const readStoredProxyPort = (): number => {
  const v = Number(typeof window !== "undefined" ? window.localStorage.getItem(PROXY_PORT_KEY) : "0");
  return v > 0 ? v : 0;
};

const readStoredProxyBypass = (): string =>
  (typeof window !== "undefined" && window.localStorage.getItem(PROXY_BYPASS_KEY)) ||
  "localhost\n127.0.0.1\n::1";

interface SettingsState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalFontFamily: string;
  setTerminalFontFamily: (family: string) => void;
  proxyType: "none" | "http" | "socks5";
  setProxyType: (type: "none" | "http" | "socks5") => void;
  proxyHost: string;
  setProxyHost: (host: string) => void;
  proxyPort: number;
  setProxyPort: (port: number) => void;
  proxyBypass: string;
  setProxyBypass: (bypass: string) => void;
  localShell: string;
  setLocalShell: (shell: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
    set({ theme });
  },

  terminalFontSize: readStoredFontSize(),
  setTerminalFontSize: (size) => {
    const clamped = Math.min(24, Math.max(10, size));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FONT_SIZE_KEY, String(clamped));
    }
    set({ terminalFontSize: clamped });
  },

  terminalFontFamily: readStoredFontFamily(),
  setTerminalFontFamily: (family) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FONT_FAMILY_KEY, family);
    }
    set({ terminalFontFamily: family });
  },

  proxyType: readStoredProxyType(),
  setProxyType: (type) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_TYPE_KEY, type);
    set({ proxyType: type });
  },

  proxyHost: readStoredProxyHost(),
  setProxyHost: (host) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_HOST_KEY, host);
    set({ proxyHost: host });
  },

  proxyPort: readStoredProxyPort(),
  setProxyPort: (port) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_PORT_KEY, String(port));
    set({ proxyPort: port });
  },

  proxyBypass: readStoredProxyBypass(),
  setProxyBypass: (bypass) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_BYPASS_KEY, bypass);
    set({ proxyBypass: bypass });
  },

  localShell: readStoredLocalShell(),
  setLocalShell: (shell) => {
    if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_SHELL_KEY, shell);
    set({ localShell: shell });
  },
}));
