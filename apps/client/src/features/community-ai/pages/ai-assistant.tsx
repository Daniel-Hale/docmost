import { useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Container,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DocumentTitle } from "@/components/ui/document-title";
import { AiAnswer, AiMode, aiError, generate, getAiSettings } from "../api";

export default function AiAssistantPage() {
  const {
    data: settings,
    isPending,
    error: settingsError,
  } = useQuery({ queryKey: ["community-ai-settings"], queryFn: getAiSettings });
  const [mode, setMode] = useState<AiMode>("ask");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AiAnswer>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      setResult(await generate(mode, input));
    } catch (e) {
      setError(aiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Container size="md" py="xl">
      <Stack>
        <DocumentTitle title="AI assistant" />
        <Title order={2}>AI assistant</Title>
        <Text c="dimmed">
          Ask about your Companys and vendors, or get help writing
          documentation.
        </Text>
        {settingsError && <Alert color="red">Could not load AI status.</Alert>}
        {!isPending && !settingsError && !settings?.enabled && (
          <Alert>
            AI is disabled. An administrator can add a key in{" "}
            <Anchor component={Link} to="/settings/ai">
              AI settings
            </Anchor>{" "}
            when you are ready.
          </Alert>
        )}
        <Select
          label="Task"
          value={mode}
          onChange={(v) => {
            setMode(v as AiMode);
            setResult(undefined);
          }}
          data={[
            { value: "ask", label: "Ask your documentation" },
            { value: "summarize", label: "Summarize text" },
            { value: "improve", label: "Improve writing" },
            { value: "draft", label: "Draft documentation" },
          ]}
          allowDeselect={false}
          disabled={busy}
        />
        <Textarea
          label={mode === "ask" ? "Question" : "Text or brief"}
          description={
            mode === "ask"
              ? "Searches current documentation across Companys you can access. Use specific company, vendor or product names."
              : "The text you enter will be sent to OpenAI when you click Generate."
          }
          autosize
          minRows={5}
          maxRows={16}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          maxLength={12000}
          disabled={busy}
        />
        <Button
          onClick={submit}
          loading={busy}
          disabled={!settings?.enabled || !input.trim()}
        >
          {mode === "ask" ? "Ask" : "Generate"}
        </Button>
        {error && <Alert color="red">{error}</Alert>}
        {result && (
          <Stack>
            <Title order={3}>Suggested answer</Title>
            <Text style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {result.answer}
            </Text>
            {result.sources.length > 0 && (
              <>
                <Title order={4}>Sources</Title>
                {result.sources.map((source, i) => (
                  <Anchor key={source.id} component={Link} to={source.url}>
                    [{i + 1}] {source.title}
                  </Anchor>
                ))}
              </>
            )}
            <Text size="xs" c="dimmed">
              Review suggestions and source documents before using them. Nothing
              is saved to your documents automatically.
            </Text>
            <Button
              variant="light"
              onClick={() => navigator.clipboard.writeText(result.answer)}
            >
              Copy answer
            </Button>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
