import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { Alert, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query";
import classes from "./base-embed.module.css";

export function BaseEmbedView({ node }: NodeViewProps) {
  const { t } = useTranslation();
  const pageId = node.attrs.pageId as string | null;
  const { data: page } = usePageQuery({ pageId: pageId ?? undefined });

  return (
    <NodeViewWrapper className={classes.handleGutter}>
      <Alert color="gray" title={page?.title || t("Database block") }>
        <Text size="sm">
          {t(
            "This document contains a premium database block, which is unavailable in this community build. Stored data has been preserved.",
          )}
        </Text>
      </Alert>
    </NodeViewWrapper>
  );
}
