import { useEffect, useRef } from "react";

interface ToolbarProps {
  searchTerm: string;
  isSearchOpen: boolean;
  selectedServerName?: string;
  onSearchChange: (value: string) => void;
  onSearchToggle: () => void;
  onAddServer: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({
  searchTerm,
  isSearchOpen,
  selectedServerName,
  onSearchChange,
  onSearchToggle,
  onAddServer,
  onOpenSettings,
}: ToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-4">
      <div>
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
          Server Management
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
          {selectedServerName ?? "KTerminal"}
        </h1>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        {isSearchOpen ? (
          <input
            ref={searchInputRef}
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name, host, user, tags..."
            className="w-full max-w-sm rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
          />
        ) : null}

        <button
          type="button"
          onClick={onSearchToggle}
          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))]"
        >
          <SearchIcon />
          {isSearchOpen ? "Hide Search" : "Search"}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))]"
          aria-label="Open settings"
        >
          <GearIcon />
          Settings
        </button>

        <button
          type="button"
          onClick={onAddServer}
          className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90"
        >
          <PlusIcon />
          Add Server
        </button>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 4 4" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M10 3.5v2.25" />
      <path d="M10 14.25v2.25" />
      <path d="m5.4 5.4 1.6 1.6" />
      <path d="m13 13 1.6 1.6" />
      <path d="M3.5 10h2.25" />
      <path d="M14.25 10h2.25" />
      <path d="m5.4 14.6 1.6-1.6" />
      <path d="m13 7 1.6-1.6" />
      <circle cx="10" cy="10" r="2.75" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}
