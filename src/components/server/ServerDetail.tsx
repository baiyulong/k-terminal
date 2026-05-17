import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { copyTextToClipboard } from "@/lib/clipboard";
import { LOCAL_MACHINE_ID, LOCAL_MACHINE_SERVER } from "@/lib/constants";
import { sshApi } from "@/lib/tauri";
import type { Server } from "@/lib/types";

interface ServerDetailProps {
  server: Server | null;
  isDeleting?: boolean;
  isFavoriteUpdating?: boolean;
  onConnect: (server: Server) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
  onToggleFavorite: (server: Server) => void;
}

export function ServerDetail({
  server,
  isDeleting = false,
  isFavoriteUpdating = false,
  onConnect,
  onEdit,
  onDelete,
  onToggleFavorite,
}: ServerDetailProps) {
  const toast = useToast();
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copying" | "copied" | "error"
  >("idle");

  useEffect(() => {
    setCopyStatus("idle");
  }, [server?.id]);

  useEffect(() => {
    if (copyStatus === "idle" || copyStatus === "copying") {
      return;
    }

    const timer = window.setTimeout(() => setCopyStatus("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  if (!server) {
    return (
      <section className="flex flex-1 items-center justify-center bg-[hsl(var(--background))] p-8">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
            Select a server
          </h2>
          <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            Choose a server from the sidebar to inspect connection settings,
            review authentication details, and prepare a connection.
          </p>
        </div>
      </section>
    );
  }

  if (server.id === LOCAL_MACHINE_ID) {
    return (
      <section className="flex flex-1 flex-col overflow-y-auto bg-[hsl(var(--background))]">
        <div className="border-b border-[hsl(var(--border))] px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4 shrink-0"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            >
              <rect x="2" y="3" width="16" height="11" rx="1.5" />
              <path d="M7 17h6M10 14v3" />
            </svg>
            <h2 className="text-3xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              Local Machine
            </h2>
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Native shell session on this machine. No SSH connection required.
          </p>
        </div>
        <div className="px-6 py-6">
          <button
            type="button"
            aria-label="Connect to Local Machine"
            onClick={() => onConnect(LOCAL_MACHINE_SERVER)}
            className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Connect
          </button>
        </div>
      </section>
    );
  }

  const tags = server.tags
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const copyButtonLabel =
    copyStatus === "copied"
      ? "Copied!"
      : copyStatus === "error"
        ? "Copy failed"
        : copyStatus === "copying"
          ? "Copying..."
          : "Copy SSH Command";

  const handleCopyCommand = async () => {
    try {
      setCopyStatus("copying");
      const command = await sshApi.getCommandPreview(server.id);

      await copyTextToClipboard(command);
      setCopyStatus("copied");
      toast.success("SSH command copied.");
    } catch (error) {
      console.error("Failed to copy SSH command", error);
      setCopyStatus("error");
      toast.error("Failed to copy SSH command.");
    }
  };

  return (
    <section className="flex flex-1 flex-col overflow-y-auto bg-[hsl(var(--background))]">
      <div className="border-b border-[hsl(var(--border))] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                {server.name}
              </h2>
              {server.is_favorite ? (
                <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-400">
                  Favorite
                </span>
              ) : null}
              <span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs font-semibold capitalize text-[hsl(var(--secondary-foreground))]">
                {server.auth_type}
              </span>
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {server.username}@{server.host}:{server.port}
            </p>
            {server.description ? (
              <p className="mt-4 max-w-3xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                {server.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onConnect(server)}
                className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Connect
              </button>
              <button
                type="button"
                disabled={copyStatus === "copying"}
                onClick={handleCopyCommand}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copyButtonLabel}
              </button>
              <button
                type="button"
                onClick={() => onEdit(server)}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))]"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={isFavoriteUpdating}
                onClick={() => onToggleFavorite(server)}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {server.is_favorite ? "Unfavorite" : "Favorite"}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => onDelete(server)}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <InfoCard title="Connection">
          <DetailRow label="Host" value={server.host} />
          <DetailRow label="Port" value={String(server.port)} />
          <DetailRow label="Username" value={server.username} />
          <DetailRow label="Encoding" value={server.encoding} />
          <DetailRow label="Jump Host" value={server.jump_host} />
          <DetailRow label="Startup Command" value={server.startup_command} multiline />
          <DetailRow label="Port Forwards" value={server.port_forwards} multiline />
        </InfoCard>

        <InfoCard title="Authentication">
          <DetailRow label="Type" value={server.auth_type} />
          <DetailRow
            label="Password"
            value={server.password ? "Stored securely" : undefined}
          />
          <DetailRow label="Private Key" value={server.private_key_path} />
          <DetailRow
            label="Passphrase"
            value={server.passphrase ? "Configured" : undefined}
          />
          <DetailRow label="Agent Forward" value={server.agent_forward ? "Enabled" : "Disabled"} />
          <DetailRow label="Compression" value={server.compression ? "Enabled" : "Disabled"} />
          <DetailRow label="Keep Alive" value={server.keep_alive ? "Enabled" : "Disabled"} />
        </InfoCard>

        <InfoCard title="Metadata">
          <DetailRow label="Group ID" value={server.group_id} />
          <DetailRow label="Terminal Profile" value={server.terminal_profile_id} />
          <DetailRow label="Created" value={formatDate(server.created_at)} />
          <DetailRow label="Updated" value={formatDate(server.updated_at)} />
          <DetailRow
            label="Last Connected"
            value={formatDate(server.last_connected_at)}
          />
        </InfoCard>

        <InfoCard title="Tags">
          {tags && tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--secondary-foreground))]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No tags assigned.
            </p>
          )}
        </InfoCard>
      </div>
    </section>
  );
}

interface InfoCardProps {
  title: string;
  children: React.ReactNode;
}

function InfoCard({ title, children }: InfoCardProps) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {title}
      </h3>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value?: string | null;
  multiline?: boolean;
}

function DetailRow({ label, value, multiline = false }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-[hsl(var(--background))] px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <span
        className={[
          "text-sm text-[hsl(var(--foreground))]",
          multiline ? "whitespace-pre-wrap break-words" : "truncate",
        ].join(" ")}
        title={value ?? undefined}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
