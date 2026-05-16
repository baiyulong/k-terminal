import { useEffect, useMemo, useState } from "react";
import type { GroupNode } from "@/lib/types";

interface GroupFormValues {
  name: string;
  parent_id: string;
}

interface GroupFormProps {
  open: boolean;
  group?: Pick<GroupNode, "id" | "name" | "parent_id" | "children"> | null;
  initialParentId?: string | null;
  groups: GroupNode[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; parent_id: string | null }) =>
    | void
    | Promise<void>;
}

const inputClassName =
  "w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20";

const collectDescendantIds = (groups: GroupNode[]): string[] =>
  groups.flatMap((group) => [group.id, ...collectDescendantIds(group.children)]);

const flattenGroupOptions = (
  groups: GroupNode[],
  excludedGroupIds: Set<string>,
  depth = 0,
): Array<{ id: string; label: string }> =>
  groups.flatMap((group) => {
    if (excludedGroupIds.has(group.id)) {
      return [];
    }

    return [
      {
        id: group.id,
        label: `${"— ".repeat(depth)}${group.name}`,
      },
      ...flattenGroupOptions(group.children, excludedGroupIds, depth + 1),
    ];
  });

const getInitialValues = (
  group?: Pick<GroupNode, "name" | "parent_id"> | null,
  initialParentId?: string | null,
): GroupFormValues => ({
  name: group?.name ?? "",
  parent_id: group?.parent_id ?? initialParentId ?? "",
});

export function GroupForm({
  open,
  group,
  initialParentId = null,
  groups,
  isSubmitting = false,
  onClose,
  onSubmit,
}: GroupFormProps) {
  const initialValues = useMemo(
    () => getInitialValues(group, initialParentId),
    [group, initialParentId],
  );
  const [formValues, setFormValues] = useState<GroupFormValues>(initialValues);

  const excludedGroupIds = useMemo(() => {
    if (!group) {
      return new Set<string>();
    }

    return new Set([group.id, ...collectDescendantIds(group.children)]);
  }, [group]);

  const groupOptions = useMemo(
    () => flattenGroupOptions(groups, excludedGroupIds),
    [excludedGroupIds, groups],
  );

  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!open) {
    return null;
  }

  const title = group ? "Edit Group" : "Create Group";
  const description = group
    ? "Rename the group or move it under a different parent."
    : "Create a new group to organize related servers in the sidebar.";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      name: formValues.name.trim(),
      parent_id: formValues.parent_id || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
              {title}
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {description}
            </p>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <fieldset disabled={isSubmitting} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="group-name">
                Name
              </label>
              <input
                id="group-name"
                required
                autoFocus
                type="text"
                value={formValues.name}
                onChange={(event) =>
                  setFormValues((currentValues) => ({
                    ...currentValues,
                    name: event.target.value,
                  }))
                }
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="group-parent">
                Parent Group
              </label>
              <select
                id="group-parent"
                value={formValues.parent_id}
                onChange={(event) =>
                  setFormValues((currentValues) => ({
                    ...currentValues,
                    parent_id: event.target.value,
                  }))
                }
                className={inputClassName}
              >
                <option value="">No parent (top level)</option>
                {groupOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <div className="flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] pt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[hsl(var(--primary))] px-5 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : group ? "Save Group" : "Create Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
