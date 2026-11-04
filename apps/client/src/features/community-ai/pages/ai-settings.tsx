import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useUserRole from "@/hooks/use-user-role";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title";
import {
  aiError,
  getAiIndexStatus,
  getAiSettings,
  refreshAiIndex,
  saveAiSettings,
} from "../api";

export default function AiSettingsPage() {
  const { isAdmin } = useUserRole();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["community-ai-settings"],
    queryFn: getAiSettings,
  });
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("gpt-5-mini");
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [embeddingModel, setEmbeddingModel] = useState(
    "text-embedding-3-small",
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const semanticIndexEnabled =
    isAdmin && enabled && query.data?.configured === true && semanticEnabled;
  const hasApiKey = query.data?.configured === true || Boolean(key.trim());
  const indexQuery = useQuery({
    queryKey: ["community-ai-index-status"],
    queryFn: getAiIndexStatus,
    enabled: semanticIndexEnabled,
    refetchInterval: semanticIndexEnabled ? 10_000 : false,
  });
  const refreshMutation = useMutation({
    mutationFn: refreshAiIndex,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["community-ai-index-status"] }),
  });
  useEffect(() => {
    if (query.data) {
      setEnabled(query.data.enabled);
      setModel(query.data.model);
      setSemanticEnabled(query.data.semanticEnabled);
      setEmbeddingModel(query.data.embeddingModel);
    }
  }, [query.data]);
  const save = async (removeKey = false) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveAiSettings({
        enabled: removeKey ? false : enabled,
        model,
        semanticEnabled: removeKey ? false : semanticEnabled,
        embeddingModel,
        apiKey: !removeKey && key.trim() ? key.trim() : undefined,
        removeKey,
      });
      setKey("");
      await client.invalidateQueries({ queryKey: ["community-ai-settings"] });
      setMessage(
        removeKey ? "Key removed and AI disabled." : "AI settings saved.",
      );
    } catch (e) {
      setError(aiError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!isAdmin)
    return <Alert>Only workspace administrators can manage AI settings.</Alert>;
  return (
    <Stack maw={640}>
      <DocumentTitle title="AI settings" />
      <SettingsTitle title="AI settings" />
      <Text size="sm">
        Use your own OpenAI account for documentation questions and writing
        assistance.
      </Text>
      <Alert color="blue">
        When enabled, questions and relevant documentation excerpts are sent to
        OpenAI. Writing tools send the text you select. Answers should be
        checked against their sources.
      </Alert>
      {(query.error || error) && (
        <Alert color="red">{error || "Could not load AI settings."}</Alert>
      )}
      {message && <Alert color="green">{message}</Alert>}
      <Switch
        label="Enable AI"
        checked={enabled}
        onChange={(e) => setEnabled(e.currentTarget.checked)}
        disabled={query.isPending || busy}
      />
      <TextInput
        label="OpenAI model"
        description="Enter a model available to your OpenAI project."
        value={model}
        onChange={(e) => setModel(e.currentTarget.value)}
        maxLength={100}
      />
      <PasswordInput
        label={query.data?.configured ? "Replace API key" : "OpenAI API key"}
        description={
          query.data?.configured
            ? "A key is configured. Leave blank to keep it. Stored keys are never shown."
            : "You can leave this blank and keep AI disabled until you are ready."
        }
        value={key}
        onChange={(e) => setKey(e.currentTarget.value)}
        autoComplete="new-password"
        maxLength={512}
      />
      <Text size="xs" c="dimmed">
        The key is encrypted on the server. Removing it disables AI. Your
        questions and relevant source excerpts are sent to OpenAI when you ask
        AI. Semantic search below also sends page text for indexing.
      </Text>
      <Switch
        label="Enable semantic search"
        checked={semanticEnabled}
        onChange={(e) => setSemanticEnabled(e.currentTarget.checked)}
        disabled={!enabled || !hasApiKey || busy}
      />
      <Select
        label="Embedding model"
        value={embeddingModel}
        onChange={(value) => value && setEmbeddingModel(value)}
        data={[
          { value: "text-embedding-3-small", label: "text-embedding-3-small" },
          { value: "text-embedding-3-large", label: "text-embedding-3-large" },
        ]}
        allowDeselect={false}
        disabled={!enabled || !hasApiKey || busy}
      />
      <Text size="xs" c="dimmed">
        Semantic search sends accessible page text for indexing and your search
        queries to OpenAI, billed to the configured account. New and changed
        pages are indexed in the background, usually within about a minute.
      </Text>
      {semanticIndexEnabled && (
        <Stack gap="xs">
          {indexQuery.error && (
            <Alert color="red">Could not load semantic index status.</Alert>
          )}
          {indexQuery.data && (
            <Text size="sm">
              Pages: {indexQuery.data.indexedPages} indexed /{" "}
              {indexQuery.data.eligiblePages} eligible;{" "}
              {indexQuery.data.pendingPages} pending;{" "}
              {indexQuery.data.failedPages} failed.
              {indexQuery.data.active ? " Semantic indexing is enabled." : ""}
            </Text>
          )}
          {indexQuery.data?.lastError && (
            <Alert color="red">{indexQuery.data.lastError}</Alert>
          )}
          {refreshMutation.error && (
            <Alert color="red">{aiError(refreshMutation.error)}</Alert>
          )}
          <Button
            variant="light"
            loading={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            Refresh embeddings
          </Button>
        </Stack>
      )}
      <Group>
        <Button
          loading={busy}
          disabled={query.isPending}
          onClick={() => save()}
        >
          Save settings
        </Button>
        {query.data?.configured && (
          <Button
            color="red"
            variant="light"
            disabled={busy}
            onClick={() => save(true)}
          >
            Remove key
          </Button>
        )}
      </Group>
    </Stack>
  );
}
