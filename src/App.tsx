import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CommandPalette } from "@/components/search/CommandPalette";
import { ToastViewport } from "@/components/ui/Toast";
import { SettingsPage } from "@/pages/SettingsPage";
import { TerminalPage } from "@/components/terminal/TerminalPage";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTerminalSessionStore } from "@/stores/terminalSessionStore";

type AppPage = "home" | "settings" | "terminal";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
};

function App() {
  const theme = useSettingsStore((state) => state.theme);
  const [page, setPage] = useState<AppPage>("home");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [newServerShortcutSignal, setNewServerShortcutSignal] = useState(0);
  const [connectShortcutSignal, setConnectShortcutSignal] = useState(0);

  const sessions = useTerminalSessionStore((state) => state.sessions);

  // Auto-navigate to terminal page when first session is created
  useEffect(() => {
    if (sessions.length > 0 && page === "home") {
      setPage("terminal");
    }
    if (sessions.length === 0 && page === "terminal") {
      setPage("home");
    }
  }, [sessions.length, page]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const shouldUseDarkTheme =
        theme === "dark" || (theme === "system" && mediaQuery.matches);
      document.documentElement.classList.toggle("dark", shouldUseDarkTheme);
    };

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPage("home");
        setIsCommandPaletteOpen(true);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        if (page !== "home") {
          return;
        }

        event.preventDefault();
        setNewServerShortcutSignal((value) => value + 1);
        return;
      }

      if (
        event.key === "Enter" &&
        page === "home" &&
        !isCommandPaletteOpen &&
        !isEditableTarget(event.target)
      ) {
        setConnectShortcutSignal((value) => value + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, page]);

  return (
    <>
      {page === "home" ? (
        <MainLayout
          onOpenSettings={() => setPage("settings")}
          onNavigateToTerminal={() => setPage("terminal")}
          newServerShortcutSignal={newServerShortcutSignal}
          connectShortcutSignal={connectShortcutSignal}
        />
      ) : page === "settings" ? (
        <SettingsPage
          onNavigateHome={() => setPage("home")}
          onOpenTerminalProfiles={() => {}}
        />
      ) : (
        <TerminalPage onOpenSettings={() => setPage("settings")} />
      )}

      <CommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
      <ToastViewport />
    </>
  );
}

export default App;
