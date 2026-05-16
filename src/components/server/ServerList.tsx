import { useMemo, useState } from "react";
import { ContextMenu, type ContextMenuPosition } from "@/components/ui/ContextMenu";
import type { Server } from "@/lib/types";

interface ServerListProps {
  servers: Server[];
  selectedServerId: string | null;
  isLoading?: boolean;
  searchTerm?: string;
  onSelect: (serverId: string) => void;
  onLaunch: (server: Server) => void;
  onEdit: (server: Server) => void;
  onClone: (server: Server) => void | Promise<void>;
  onCopySshCommand: (server: Server) => void | Promise<void>;
  onDelete: (server: Server) => void | Promise<void>;
  onToggleFavorite: (server: Server) => void | Promise<void>;
}

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

export function ServerList({
  servers,
  selectedServerId,
  isLoading = false,
  searchTerm,
  onSelect,
  onLaunch,
  onEdit,
  onClone,
  onCopySshCommand,
  onDelete,
  onToggleFavorite,
}: ServerListProps) {
  const [contextMenu, setContextMenu] = useState<
    (ContextMenuPosition & { server: Server }) | null
  >(null);

  const sortedServers = useMemo(
    () =>
      [...servers].sort((left, right) => {
        if (left.is_favorite !== right.is_favorite) {
          return left.is_favorite ? -1 : 1;
        }

        return collator.compare(left.name, right.name);
      }),
    [servers],
  );

  if (isLoading) {
    return (
      <div className="px-4 py-6 text-sm text-[hsl(var(--muted-foreground))]">
        Loading servers...
      </div>
    );
  }

  if (sortedServers.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-[hsl(var(--muted-foreground))]">
        {searchTerm
          ? `No servers matched “${searchTerm}”.`
          : "No servers yet. Add your first server to get started."}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-3">
      <ul className="space-y-2">
        {sortedServers.map((server) => {
          const isSelected = server.id === selectedServerId;

          return (
            <li key={server.id}>
              <div
                className={[
                  "group flex items-start gap-2 rounded-xl border p-3 transition",
                  isSelected
                    ? "border-[hsl(var(--ring))] bg-[hsl(var(--accent))]"
                    : "border-transparent hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]",
                ].join(" ")}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelect(server.id);
                  setContextMenu({
                    server,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(server.id)}
                  onDoubleClick={() => {
                    onSelect(server.id);
                    void onLaunch(server);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-[hsl(var(--foreground))]">
                      {server.name}
                    </span>
                    {server.auth_type === "agent" ? (
                      <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--secondary-foreground))]">
                        Agent
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-[hsl(var(--muted-foreground))]">
                    {server.host}:{server.port}
                  </p>
                  <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {server.username}
                  </p>
                </button>

                <button
                  type="button"
                  aria-label={
                    server.is_favorite
                      ? `Remove ${server.name} from favorites`
                      : `Mark ${server.name} as favorite`
                  }
                  onClick={() => {
                    void onToggleFavorite(server);
                  }}
                  className={[
                    "rounded-lg p-2 transition",
                    server.is_favorite
                      ? "text-amber-400"
                      : "text-[hsl(var(--muted-foreground))] hover:text-amber-400",
                  ].join(" ")}
                >
                  <StarIcon filled={server.is_favorite} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ContextMenu
        position={contextMenu}
        onClose={() => setContextMenu(null)}
        items={
          contextMenu
            ? [
                {
                  label: "Connect",
                  icon: <LaunchIcon />,
                  onClick: () => onLaunch(contextMenu.server),
                },
                {
                  label: "Edit",
                  icon: <EditIcon />,
                  onClick: () => onEdit(contextMenu.server),
                },
                {
                  label: "Clone",
                  icon: <CloneIcon />,
                  onClick: () => onClone(contextMenu.server),
                },
                {
                  label: "Copy SSH Command",
                  icon: <CopyIcon />,
                  onClick: () => onCopySshCommand(contextMenu.server),
                },
                {
                  label: "Toggle Favorite",
                  icon: <StarIcon filled={contextMenu.server.is_favorite} />,
                  onClick: () => onToggleFavorite(contextMenu.server),
                },
                {
                  label: "Delete",
                  icon: <DeleteIcon />,
                  divider: true,
                  destructive: true,
                  onClick: () => onDelete(contextMenu.server),
                },
              ]
            : []
        }
      />
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="m10 2.8 2.2 4.45 4.9.72-3.55 3.46.84 4.89L10 14.02l-4.39 2.3.84-4.89L2.9 7.97l4.9-.72L10 2.8Z" />
    </svg>
  );
}

function LaunchIcon() {
  return <MenuGlyph path="M7 6h7v7m0-7-7 7" />;
}

function EditIcon() {
  return <MenuGlyph path="m5 13.5 7.75-7.75 1.5 1.5L6.5 15H5v-1.5Z" />;
}

function CloneIcon() {
  return <MenuGlyph path="M7 7.5h8v8H7z M5 4.5h8" />;
}

function CopyIcon() {
  return <MenuGlyph path="M7 6.5h8v9H7z M5 4.5h8" />;
}

function DeleteIcon() {
  return <MenuGlyph path="M6 6h8m-7 0v8m3-8v8m3-8v8M8 4h4l.5 1.5h2M6 5.5h8" />;
}

function MenuGlyph({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    >
      <path d={path} />
    </svg>
  );
}
