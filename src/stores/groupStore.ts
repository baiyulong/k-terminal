import { create } from "zustand";
import type { GroupNode } from "@/lib/types";

interface GroupState {
  groups: GroupNode[];
  selectedGroupId: string | null;
  expandedGroupIds: string[];
  setGroups: (groups: GroupNode[]) => void;
  setSelectedGroupId: (groupId: string | null) => void;
  toggleExpandedGroupId: (groupId: string) => void;
  expandGroupId: (groupId: string) => void;
  collapseGroupId: (groupId: string) => void;
  setExpandedGroupIds: (groupIds: string[]) => void;
}

const collectGroupIds = (groups: GroupNode[]): string[] =>
  groups.flatMap((group) => [group.id, ...collectGroupIds(group.children)]);

const dedupeGroupIds = (groupIds: string[]) => Array.from(new Set(groupIds));

export const useGroupStore = create<GroupState>((set) => ({
  groups: [],
  selectedGroupId: null,
  expandedGroupIds: [],
  setGroups: (groups) =>
    set((state) => {
      const validGroupIds = new Set(collectGroupIds(groups));
      const nextExpandedGroupIds = dedupeGroupIds(
        state.expandedGroupIds.filter((groupId) => validGroupIds.has(groupId)),
      );

      return {
        groups,
        selectedGroupId:
          state.selectedGroupId && validGroupIds.has(state.selectedGroupId)
            ? state.selectedGroupId
            : null,
        expandedGroupIds:
          nextExpandedGroupIds.length > 0
            ? nextExpandedGroupIds
            : groups.map((group) => group.id),
      };
    }),
  setSelectedGroupId: (groupId) => set({ selectedGroupId: groupId }),
  toggleExpandedGroupId: (groupId) =>
    set((state) => ({
      expandedGroupIds: state.expandedGroupIds.includes(groupId)
        ? state.expandedGroupIds.filter((currentGroupId) => currentGroupId !== groupId)
        : [...state.expandedGroupIds, groupId],
    })),
  expandGroupId: (groupId) =>
    set((state) => ({
      expandedGroupIds: state.expandedGroupIds.includes(groupId)
        ? state.expandedGroupIds
        : [...state.expandedGroupIds, groupId],
    })),
  collapseGroupId: (groupId) =>
    set((state) => ({
      expandedGroupIds: state.expandedGroupIds.filter(
        (currentGroupId) => currentGroupId !== groupId,
      ),
    })),
  setExpandedGroupIds: (groupIds) =>
    set({ expandedGroupIds: dedupeGroupIds(groupIds) }),
}));
