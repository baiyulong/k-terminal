import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { CommandPalette } from "@/components/search/CommandPalette";
import { ToastViewport } from "@/components/ui/Toast";
import { SettingsPage } from "@/pages/SettingsPage";
import { TerminalProfilesPage } from "@/pages/TerminalProfilesPage";
import { useSettingsStore } from "@/stores/settingsStore";

type AppPage = "home" | "settings" | "terminal-profiles";

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
          newServerShortcutSignal={newServerShortcutSignal}
          connectShortcutSignal={connectShortcutSignal}
        />
      ) : page === "settings" ? (
        <SettingsPage
          onNavigateHome={() => setPage("home")}
          onOpenTerminalProfiles={() => setPage("terminal-profiles")}
        />
      ) : (
        <TerminalProfilesPage
          onBack={() => setPage("settings")}
          onNavigateHome={() => setPage("home")}
        />
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
