import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { terminalProfilesQueryKey } from "@/hooks/useTerminalProfiles";
import { groupsListQueryKey, groupsTreeQueryKey } from "@/hooks/useGroups";
import { serversQueryKey } from "@/hooks/useServers";
import { settingsApi, terminalProfileApi } from "@/lib/tauri";
import type { ImportResult } from "@/lib/types";
import { useSettingsStore, TERMINAL_FONT_FAMILIES } from "@/stores/settingsStore";
import { useToast } from "@/components/ui/Toast";

interface SettingsPageProps {
  onNavigateHome: () => void;
}

const sectionClassName =
  "rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm";
const inputClassName =
  "w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20";
const buttonClassName =
  "inline-flex items-center justify-center rounded-xl border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))]";

export function SettingsPage({
  onNavigateHome,
}: SettingsPageProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const terminalFontSize = useSettingsStore((state) => state.terminalFontSize);
  const setTerminalFontSize = useSettingsStore((state) => state.setTerminalFontSize);
  const terminalFontFamily = useSettingsStore((state) => state.terminalFontFamily);
  const setTerminalFontFamily = useSettingsStore((state) => state.setTerminalFontFamily);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(
    null,
  );

  const appInfoQuery = useQuery({
    queryKey: ["app-info"],
    queryFn: settingsApi.getAppInfo,
  });
  const terminalProfilesQuery = useQuery({
    queryKey: terminalProfilesQueryKey,
    queryFn: terminalProfileApi.list,
  });
  const defaultProfile = terminalProfilesQuery.data?.find(
    (profile) => profile.is_default,
  );

  const exportMutation = useMutation({
    mutationFn: settingsApi.exportData,
    onSuccess: (json) => {
      const blob = new Blob([json], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kterminal-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      toast.success("Exported server data.");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const importMutation = useMutation({
    mutationFn: settingsApi.importData,
    onSuccess: async (result) => {
      setLastImportResult(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: serversQueryKey }),
        queryClient.invalidateQueries({ queryKey: groupsListQueryKey }),
        queryClient.invalidateQueries({ queryKey: groupsTreeQueryKey }),
      ]);

      const summary = `Imported ${result.imported}, skipped ${result.skipped}.`;
      if (result.errors.length > 0) {
        toast.error(`${summary} ${result.errors.length} warning(s) recorded.`);
      } else {
        toast.success(summary);
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (profileId: string) => terminalProfileApi.setDefault(profileId),
    onSuccess: async (profile) => {
      await queryClient.invalidateQueries({ queryKey: terminalProfilesQueryKey });
      toast.success(`Default terminal set to ${profile.name}.`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const json = await file.text();
      await importMutation.mutateAsync(json);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-5 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
              Application Settings
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              KTerminal Settings
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNavigateHome}
              className={buttonClassName}
            >
              Home
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))]"
            >
              Settings
            </button>
          </div>
        </header>

        <section className={sectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Appearance</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Choose how KTerminal should follow your preferred color scheme.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,16rem)_1fr] md:items-start">
            <label className="text-sm font-medium" htmlFor="theme-selector">
              Theme
            </label>
            <select
              id="theme-selector"
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as typeof theme)
              }
              className={inputClassName}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Terminal Display</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Customize the font displayed in embedded terminal sessions.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,16rem)_1fr] md:items-center">
            <label className="text-sm font-medium" htmlFor="terminal-font-family">
              Font family
            </label>
            <select
              id="terminal-font-family"
              value={terminalFontFamily}
              onChange={(e) => setTerminalFontFamily(e.target.value as typeof terminalFontFamily)}
              className={inputClassName}
            >
              {TERMINAL_FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            <label className="text-sm font-medium" htmlFor="terminal-font-size">
              Font size
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease font size"
                onClick={() => setTerminalFontSize(terminalFontSize - 1)}
                disabled={terminalFontSize <= 10}
                className={buttonClassName + " px-3"}
              >
                −
              </button>
              <input
                id="terminal-font-size"
                type="number"
                min={10}
                max={24}
                value={terminalFontSize}
                onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                className={inputClassName + " w-20 text-center"}
              />
              <button
                type="button"
                aria-label="Increase font size"
                onClick={() => setTerminalFontSize(terminalFontSize + 1)}
                disabled={terminalFontSize >= 24}
                className={buttonClassName + " px-3"}
              >
                +
              </button>
            </div>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Terminal Profiles</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Pick a default launcher and manage platform-specific terminal presets.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,16rem)_1fr] md:items-start">
            <label
              className="text-sm font-medium"
              htmlFor="default-terminal-profile"
            >
              Default terminal profile
            </label>
            <select
              id="default-terminal-profile"
              value={defaultProfile?.id ?? ""}
              disabled={
                terminalProfilesQuery.isPending || defaultMutation.isPending
              }
              onChange={(event) => {
                if (event.target.value) {
                  void defaultMutation.mutateAsync(event.target.value);
                }
              }}
              className={inputClassName}
            >
              <option value="">
                {terminalProfilesQuery.data?.length
                  ? "Select a terminal profile"
                  : "No terminal profiles available"}
              </option>
              {(terminalProfilesQuery.data ?? []).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} ({profile.platform})
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Import &amp; Export</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Export saved servers as JSON or import a previously exported file.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
                className={buttonClassName}
              >
                {exportMutation.isPending ? "Exporting..." : "Export Data"}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importMutation.isPending}
                className={buttonClassName}
              >
                {importMutation.isPending ? "Importing..." : "Import Data"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImport}
                className="hidden"
              />
            </div>
          </div>

          {lastImportResult ? (
            <div className="mt-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
              <p className="text-sm font-medium">
                Last import: {lastImportResult.imported} imported, {lastImportResult.skipped} skipped.
              </p>
              {lastImportResult.errors.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[hsl(var(--muted-foreground))]">
                  {lastImportResult.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[hsl(var(--border))]">
            <table className="min-w-full divide-y divide-[hsl(var(--border))] text-sm">
              <thead className="bg-[hsl(var(--background))] text-left text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="px-4 py-3 font-medium">Shortcut</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                <ShortcutRow shortcut="Ctrl/Cmd + K" action="Open command palette" />
                <ShortcutRow shortcut="Ctrl/Cmd + N" action="Open new server form" />
                <ShortcutRow shortcut="Enter" action="Connect to selected server" />
              </tbody>
            </table>
          </div>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-lg font-semibold">App Information</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <InfoCard
              label="Version"
              value={appInfoQuery.data?.version}
              fallback={appInfoQuery.isPending ? "Loading..." : "Unavailable"}
            />
            <InfoCard
              label="Config Path"
              value={appInfoQuery.data?.config_path}
              fallback={appInfoQuery.isPending ? "Loading..." : "Unavailable"}
              multiline
            />
            <InfoCard
              label="Database Path"
              value={appInfoQuery.data?.db_path}
              fallback={appInfoQuery.isPending ? "Loading..." : "Unavailable"}
              multiline
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  action,
}: {
  shortcut: string;
  action: string;
}) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))]">
        {shortcut}
      </td>
      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
        {action}
      </td>
    </tr>
  );
}

function InfoCard({
  label,
  value,
  fallback,
  multiline = false,
}: {
  label: string;
  value?: string;
  fallback: string;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
        {label}
      </p>
      <p
        className={[
          "mt-3 text-sm font-medium",
          multiline ? "break-all" : "truncate",
        ].join(" ")}
        title={value ?? fallback}
      >
        {value ?? fallback}
      </p>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Something went wrong while updating settings.";
}
