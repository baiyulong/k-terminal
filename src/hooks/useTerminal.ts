import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { serversQueryKey } from "@/hooks/useServers";
import { terminalApi } from "@/lib/tauri";
import type { ConnectionLog } from "@/lib/types";

export const recentConnectionsQueryKey = (limit?: number) =>
  ["terminal", "recent-connections", limit ?? 10] as const;

export interface LaunchFeedback {
  serverId: string;
  tone: "success" | "error";
  message: string;
}

const getErrorMessage = (error: unknown) => {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to launch terminal.";
};

export const useLaunchTerminalMutation = () => {
  const queryClient = useQueryClient();
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<LaunchFeedback | null>(null);

  useEffect(() => {
    if (feedback?.tone !== "success") {
      return;
    }

    const timer = window.setTimeout(() => {
      setFeedback((currentFeedback) =>
        currentFeedback?.tone === "success" ? null : currentFeedback,
      );
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [feedback]);

  const mutation = useMutation({
    mutationFn: async (serverId: string) => {
      setActiveServerId(serverId);
      setFeedback(null);
      await terminalApi.launch(serverId);
    },
    onSuccess: async (_, serverId) => {
      setFeedback({
        serverId,
        tone: "success",
        message: "Terminal launched!",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: serversQueryKey }),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "terminal",
        }),
      ]);
    },
    onError: (error, serverId) => {
      setFeedback({
        serverId,
        tone: "error",
        message: getErrorMessage(error),
      });
    },
  });

  return {
    ...mutation,
    activeServerId,
    feedback,
    launch: mutation.mutateAsync,
  };
};

export const useRecentConnectionsQuery = (limit?: number) =>
  useQuery<ConnectionLog[]>({
    queryKey: recentConnectionsQueryKey(limit),
    queryFn: () => terminalApi.getRecentConnections(limit),
  });
