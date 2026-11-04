import { useState } from "react";
import { Anchor, Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { getAiSettings } from "@/features/community-ai/api";

export default function CommunityAiPrompt() {
  const [question, setQuestion] = useState("");
  const navigate = useNavigate();
  const {
    data: settings,
    isPending,
    error,
  } = useQuery({
    queryKey: ["community-ai-settings"],
    queryFn: getAiSettings,
  });
  const enabled = settings?.enabled === true;

  return (
    <Stack mb="xl" gap="xs">
      <Textarea
        label="Ask AI"
        aria-label="Ask a question about your documentation"
        placeholder="Ask a question about your Companys or vendors"
        autosize
        minRows={2}
        maxRows={5}
        maxLength={2000}
        value={question}
        onChange={(event) => setQuestion(event.currentTarget.value)}
      />
      <Group justify="space-between" align="center">
        {error ? (
          <Text size="sm" c="dimmed">
            Could not load AI status.
          </Text>
        ) : !isPending && !enabled ? (
          <Text size="sm" c="dimmed">
            AI is disabled.{" "}
            <Anchor component={Link} to="/settings/ai">
              Configure AI
            </Anchor>
          </Text>
        ) : (
          <span />
        )}
        <Button
          disabled={!enabled || !question.trim()}
          onClick={() => navigate("/ai", { state: { question } })}
        >
          Ask AI
        </Button>
        <Button
          variant="light"
          disabled={!question.trim()}
          onClick={() =>
            navigate("/ai", { state: { question, mode: "search" } })
          }
        >
          Search documents
        </Button>
      </Group>
    </Stack>
  );
}
