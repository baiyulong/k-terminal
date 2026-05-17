import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toolbar } from "@/components/layout/Toolbar";
import { ServerDetail } from "@/components/server/ServerDetail";
import {
  ServerForm,
  type ServerFormValues,
} from "@/components/server/ServerForm";
import { ServerList } from "@/components/server/ServerList";
import {
  useCloneServerMutation,
  useCreateServerMutation,
  useDeleteServerMutation,
  useServersQuery,
  useToggleFavoriteMutation,
  useUpdateServerMutation,
} from "@/hooks/useServers";
import { useTerminalActions } from "@/hooks/useTerminalSession";
import { copyTextToClipboard } from "@/lib/clipboard";
import { sshApi } from "@/lib/tauri";
import type {
  CreateServerRequest,
  GroupNode,
  Server,
  UpdateServerRequest,
} from "@/lib/types";
import { useGroupStore } from "@/stores/groupStore";
import { useServerStore } from "@/stores/serverStore";

interface MainLayoutProps {
  onOpenSettings: () => void;
  onNavigateToTerminal: () => void;
  newServerShortcutSignal: number;
  connectShortcutSignal: number;
}

const matchesSearch = (server: Server, searchTerm: string) => {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  if (!normalizedSearchTerm) {
    return true;
  }

  return [
    server.name,
    server.host,
    server.username,
    server.description,
    server.tags,
    server.jump_host,
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(normalizedSearchTerm));
};

const matchesSelectedGroup = (
  server: Server,
  selectedGroupIds: Set<string> | null,
) => {
  if (!selectedGroupIds) {
    return true;
  }

  return Boolean(server.group_id && selectedGroupIds.has(server.group_id));
};

const collectGroupIds = (groups: GroupNode[]): string[] =>
  groups.flatMap((group) => [group.id, ...collectGroupIds(group.children)]);

