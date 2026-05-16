import { useMemo, useState } from "react";
import {
  ContextMenu,
  type ContextMenuPosition,
} from "@/components/ui/ContextMenu";
import type { GroupNode } from "@/lib/types";

interface GroupTreeProps {
  groups: GroupNode[];
  totalServers: number;
  selectedGroupId: string | null;
  expandedGroupIds: string[];
  isLoading?: boolean;
  onSelectGroup: (groupId: string | null) => void;
  onToggleGroup: (groupId: string) => void;
  onRequestCreate: (parentId: string | null) => void;
  onRequestAddServer: (groupId: string | null) => void;
  onRequestEdit: (group: GroupNode) => void;
  onRequestDelete: (group: GroupNode) => void | Promise<void>;
}

type ContextMenuState =
  | ({ kind: "root" } & ContextMenuPosition)
  | ({ kind: "group"; group: GroupNode } & ContextMenuPosition);

const countServers = (group: GroupNode): number =>
  group.servers.length +
  group.children.reduce((total, childGroup) => total + countServers(childGroup), 0);

const countAllServers = (groups: GroupNode[]) =>
  groups.reduce((total, group) => total + countServers(group), 0);

export function GroupTree({
  groups,
  totalServers,
  selectedGroupId,
  expandedGroupIds,
  isLoading = false,
  onSelectGroup,
  onToggleGroup,
  onRequestCreate,
  onRequestAddServer,
  onRequestEdit,
  onRequestDelete,
}: GroupTreeProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const expandedGroupIdSet = useMemo(
    () => new Set(expandedGroupIds),
    [expandedGroupIds],
  );
  const groupedServerCount = useMemo(() => countAllServers(groups), [groups]);
  const allServerCount = Math.max(totalServers, groupedServerCount);

  const renderGroup = (group: GroupNode, depth = 0) => {
    const hasChildren = group.children.length > 0;
    const isExpanded = expandedGroupIdSet.has(group.id);
    const isSelected = group.id === selectedGroupId;
    const serverCount = countServers(group);

    return (
      <li key={group.id} className="space-y-1">
        <div
          className={[
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
            isSelected
              ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
              : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]",
          ].join(" ")}
          style={{ paddingLeft: `${12 + depth * 18}px` }}
          onContextMenu={(event) => {
            event.preventDefault();
            onSelectGroup(group.id);
            setContextMenu({
              kind: "group",
              group,
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleGroup(group.id);
              }}
              className="rounded p-1 text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--background))]"
            >
              <ChevronIcon expanded={isExpanded} />
            </button>
          ) : (
            <span className="w-6" />
          )}

          <button
            type="button"
            onClick={() => onSelectGroup(group.id)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          >
            <span className="truncate font-medium">{group.name}</span>
            <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--secondary-foreground))]">
              {serverCount}
            </span>
          </button>
        </div>

        {hasChildren && isExpanded ? (
          <ul className="space-y-1">
            {group.children.map((childGroup) => renderGroup(childGroup, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <section className="border-b border-[hsl(var(--border))] px-2 py-3">
      <div className="mb-2 flex items-center justify-between px-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
            Groups
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Organize servers into nested collections.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRequestCreate(null)}
          className="rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))]"
        >
          Add Group
        </button>
      </div>

      <ul className="space-y-1">
        <li>
          <div
            className={[
              "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition",
              selectedGroupId === null
                ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]",
            ].join(" ")}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ kind: "root", x: event.clientX, y: event.clientY });
            }}
          >
            <button
              type="button"
              onClick={() => onSelectGroup(null)}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            >
              <span className="truncate font-medium">All Servers</span>
              <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--secondary-foreground))]">
                {allServerCount}
              </span>
            </button>
          </div>
        </li>

        {groups.map((group) => renderGroup(group))}
      </ul>

      {isLoading ? (
        <p className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))]">
          Loading groups...
        </p>
      ) : null}

      {!isLoading && groups.length === 0 ? (
        <p className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))]">
          No groups yet. Add one to organize related servers.
        </p>
      ) : null}

      <ContextMenu
        position={contextMenu}
        onClose={() => setContextMenu(null)}
        items={
          contextMenu?.kind === "root"
            ? [
                {
                  label: "Add Group",
                  icon: <FolderPlusIcon />,
                  onClick: () => onRequestCreate(null),
                },
              ]
            : contextMenu
              ? [
                  {
                    label: "Add Server to Group",
                    icon: <ServerPlusIcon />,
                    onClick: () => onRequestAddServer(contextMenu.group.id),
                  },
                  {
                    label: "Add Sub-group",
                    icon: <FolderPlusIcon />,
                    onClick: () => onRequestCreate(contextMenu.group.id),
                  },
                  {
                    label: "Rename",
                    icon: <EditIcon />,
                    onClick: () => onRequestEdit(contextMenu.group),
                  },
                  {
                    label: "Delete",
                    icon: <DeleteIcon />,
                    divider: true,
                    destructive: true,
                    onClick: () => onRequestDelete(contextMenu.group),
                  },
                ]
              : []
        }
      />
    </section>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={[
        "h-4 w-4 transition-transform",
        expanded ? "rotate-90" : "rotate-0",
      ].join(" ")}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="m7 5 6 5-6 5" />
    </svg>
  );
}

function FolderPlusIcon() {
  return <MenuGlyph path="M3.5 6.5h4l1.5 1.5h7v7.5H3.5z M10 10v4 M8 12h4" />;
}

function ServerPlusIcon() {
  return <MenuGlyph path="M4.5 7h8v6h-8z M14.5 8.5v5 M17 11h-5" />;
}

function EditIcon() {
  return <MenuGlyph path="m5 13.5 7.75-7.75 1.5 1.5L6.5 15H5v-1.5Z" />;
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
