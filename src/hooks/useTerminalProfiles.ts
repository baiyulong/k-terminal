import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { terminalProfileApi } from "@/lib/tauri";
import type {
  CreateTerminalProfileRequest,
  UpdateTerminalProfileRequest,
} from "@/lib/types";

export const terminalProfilesQueryKey = ["terminal-profiles"] as const;

const invalidateTerminalProfiles = async (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  await queryClient.invalidateQueries({ queryKey: terminalProfilesQueryKey });
};

export const useTerminalProfilesQuery = () =>
  useQuery({
    queryKey: terminalProfilesQueryKey,
    queryFn: terminalProfileApi.list,
  });

export const useCreateTerminalProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateTerminalProfileRequest) =>
      terminalProfileApi.create(request),
    onSuccess: async () => {
      await invalidateTerminalProfiles(queryClient);
    },
  });
};

export const useUpdateTerminalProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string;
      changes: UpdateTerminalProfileRequest;
    }) => terminalProfileApi.update(id, changes),
    onSuccess: async () => {
      await invalidateTerminalProfiles(queryClient);
    },
  });
};

export const useDeleteTerminalProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => terminalProfileApi.delete(id),
    onSuccess: async () => {
      await invalidateTerminalProfiles(queryClient);
    },
  });
};

export const useSetDefaultTerminalProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => terminalProfileApi.setDefault(id),
    onSuccess: async () => {
      await invalidateTerminalProfiles(queryClient);
    },
  });
};

export const useDetectTerminalsMutation = () =>
  useMutation({
    mutationFn: terminalProfileApi.detectAvailable,
  });