const findGroupNode = (
  groups: GroupNode[],
  targetGroupId: string,
): GroupNode | null => {
  for (const group of groups) {
    if (group.id === targetGroupId) {
      return group;
    }

    const childMatch = findGroupNode(group.children, targetGroupId);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
};

const optionalValue = (value: string) => {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while processing server data.";
};

const toServerPayload = (
  values: ServerFormValues,
  isEditing: boolean,
): CreateServerRequest & Pick<UpdateServerRequest, "is_favorite"> => ({
  name: values.name.trim(),
  host: values.host.trim(),
  port: values.port || 22,
  username: values.username.trim(),
  auth_type: values.auth_type,
  password:
    values.auth_type === "password"
      ? optionalValue(values.password)
      : isEditing
        ? ""
        : undefined,
  private_key_path:
    values.auth_type === "key"
      ? optionalValue(values.private_key_path)
      : isEditing
        ? ""
        : undefined,
  passphrase:
    values.auth_type === "key"
      ? optionalValue(values.passphrase)
      : isEditing
        ? ""
        : undefined,
  group_id: optionalValue(values.group_id),
  description: optionalValue(values.description),
  terminal_profile_id: optionalValue(values.terminal_profile_id),
  startup_command: optionalValue(values.startup_command),
  encoding: values.encoding.trim() || "utf8",
  is_favorite: values.is_favorite,
  tags: optionalValue(values.tags),
  jump_host: optionalValue(values.jump_host),
  keep_alive: values.keep_alive,
  compression: values.compression,
  agent_forward: values.agent_forward,
  port_forwards: optionalValue(values.port_forwards),
});

export function MainLayout({
  onOpenSettings,
  onNavigateToTerminal,
  newServerShortcutSignal,
  connectShortcutSignal,
}: MainLayoutProps) {
  const toast = useToast();
  const queryState = useServersQuery();
  const servers = useServerStore((state) => state.servers);
  const selectedServerId = useServerStore((state) => state.selectedServerId);
  const setSelectedServerId = useServerStore(
    (state) => state.setSelectedServerId,
  );
  const groupTree = useGroupStore((state) => state.groups);
  const selectedGroupId = useGroupStore((state) => state.selectedGroupId);

  const createServerMutation = useCreateServerMutation();
  const updateServerMutation = useUpdateServerMutation();
  const cloneServerMutation = useCloneServerMutation();
  const deleteServerMutation = useDeleteServerMutation();
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const { connect } = useTerminalActions();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [formDefaultGroupId, setFormDefaultGroupId] = useState<string | null>(
    selectedGroupId,
  );

  const selectedGroup = useMemo(
    () =>
      selectedGroupId ? findGroupNode(groupTree, selectedGroupId) : null,
    [groupTree, selectedGroupId],
  );
  const selectedGroupIds = useMemo(
    () =>
      selectedGroup ? new Set(collectGroupIds([selectedGroup])) : null,
    [selectedGroup],
  );

  const filteredServers = useMemo(
    () =>
      servers.filter(
        (server) =>
          matchesSearch(server, searchTerm) &&
          matchesSelectedGroup(server, selectedGroupIds),
      ),
    [searchTerm, selectedGroupIds, servers],
  );

  useEffect(() => {
    if (filteredServers.length === 0) {
      if (selectedServerId !== null) {
        setSelectedServerId(null);
      }
      return;
    }

    const hasSelectedServer = selectedServerId
      ? filteredServers.some((server) => server.id === selectedServerId)
      : false;

    if (!hasSelectedServer) {
      setSelectedServerId(filteredServers[0].id);
    }
  }, [filteredServers, selectedServerId, setSelectedServerId]);

  const selectedServer = useMemo(
    () =>
      filteredServers.find((server) => server.id === selectedServerId) ?? null,
    [filteredServers, selectedServerId],
  );

  const queryErrorMessage = queryState.isError
    ? getErrorMessage(queryState.error)
    : null;
  const mutationErrorMessage = createServerMutation.error
    ? getErrorMessage(createServerMutation.error)
    : updateServerMutation.error
      ? getErrorMessage(updateServerMutation.error)
      : cloneServerMutation.error
        ? getErrorMessage(cloneServerMutation.error)
        : deleteServerMutation.error
          ? getErrorMessage(deleteServerMutation.error)
          : toggleFavoriteMutation.error
            ? getErrorMessage(toggleFavoriteMutation.error)
            : null;
  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingServer(null);
    setFormDefaultGroupId(selectedGroupId);
  }, [selectedGroupId]);

  const handleAddServer = useCallback(
    (targetGroupId: string | null = selectedGroupId) => {
      setEditingServer(null);
      setFormDefaultGroupId(targetGroupId);
      setIsFormOpen(true);
    },
    [selectedGroupId],
  );

  const handleEditServer = useCallback((server: Server) => {
    setEditingServer(server);
    setFormDefaultGroupId(server.group_id ?? null);
    setIsFormOpen(true);
  }, []);

  const handleFormSubmit = async (values: ServerFormValues) => {
    const payload = toServerPayload(values, Boolean(editingServer));

    if (editingServer) {
      await updateServerMutation.mutateAsync({
        id: editingServer.id,
        changes: payload,
      });
    } else {
      const { is_favorite, ...request } = payload;
      const createdServer = await createServerMutation.mutateAsync(request);

      if (is_favorite) {
        await toggleFavoriteMutation.mutateAsync(createdServer.id);
      }
    }

    closeForm();
  };

  const handleDeleteServer = async (server: Server) => {
    const isConfirmed = window.confirm(
      `Delete the server “${server.name}”? This cannot be undone.`,
    );

    if (!isConfirmed) {
      return;
    }

    try {
      await deleteServerMutation.mutateAsync(server.id);
      toast.success(`Deleted ${server.name}.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleToggleFavorite = async (server: Server) => {
    try {
      await toggleFavoriteMutation.mutateAsync(server.id);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleConnect = useCallback(
    async (server: Server) => {
      setSelectedServerId(server.id);
      await connect(server.id, server.name);
      onNavigateToTerminal();
    },
    [connect, onNavigateToTerminal, setSelectedServerId],
  );

  const handleCloneServer = async (server: Server) => {
    try {
      await cloneServerMutation.mutateAsync(server.id);
      toast.success(`Cloned ${server.name}.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleCopyCommand = useCallback(
    async (server: Server) => {
      try {
        const command = await sshApi.getCommandPreview(server.id);
        await copyTextToClipboard(command);
        toast.success("SSH command copied.");
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    },
    [toast],
  );

  const previousNewShortcutRef = useRef(0);
  useEffect(() => {
    if (
      newServerShortcutSignal === 0 ||
      newServerShortcutSignal === previousNewShortcutRef.current
    ) {
      return;
    }

    previousNewShortcutRef.current = newServerShortcutSignal;
    handleAddServer();
  }, [handleAddServer, newServerShortcutSignal]);

  const previousConnectShortcutRef = useRef(0);
  useEffect(() => {
    if (
      connectShortcutSignal === 0 ||
      connectShortcutSignal === previousConnectShortcutRef.current
    ) {
      return;
    }

    previousConnectShortcutRef.current = connectShortcutSignal;
    if (selectedServer) {
      handleConnect(selectedServer);
    }
  }, [connectShortcutSignal, handleConnect, selectedServer]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Sidebar totalServers={servers.length} onAddServerToGroup={handleAddServer}>
        <ServerList
          servers={filteredServers}
          selectedServerId={selectedServerId}
          isLoading={queryState.isPending && servers.length === 0}
          searchTerm={searchTerm}
          onSelect={setSelectedServerId}
          onLaunch={handleConnect}
          onEdit={handleEditServer}
          onClone={handleCloneServer}
          onCopySshCommand={handleCopyCommand}
          onDelete={handleDeleteServer}
          onToggleFavorite={handleToggleFavorite}
        />
      </Sidebar>

      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          searchTerm={searchTerm}
          isSearchOpen={isSearchOpen}
          selectedServerName={selectedServer?.name}
          onSearchChange={setSearchTerm}
          onSearchToggle={() => {
            setIsSearchOpen((currentValue) => {
              if (currentValue) {
                setSearchTerm("");
              }

              return !currentValue;
            });
          }}
          onAddServer={() => handleAddServer()}
          onOpenSettings={onOpenSettings}
        />

        {queryErrorMessage || mutationErrorMessage ? (
          <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-3 text-sm text-red-500">
            {queryErrorMessage ?? mutationErrorMessage}
          </div>
        ) : null}

        <ServerDetail
          server={selectedServer}
          isDeleting={deleteServerMutation.isPending}
          isFavoriteUpdating={toggleFavoriteMutation.isPending}
          onConnect={handleConnect}
          onEdit={handleEditServer}
          onDelete={handleDeleteServer}
          onToggleFavorite={handleToggleFavorite}
        />
      </main>

      <ServerForm
        open={isFormOpen}
        server={editingServer}
        defaultGroupId={formDefaultGroupId}
        isSubmitting={
          createServerMutation.isPending ||
          updateServerMutation.isPending ||
          toggleFavoriteMutation.isPending
        }
        onClose={closeForm}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
