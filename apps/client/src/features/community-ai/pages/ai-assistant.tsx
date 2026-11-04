import { useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Container,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { DocumentTitle } from "@/components/ui/document-title";
import {
  AiAnswer,
  AiMode,
  AiSearchResult,
  aiError,
  generate,
  getAiSettings,
  searchDocumentation,
} from "../api";

type Task = AiMode | "search";
const aiModes: AiMode[] = ["ask", "summarize", "improve", "draft"];

export default function AiAssistantPage() {
  const location = useLocation();
  const routeState = location.state as {
    question?: unknown;
    mode?: unknown;
  } | null;
  const routeMode = routeState?.mode;
  const initialMode: Task = routeMode === "search" ? "search" : "ask";
  const routeQuestion = routeState?.question;
  const initialQuestion =
    typeof routeQuestion === "string" &&
    routeQuestion.length <=
      (initialMode === "search" || initialMode === "ask" ? 2000 : 12000)
      ? routeQuestion
      : "";
  const {
    data: settings,
    isPending,
    error: settingsError,
  } = useQuery({ queryKey: ["community-ai-settings"], queryFn: getAiSettings });
  const [mode, setMode] = useState<Task>(initialMode);
  const [input, setInput] = useState(initialQuestion);
  const [result, setResult] = useState<AiAnswer>();
  const [searchResult, setSearchResult] = useState<AiSearchResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSearch = mode === "search";
  const isWriting = mode !== "search" && mode !== "ask";
  const submit = async () => {
    setBusy(true);
    setError("");
    setResult(undefined);
    setSearchResult(undefined);
    try {
      if (isSearch) setSearchResult(await searchDocumentation(input));
      else setResult(await generate(mode as AiMode, input));
    } catch (e) {
      setError(aiError(e));
    } finally {
      setBusy(false);
    }
  };
  const maxLength = isWriting ? 12000 : 2000;
  const writingNeedsAi = !isSearch;

  return (
    <Container size="md" py="xl">
      <Stack>
        <DocumentTitle title="AI assistant" />
        <Title order={2}>AI assistant</Title>
        <Text c="dimmed">
          Search accessible documentation or get help turning notes into a
          draft.
        </Text>
        {settingsError && <Alert color="red">Could not load AI status.</Alert>}
        {!isPending && !settingsError && !settings?.enabled && (
          <Alert>
            AI writing is disabled. Documentation search remains available. An
            administrator can configure AI in{" "}
            <Anchor component={Link} to="/settings/ai">
              AI settings
            </Anchor>
            .
          </Alert>
        )}
        <Select
          label="Task"
          value={mode}
          onChange={(value) => {
            if (!value) return;
            setMode(value as Task);
            setResult(undefined);
            setSearchResult(undefined);
          }}
          data={[
            { value: "search", label: "Search documentation" },
            { value: "ask", label: "Ask your documentation" },
            { value: "summarize", label: "Summarize text" },
            { value: "improve", label: "Improve writing" },
            { value: "draft", label: "Turn notes into documentation" },
          ]}
          allowDeselect={false}
          disabled={busy}
        />
        <Textarea
          label={
            isSearch
              ? "Search query"
              : mode === "ask"
                ? "Question"
                : mode === "draft"
                  ? "Notes for a documentation draft"
                  : "Text or brief"
          }
          description={
            isSearch
              ? "Searches automatically with semantic and keyword matching when available. No API key is needed."
              : mode === "ask"
                ? "Ask a question about accessible Companys, vendors, or products."
                : "Your text will be sent to OpenAI when you click Generate. The result is a draft for you to review and copy; it is not saved automatically."
          }
          autosize
          minRows={5}
          maxRows={16}
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          maxLength={maxLength}
          disabled={busy}
        />
        <Button
          onClick={submit}
          loading={busy}
          disabled={!input.trim() || (writingNeedsAi && !settings?.enabled)}
        >
          {isSearch ? "Search" : mode === "ask" ? "Ask" : "Generate"}
        </Button>
        {error && <Alert color="red">{error}</Alert>}
        {searchResult && (
          <Stack>
            <Text size="sm" c="dimmed">
              Search mode: {searchResult.mode}
            </Text>
            {searchResult.notice && <Alert>{searchResult.notice}</Alert>}
            {searchResult.items.length === 0 && (
              <Text>No matching documents found.</Text>
            )}
            {searchResult.items.map((item) => (
              <Stack key={item.id} gap={4}>
                <Anchor component={Link} to={item.url}>
                  {item.title}
                </Anchor>
                <Badge w="fit-content" variant="light">
                  {item.kind}
                </Badge>
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {item.excerpt}
                </Text>
              </Stack>
            ))}
          </Stack>
        )}
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
