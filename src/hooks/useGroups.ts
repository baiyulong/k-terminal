import { useEffect } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { groupApi } from "@/lib/tauri";
import type {
  CreateGroupRequest,
  Group,
  GroupNode,
  ReorderGroupUpdate,
  UpdateGroupRequest,
} from "@/lib/types";
import { useGroupStore } from "@/stores/groupStore";

export const groupsListQueryKey = ["groups"] as const;
export const groupsTreeQueryKey = ["groups", "tree"] as const;

const syncStoreWithGroups = (groups: GroupNode[]) => {
  useGroupStore.getState().setGroups(groups);
};

const invalidateGroupQueries = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: groupsListQueryKey }),
    queryClient.invalidateQueries({ queryKey: groupsTreeQueryKey }),
  ]);
};

export const useGroupsListQuery = () =>
  useQuery({
    queryKey: groupsListQueryKey,
    queryFn: groupApi.list,
  });

export const useGroupTreeQuery = () => {
  const query = useQuery({
    queryKey: groupsTreeQueryKey,
    queryFn: groupApi.getTree,
  });

  useEffect(() => {
    if (!query.isSuccess) {
      return;
    }

    syncStoreWithGroups(query.data);
  }, [query.data, query.isSuccess]);

  return query;
};

export const useGroupQuery = (id: string | null) =>
  useQuery({
    queryKey: [...groupsListQueryKey, id],
    queryFn: () => groupApi.get(id ?? ""),
    enabled: Boolean(id),
  });

export const useCreateGroupMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateGroupRequest) => groupApi.create(request),
    onSuccess: async (group) => {
      useGroupStore.getState().setSelectedGroupId(group.id);
      await invalidateGroupQueries(queryClient);
    },
  });
};

export const useUpdateGroupMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: UpdateGroupRequest;
    }) => groupApi.update(id, changes),
    onSuccess: async (group) => {
      useGroupStore.getState().setSelectedGroupId(group.id);
      await invalidateGroupQueries(queryClient);
    },
  });
};

export const useDeleteGroupMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => groupApi.delete(id),
    onSuccess: async (_, id) => {
      const store = useGroupStore.getState();
      if (store.selectedGroupId === id) {
        store.setSelectedGroupId(null);
      }
      await invalidateGroupQueries(queryClient);
    },
  });
};

export const useMoveGroupMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      newParentId,
    }: {
      id: string;
      newParentId: string | null;
    }) => groupApi.move(id, newParentId),
    onSuccess: async (group) => {
      useGroupStore.getState().setSelectedGroupId(group.id);
      await invalidateGroupQueries(queryClient);
    },
  });
};

export const useReorderGroupsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: ReorderGroupUpdate[]) => groupApi.reorder(updates),
    onSuccess: async (groups: Group[]) => {
      const activeGroupId = useGroupStore.getState().selectedGroupId;
      if (activeGroupId && !groups.some((group) => group.id === activeGroupId)) {
        useGroupStore.getState().setSelectedGroupId(null);
      }
      await invalidateGroupQueries(queryClient);
    },
  });
};
