import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useUserRole from "@/hooks/use-user-role";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title";
import { aiError, getAiSettings, saveAiSettings } from "../api";

export default function AiSettingsPage() {
  const { isAdmin } = useUserRole();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["community-ai-settings"],
    queryFn: getAiSettings,
  });
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("gpt-5-mini");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (query.data) {
      setEnabled(query.data.enabled);
      setModel(query.data.model);
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
        documentation stays in this instance; no external document index is
        created.
      </Text>
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
