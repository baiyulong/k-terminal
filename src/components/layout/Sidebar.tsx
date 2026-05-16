import { useState } from "react";
import type { ReactNode } from "react";
import { GroupForm } from "@/components/group/GroupForm";
import { GroupTree } from "@/components/group/GroupTree";
import {
  useCreateGroupMutation,
  useDeleteGroupMutation,
  useGroupTreeQuery,
  useUpdateGroupMutation,
} from "@/hooks/useGroups";
import type { GroupNode } from "@/lib/types";
import { useGroupStore } from "@/stores/groupStore";

interface SidebarProps {
  children: ReactNode;
  totalServers: number;
  onAddServerToGroup: (groupId: string | null) => void;
}

type GroupFormState =
  | {
      mode: "create";
      parentId: string | null;
    }
  | {
      mode: "edit";
      group: GroupNode;
    }
  | null;

const countChildGroups = (group: GroupNode): number =>
  group.children.length +
  group.children.reduce(
    (total, childGroup) => total + countChildGroups(childGroup),
    0,
  );

const countServers = (group: GroupNode): number =>
  group.servers.length +
  group.children.reduce((total, childGroup) => total + countServers(childGroup), 0);

const getErrorMessage = (error: unknown) => {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while processing group data.";
};

export function Sidebar({
  children,
  totalServers,
  onAddServerToGroup,
}: SidebarProps) {
  const groupsQuery = useGroupTreeQuery();
  const groups = useGroupStore((state) => state.groups);
  const selectedGroupId = useGroupStore((state) => state.selectedGroupId);
  const expandedGroupIds = useGroupStore((state) => state.expandedGroupIds);
  const setSelectedGroupId = useGroupStore((state) => state.setSelectedGroupId);
  const toggleExpandedGroupId = useGroupStore(
    (state) => state.toggleExpandedGroupId,
  );
  const expandGroupId = useGroupStore((state) => state.expandGroupId);

  const createGroupMutation = useCreateGroupMutation();
  const updateGroupMutation = useUpdateGroupMutation();
  const deleteGroupMutation = useDeleteGroupMutation();

  const [formState, setFormState] = useState<GroupFormState>(null);

  const closeForm = () => setFormState(null);

  const handleDeleteGroup = async (group: GroupNode) => {
    const childGroupCount = countChildGroups(group);
    const serverCount = countServers(group);
    const confirmationMessage = [
      `Delete the group “${group.name}”?`,
      childGroupCount > 0
        ? `${childGroupCount} sub-group${childGroupCount === 1 ? "" : "s"} will also be removed.`
        : null,
      serverCount > 0
        ? `${serverCount} server${serverCount === 1 ? " will be unassigned from this group." : "s will be unassigned from these groups."}`
        : null,
      "This cannot be undone.",
    ]
      .filter(Boolean)
      .join(" ");

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    await deleteGroupMutation.mutateAsync(group.id);
  };

  const handleSubmit = async ({
    name,
    parent_id,
  }: {
    name: string;
    parent_id: string | null;
  }) => {
    if (formState?.mode === "edit") {
      await updateGroupMutation.mutateAsync({
        id: formState.group.id,
        changes: {
          name,
          parent_id,
        },
      });
    } else if (formState?.mode === "create") {
      if (formState.parentId) {
        expandGroupId(formState.parentId);
      }

      await createGroupMutation.mutateAsync({
        name,
        parent_id,
      });
    }

    closeForm();
  };

  const errorMessage = groupsQuery.error
    ? getErrorMessage(groupsQuery.error)
    : createGroupMutation.error
      ? getErrorMessage(createGroupMutation.error)
      : updateGroupMutation.error
        ? getErrorMessage(updateGroupMutation.error)
        : deleteGroupMutation.error
          ? getErrorMessage(deleteGroupMutation.error)
          : null;

  const isSubmitting =
    createGroupMutation.isPending || updateGroupMutation.isPending;

  return (
    <aside className="flex h-full w-[22rem] min-w-[18rem] flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--border))] px-4 py-4">
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
          Saved Servers
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
            {totalServers}
          </h2>
          <span className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
            total
          </span>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {errorMessage}
        </div>
      ) : null}

      <GroupTree
        groups={groups}
        totalServers={totalServers}
        selectedGroupId={selectedGroupId}
        expandedGroupIds={expandedGroupIds}
        isLoading={groupsQuery.isPending && groups.length === 0}
        onSelectGroup={setSelectedGroupId}
        onToggleGroup={toggleExpandedGroupId}
        onRequestCreate={(parentId) => setFormState({ mode: "create", parentId })}
        onRequestAddServer={onAddServerToGroup}
        onRequestEdit={(group) => setFormState({ mode: "edit", group })}
        onRequestDelete={handleDeleteGroup}
      />

      <div className="min-h-0 flex-1">{children}</div>

      <GroupForm
        open={formState !== null}
        group={formState?.mode === "edit" ? formState.group : null}
        initialParentId={formState?.mode === "create" ? formState.parentId : null}
        groups={groups}
        isSubmitting={isSubmitting}
        onClose={closeForm}
        onSubmit={handleSubmit}
      />
    </aside>
  );
}
