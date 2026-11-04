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
  AiAgentAccess,
  aiError,
  checkAiAgentAccess,
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
  const [backend, setBackend] = useState<"direct" | "agent">("direct");
  const [agentId, setAgentId] = useState("");
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [embeddingModel, setEmbeddingModel] = useState(
    "text-embedding-3-small",
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [agentAccess, setAgentAccess] = useState<AiAgentAccess>();
  const [agentAccessError, setAgentAccessError] = useState("");
  const [checkingAgent, setCheckingAgent] = useState(false);
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
      setBackend(query.data.backend ?? "direct");
      setAgentId(query.data.agentId ?? "");
      setSemanticEnabled(query.data.semanticEnabled);
      setEmbeddingModel(query.data.embeddingModel);
    }
  }, [query.data]);
  const save = async (removeKey = false) => {
    if (!removeKey && enabled && backend === "agent" && !agentId.trim()) {
      setError("Enter an agent ID before enabling AI with the agent backend.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setAgentAccess(undefined);
    setAgentAccessError("");
    try {
      await saveAiSettings({
        enabled: removeKey ? false : enabled,
        model,
        backend,
        agentId: backend === "agent" ? agentId.trim() || null : null,
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
  const savedAgentId = query.data?.agentId ?? "";
  const canCheckAgent =
    backend === "agent" &&
    query.data?.backend === "agent" &&
    query.data.configured === true &&
    agentId.trim() === savedAgentId &&
    Boolean(agentId.trim()) &&
    !key.trim() &&
    !busy &&
    !checkingAgent;
  const checkAgent = async () => {
    if (!canCheckAgent) return;
    setCheckingAgent(true);
    setAgentAccess(undefined);
    setAgentAccessError("");
    try {
      setAgentAccess(await checkAiAgentAccess(agentId.trim()));
    } catch {
      setAgentAccessError(
        "Could not verify saved agent access. Check the agent ID and configured AI key.",
      );
    } finally {
      setCheckingAgent(false);
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
      <Select
        label="AI mode"
        value={backend}
        onChange={(value) => {
          if (!value) return;
          setBackend(value as "direct" | "agent");
          setAgentAccess(undefined);
          setAgentAccessError("");
        }}
        data={[
          { value: "direct", label: "Direct model" },
          { value: "agent", label: "OpenAI Agent" },
        ]}
        allowDeselect={false}
        disabled={busy}
      />
      {backend === "direct" ? (
        <TextInput
          label="OpenAI model"
          description="Enter a model available to your OpenAI project."
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          maxLength={100}
        />
      ) : (
        <>
          <TextInput
            label="Agent ID"
            description="Enter the saved agent ID supplied by your administrator."
            value={agentId}
            onChange={(event) => {
              setAgentId(event.currentTarget.value);
              setAgentAccess(undefined);
              setAgentAccessError("");
            }}
            maxLength={200}
            disabled={busy || checkingAgent}
          />
          <Text size="sm" c="dimmed">
            The agent defines its model and tools. With Ask, your question may
            only your question may be sent to configured public documentation
            MCPs such as Microsoft Learn or CIPP, and to web search. Accessible
            private Docmost excerpts are sent separately to OpenAI in a
            tool-free composition; they are never sent to MCP or web tools.
            Writing notes are sent to OpenAI only and never to MCP or web tools.
            Checking agent metadata does not guarantee MCP connectivity.
          </Text>
          {key.trim() && (
            <Text size="xs" c="dimmed">
              Save the replacement key before checking agent access. The check
              uses only the saved server-side key.
            </Text>
          )}
          <Button
            variant="light"
            disabled={!canCheckAgent}
            loading={checkingAgent}
            onClick={checkAgent}
          >
            Check agent access
          </Button>
          {agentAccessError && <Alert color="red">{agentAccessError}</Alert>}
          {agentAccess && (
            <Alert color="green" title="Agent access verified">
              <Text size="sm">
                {agentAccess.name || agentAccess.id} ({agentAccess.model})
              </Text>
              {agentAccess.tools.map((tool, index) => (
                <Text key={`${tool.type}-${index}`} size="xs">
                  {tool.label || tool.type}
                  {tool.host ? ` — ${tool.host}` : ""}
                </Text>
              ))}
            </Alert>
          )}
        </>
      )}
      <PasswordInput
        label={query.data?.configured ? "Replace API key" : "OpenAI API key"}
        description={
          query.data?.configured
            ? "A key is configured. Leave blank to keep it. Stored keys are never shown."
            : "You can leave this blank and keep AI disabled until you are ready."
        }
        value={key}
        onChange={(e) => {
          setKey(e.currentTarget.value);
          setAgentAccess(undefined);
          setAgentAccessError("");
        }}
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
