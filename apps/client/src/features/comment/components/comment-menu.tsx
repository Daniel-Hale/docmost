import { ActionIcon, Menu } from "@mantine/core";
import {
  IconDots,
  IconEdit,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useClipboard } from "@/hooks/use-clipboard";
import { getAppUrl } from "@/lib/config";

type CommentMenuProps = {
  commentId: string;
  onEditComment: () => void;
  onDeleteComment: () => void;
  canEdit?: boolean;
  canManage?: boolean;
  isParentComment?: boolean;
};

function CommentMenu({
  commentId,
  onEditComment,
  onDeleteComment,
  canEdit = true,
  canManage = false,
  isParentComment = false,
}: CommentMenuProps) {
  const { t } = useTranslation();
  const clipboard = useClipboard({ timeout: 500 });

  const handleCopyLink = () => {
    const link = `${getAppUrl()}${window.location.pathname}?commentId=${commentId}`;
    clipboard.copy(link);
    notifications.show({ message: t("Link copied") });
  };

  //@ts-ignore
  const openDeleteModal = () =>
    modals.openConfirmModal({
      title: t("Are you sure you want to delete this comment?"),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: onDeleteComment,
    });

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon
          variant="default"
          style={{ border: "none" }}
          aria-label={t("Comment menu")}
        >
          <IconDots size={20} stroke={2} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        {canEdit && (
          <Menu.Item
            onClick={onEditComment}
            leftSection={<IconEdit size={14} />}
          >
            {t("Edit comment")}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<IconLink size={14} />}
          onClick={handleCopyLink}
        >
          {t("Copy link")}
        </Menu.Item>
        {canManage && (
          <Menu.Item
            leftSection={<IconTrash size={14} />}
            onClick={openDeleteModal}
          >
            {t("Delete comment")}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

export default CommentMenu;
