import { Button, Divider, Modal } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { CreateSpaceForm } from "@/features/space/components/create-space-form.tsx";
import { useTranslation } from "react-i18next";

export default function CreateSpaceModal({ category = 'company' }: { category?: 'company' | 'vendor' }) {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);

  const createLabel = category === 'vendor' ? 'Create vendor' : t('Create space');

  return (
    <>
      <Button onClick={open}>{createLabel}</Button>

      <Modal
        opened={opened}
        onClose={close}
        title={createLabel}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Divider size="xs" mb="xs" />
        <CreateSpaceForm category={category} />
      </Modal>
    </>
  );
}
