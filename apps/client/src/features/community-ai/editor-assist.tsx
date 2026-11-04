import { useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Node } from "@tiptap/pm/model";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { AiMode, aiError, generate, getAiSettings } from "./api";

export default function EditorAssist({ editor }: { editor: Editor }) {
  const { data: settings } = useQuery({
    queryKey: ["community-ai-settings"],
    queryFn: getAiSettings,
  });
  const [opened, setOpened] = useState(false);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AiMode>("improve");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<{
    doc: Node;
    from: number;
    to: number;
  }>();
  if (!settings?.enabled || !editor.isEditable) return null;
  const open = () => {
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, "\n");
    setSnapshot(
      selected.length <= 12000
        ? { doc: editor.state.doc, from, to }
        : undefined,
    );
    setInput(selected.length <= 12000 ? selected : "");
    setAnswer("");
    setError(
      selected.length > 12000
        ? "Select less than 12,000 characters before using AI writing."
        : "",
    );
    setOpened(true);
  };
  const submit = async () => {
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      setAnswer((await generate(mode, input)).answer);
    } catch (e) {
      setError(aiError(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    if (!snapshot || !editor.isEditable || !snapshot.doc.eq(editor.state.doc)) {
      setError(
        "The document changed. Copy the suggestion or close and select the text again.",
      );
      return;
    }
    const content = answer.split(/\n\n+/).map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    }));
    editor
      .chain()
      .focus()
      .insertContentAt({ from: snapshot.from, to: snapshot.to }, content)
      .run();
    setOpened(false);
  };
  return (
    <>
      <Button size="xs" variant="subtle" onClick={open}>
        AI writing
      </Button>
      <Modal
        title="AI writing assistance"
        opened={opened}
        onClose={() => !busy && setOpened(false)}
        size="lg"
      >
        <Stack>
          <Select
            label="Task"
            value={mode}
            onChange={(v) => setMode(v as AiMode)}
            allowDeselect={false}
            data={[
              { value: "improve", label: "Improve writing" },
              { value: "summarize", label: "Summarize" },
              { value: "draft", label: "Draft from a brief" },
            ]}
            disabled={busy}
          />
          <Textarea
            label="Selected text or brief"
            description="This text is sent to OpenAI when you click Generate."
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            autosize
            minRows={4}
            maxRows={12}
            maxLength={12000}
            disabled={busy}
          />
          <Button onClick={submit} loading={busy} disabled={!input.trim()}>
            Generate
          </Button>
          {error && <Alert color="red">{error}</Alert>}
          {answer && (
            <>
              <Text style={{ whiteSpace: "pre-wrap" }}>{answer}</Text>
              <Text size="xs" c="dimmed">
                Review before applying. Clicking Apply replaces your original
                selection with plain text and removes its formatting.
              </Text>
              <Group>
                <Button onClick={apply} disabled={busy || !snapshot}>
                  Apply suggestion
                </Button>
                <Button
                  variant="light"
                  onClick={() => navigator.clipboard.writeText(answer)}
                >
                  Copy
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
