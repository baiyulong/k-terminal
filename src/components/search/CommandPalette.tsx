import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@/hooks/useSearch";
import { groupApi } from "@/lib/tauri";
import type { Group, Server } from "@/lib/types";
import { useServerStore } from "@/stores/serverStore";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setSelectedServerId = useServerStore(
    (state) => state.setSelectedServerId,
  );
  const { query, setQuery, results, isLoading, error, reset } = useSearch();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: groupApi.list,
    enabled: open,
    staleTime: 30_000,
  });
  const groupNames = useMemo(
    () =>
      new Map(
        (groupsQuery.data ?? []).map((group: Group) => [group.id, group.name]),
      ),
    [groupsQuery.data],
  );

  useEffect(() => {
    if (!open) {
      reset();
      setSelectedIndex(0);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open, reset]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, results.length]);

  useEffect(() => {
    if (selectedIndex < results.length) {
      return;
    }

    setSelectedIndex(results.length > 0 ? results.length - 1 : 0);
  }, [results.length, selectedIndex]);

  if (!open) {
    return null;
  }

  const handleClose = () => {
    reset();
    setSelectedIndex(0);
    onClose();
  };

  const handleSelect = (server: Server) => {
    setSelectedServerId(server.id);
    handleClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((currentIndex) =>
        currentIndex >= results.length - 1 ? 0 : currentIndex + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((currentIndex) =>
        currentIndex <= 0 ? results.length - 1 : currentIndex - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selectedServer = results[selectedIndex];
      if (selectedServer) {
        handleSelect(selectedServer);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 py-20 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--card))] shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <div className="border-b border-[hsl(var(--border))] px-4 py-3">
          <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-3">
            <SearchIcon />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search servers by name, host, tags, or description"
              className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
            />
            <span className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
              Esc
            </span>
          </div>
        </div>

        <div className="max-h-[28rem] overflow-y-auto p-2">
          {query.trim().length === 0 ? (
            <PaletteMessage text="Type to quickly jump to a saved server." />
          ) : isLoading ? (
            <PaletteMessage text="Searching servers..." />
          ) : error ? (
            <PaletteMessage text={getErrorMessage(error)} tone="error" />
          ) : results.length === 0 ? (
            <PaletteMessage text={`No servers matched “${query.trim()}”.`} />
          ) : (
            <ul className="space-y-1">
              {results.map((server, index) => {
                const isSelected = index === selectedIndex;

                return (
                  <li key={server.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(server)}
                      className={[
                        "flex w-full items-start justify-between gap-4 rounded-xl px-4 py-3 text-left transition",
                        isSelected
                          ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                          : "hover:bg-[hsl(var(--accent))]/70",
                      ].join(" ")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {server.name}
                        </p>
                        <p className="mt-1 truncate text-sm text-[hsl(var(--muted-foreground))]">
                          {server.host}:{server.port}
                        </p>
                        <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                          {getGroupLabel(server.group_id, groupNames)}
                        </p>
                      </div>
                      <ArrowCornerIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface PaletteMessageProps {
  text: string;
  tone?: "default" | "error";
}

function PaletteMessage({ text, tone = "default" }: PaletteMessageProps) {
  return (
    <div
      className={[
        "px-4 py-8 text-center text-sm",
        tone === "error"
          ? "text-red-400"
          : "text-[hsl(var(--muted-foreground))]",
      ].join(" ")}
    >
      {text}
    </div>
  );
}

function getGroupLabel(
  groupId: string | null | undefined,
  groupNames: Map<string, string>,
) {
  if (!groupId) {
    return "Ungrouped";
  }

  return groupNames.get(groupId) ?? "Ungrouped";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Search failed. Please try again.";
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4 text-[hsl(var(--muted-foreground))]"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 4 4" strokeLinecap="round" />
    </svg>
  );
}

function ArrowCornerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M7 6h7v7" />
      <path d="m7 13 7-7" />
    </svg>
  );
}
