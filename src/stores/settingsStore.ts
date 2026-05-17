import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "kterminal.theme";
const FONT_SIZE_KEY = "kterminal.terminal.fontSize";
const FONT_FAMILY_KEY = "kterminal.terminal.fontFamily";

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

interface SettingsState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalFontFamily: string;
  setTerminalFontFamily: (family: string) => void;
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
}));
