import { useEffect, useState } from "react";
import { Alert, Group, Switch, Text } from "@mantine/core";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";
import { ISpace } from "@/features/space/types/space.types";
import useUserRole from "@/hooks/use-user-role";
import { useGlobalPinMutation } from "@/features/space/queries/global-pins-query";

export default function GlobalPinSettings({ space }: { space: ISpace }) {
  const { isAdmin } = useUserRole();
  const ability = useSpaceAbility(space.membership?.permissions);
  const canPin =
    isAdmin && ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  const mutation = useGlobalPinMutation();
  const [pinned, setPinned] = useState(space.settings?.globalPinned === true);

  useEffect(() => {
    setPinned(space.settings?.globalPinned === true);
  }, [space.id, space.settings?.globalPinned]);

  if (!canPin) return null;

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">Pin for all staff</Text>
        <Text size="sm" c="dimmed">
          Share with the Everyone group first. Existing page restrictions still
          apply.
        </Text>
        {mutation.error && (
          <Alert mt="xs" color="red">
            {getMutationErrorMessage(mutation.error)}
          </Alert>
        )}
      </div>
      <Switch
        checked={pinned}
        aria-label="Pin for all staff"
        disabled={mutation.isPending}
        onChange={(event) => {
          const nextValue = event.currentTarget.checked;
          mutation.mutate(
            { spaceId: space.id, pinned: nextValue },
            { onSuccess: () => setPinned(nextValue) },
          );
        }}
      />
    </Group>
  );
}

function getMutationErrorMessage(error: Error): string {
  const responseMessage = (
    error as Error & {
      response?: { data?: { message?: unknown } };
    }
  ).response?.data?.message;
  if (typeof responseMessage === "string") return responseMessage;
  return error.message || "Could not update the global pin.";
}
