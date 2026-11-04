import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import api from "@/lib/api-client";

export type IGlobalPin = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  settings?: { nevecoCategory?: 'company' | 'vendor' } | null;
};

async function getGlobalPins(): Promise<{ items: IGlobalPin[] }> {
  const response = await api.post<{ items: IGlobalPin[] }>(
    "/spaces/global-pins",
  );
  return response.data;
}

async function setGlobalPin(data: {
  spaceId: string;
  pinned: boolean;
}): Promise<void> {
  await api.post("/spaces/global-pin", data);
}

export function useGlobalPinsQuery() {
  const currentUser = useAtomValue(currentUserAtom);
  const workspaceId = currentUser?.workspace.id;
  const userId = currentUser?.user.id;

  return useQuery({
    queryKey: ["global-pins", workspaceId, userId],
    queryFn: getGlobalPins,
    enabled: Boolean(workspaceId && userId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useGlobalPinMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setGlobalPin,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["global-pins"] }),
        queryClient.invalidateQueries({ queryKey: ["space"] }),
      ]);
    },
  });
}
