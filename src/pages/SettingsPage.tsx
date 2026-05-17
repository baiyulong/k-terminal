import { useRef, useState, useEffect } from "react";
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
  const proxyType = useSettingsStore((state) => state.proxyType);
  const setProxyType = useSettingsStore((state) => state.setProxyType);
  const proxyHost = useSettingsStore((state) => state.proxyHost);
  const setProxyHost = useSettingsStore((state) => state.setProxyHost);
  const proxyPort = useSettingsStore((state) => state.proxyPort);
  const setProxyPort = useSettingsStore((state) => state.setProxyPort);
  const proxyBypass = useSettingsStore((state) => state.proxyBypass);
  const setProxyBypass = useSettingsStore((state) => state.setProxyBypass);
  const localShell = useSettingsStore((state) => state.localShell);
  const setLocalShell = useSettingsStore((state) => state.setLocalShell);
  const [systemFonts, setSystemFonts] = useState<string[]>([...TERMINAL_FONT_FAMILIES]);

  const isWindows = typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("windows");

  const shellPresets = isWindows
    ? [
        { label: "Auto-detect", value: "" },
        { label: "PowerShell (pwsh)", value: "pwsh" },
        { label: "Windows PowerShell", value: "powershell" },
        { label: "Command Prompt (cmd.exe)", value: "cmd.exe" },
        { label: "Git Bash", value: "C:\\Program Files\\Git\\bin\\bash.exe" },
        { label: "WSL (bash)", value: "wsl.exe" },
        { label: "Custom...", value: "__custom__" },
      ]
    : [
        { label: "Auto-detect", value: "" },
        { label: "Zsh (/bin/zsh)", value: "/bin/zsh" },
        { label: "Bash (/bin/bash)", value: "/bin/bash" },
        { label: "Fish (/usr/bin/fish)", value: "/usr/bin/fish" },
        { label: "Sh (/bin/sh)", value: "/bin/sh" },
        { label: "Custom...", value: "__custom__" },
      ];

  const isCustomShell =
    localShell !== "" &&
    !shellPresets.some((p) => p.value === localShell && p.value !== "__custom__");

  console.log("[k-terminal] SettingsPage render: isWindows=", isWindows, "localShell=", JSON.stringify(localShell));

  // Load system fonts from Rust (fc-list / PowerShell) with JS Font Access API fallback
  useEffect(() => {
    (async () => {
      try {
        const rustFonts = await settingsApi.listSystemFonts();
        if (rustFonts.length > 0) {
          setSystemFonts(rustFonts);
          return;
        }
      } catch {
        // Rust command unavailable
      }
      // Fallback: JS Font Access API (Chromium / Windows WebView2)
      if ("queryLocalFonts" in window) {
        try {
          // @ts-expect-error Font Access API not yet in lib.dom.d.ts
          const fonts: { family: string }[] = await window.queryLocalFonts();
          const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase()),
          );
          if (families.length > 0) {
            setSystemFonts(families);
          }
        } catch {
          // Permission denied or API unavailable
        }
      }
    })();
  }, []);
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
            <div>
              <input
                id="terminal-font-family"
                type="text"
                list="font-family-list"
                value={terminalFontFamily}
                onChange={(e) => setTerminalFontFamily(e.target.value as typeof terminalFontFamily)}
                placeholder="Type to search fonts…"
                className={inputClassName}
              />
              <datalist id="font-family-list">
                {systemFonts.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                {systemFonts.length} fonts available — type to search or select from the list
              </p>
            </div>

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

          {/* Local Shell */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                Local Shell
              </p>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                Shell launched for Local Machine sessions
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex flex-col gap-1 w-56">
                {shellPresets.filter((p) => p.value !== "__custom__").map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      console.log("[k-terminal] Shell button clicked:", JSON.stringify(p.value));
                      setLocalShell(p.value);
                    }}
                    className={[
                      "w-full rounded-xl px-3 py-1.5 text-left text-sm transition",
                      localShell === p.value
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium"
                        : "border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
                    ].join(" ")}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    console.log("[k-terminal] Shell custom button clicked");
                    if (!isCustomShell) setLocalShell("");
                  }}
                  className={[
                    "w-full rounded-xl px-3 py-1.5 text-left text-sm transition",
                    isCustomShell
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium"
                      : "border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
                  ].join(" ")}
                >
                  Custom…
                </button>
              </div>
              {isCustomShell && (
                <input
                  type="text"
                  className={inputClassName + " w-56"}
                  placeholder="C:\path\to\shell.exe or /usr/bin/zsh"
                  value={localShell}
                  onChange={(e) => setLocalShell(e.target.value)}
                />
              )}
            </div>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Proxy</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Route SSH connections through an HTTP CONNECT or SOCKS5 proxy.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,16rem)_1fr] md:items-start">
            <label className="text-sm font-medium" htmlFor="proxy-type">
              Proxy type
            </label>
            <select
              id="proxy-type"
              value={proxyType}
              onChange={(e) => setProxyType(e.target.value as typeof proxyType)}
              className={inputClassName}
            >
              <option value="none">Disabled</option>
              <option value="http">HTTP CONNECT (port 3128, Squid…)</option>
              <option value="socks5">SOCKS5 (port 1080, v2ray, clash…)</option>
            </select>

            <label
              className={[
                "text-sm font-medium",
                proxyType === "none" ? "opacity-40" : "",
              ].join(" ")}
              htmlFor="proxy-host"
            >
              Proxy address
            </label>
            <div className="flex gap-2">
              <input
                id="proxy-host"
                type="text"
                disabled={proxyType === "none"}
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
                placeholder="10.0.0.1"
                className={inputClassName + (proxyType === "none" ? " opacity-40" : "")}
              />
              <input
                id="proxy-port"
                type="number"
                disabled={proxyType === "none"}
                value={proxyPort || ""}
                onChange={(e) => setProxyPort(Number(e.target.value))}
                placeholder="3128"
                min={1}
                max={65535}
                className={
                  inputClassName +
                  " w-28 shrink-0" +
                  (proxyType === "none" ? " opacity-40" : "")
                }
              />
            </div>

            <label
              className={[
                "text-sm font-medium",
                proxyType === "none" ? "opacity-40" : "",
              ].join(" ")}
              htmlFor="proxy-bypass"
            >
              Bypass list
            </label>
            <div>
              <textarea
                id="proxy-bypass"
                disabled={proxyType === "none"}
                value={proxyBypass}
                onChange={(e) => setProxyBypass(e.target.value)}
                rows={4}
                placeholder={"localhost\n127.0.0.1\n10.*\n*.internal.com"}
                className={
                  inputClassName +
                  " resize-y font-mono text-xs" +
                  (proxyType === "none" ? " opacity-40" : "")
                }
              />
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                One rule per line. Supports exact IPs, domains, IP prefix wildcards (10.*), and domain suffixes (*.corp.com).
              </p>
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
