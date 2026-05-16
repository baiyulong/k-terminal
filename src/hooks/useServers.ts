import { useEffect } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { groupsTreeQueryKey } from "@/hooks/useGroups";
import { serverApi } from "@/lib/tauri";
import type {
  CreateServerRequest,
  Server,
  UpdateServerRequest,
} from "@/lib/types";
import { useServerStore } from "@/stores/serverStore";

export const serversQueryKey = ["servers"] as const;

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

const sortServersByName = (servers: Server[]) =>
  [...servers].sort((left, right) => collator.compare(left.name, right.name));

const syncStoreWithServers = (servers: Server[]) => {
  const store = useServerStore.getState();
  store.setServers(servers);

  if (servers.length === 0) {
    store.setSelectedServerId(null);
    return;
  }

  const hasSelectedServer = store.selectedServerId
    ? servers.some((server) => server.id === store.selectedServerId)
    : false;

  if (!hasSelectedServer) {
    store.setSelectedServerId(servers[0].id);
  }
};

const updateServersCache = (
  queryClient: QueryClient,
  updater: (servers: Server[]) => Server[],
) => {
  queryClient.setQueryData<Server[]>(serversQueryKey, (currentServers) => {
    const nextServers = updater(currentServers ?? []);
    syncStoreWithServers(nextServers);
    return nextServers;
  });
};

const invalidateGroupTreeCache = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries({ queryKey: groupsTreeQueryKey });
};

export const useServersQuery = () => {
  const query = useQuery({
    queryKey: serversQueryKey,
    queryFn: serverApi.list,
  });

  useEffect(() => {
    if (!query.isSuccess) {
      return;
    }

    syncStoreWithServers(sortServersByName(query.data));
  }, [query.data, query.isSuccess]);

  return query;
};

export const useCreateServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateServerRequest) => serverApi.create(request),
    onSuccess: async (server) => {
      updateServersCache(queryClient, (servers) =>
        sortServersByName([...servers, server]),
      );
      useServerStore.getState().setSelectedServerId(server.id);
      await invalidateGroupTreeCache(queryClient);
    },
  });
};

export const useUpdateServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: UpdateServerRequest;
    }) => serverApi.update(id, changes),
    onSuccess: async (server) => {
      updateServersCache(queryClient, (servers) =>
        sortServersByName(
          servers.map((currentServer) =>
            currentServer.id === server.id ? server : currentServer,
          ),
        ),
      );
      await invalidateGroupTreeCache(queryClient);
    },
  });
};

export const useCloneServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serverApi.clone(id),
    onSuccess: async (server) => {
      updateServersCache(queryClient, (servers) =>
        sortServersByName([...servers, server]),
      );
      useServerStore.getState().setSelectedServerId(server.id);
      await invalidateGroupTreeCache(queryClient);
    },
  });
};

export const useDeleteServerMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serverApi.delete(id),
    onSuccess: async (_, id) => {
      updateServersCache(queryClient, (servers) =>
        servers.filter((server) => server.id !== id),
      );
      await invalidateGroupTreeCache(queryClient);
    },
  });
};

export const useToggleFavoriteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serverApi.toggleFavorite(id),
    onSuccess: async (server) => {
      updateServersCache(queryClient, (servers) =>
        sortServersByName(
          servers.map((currentServer) =>
            currentServer.id === server.id ? server : currentServer,
          ),
        ),
      );
      await invalidateGroupTreeCache(queryClient);
    },
  });
};
