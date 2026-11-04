import { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { aiError, generate, getAiSettings } from "@/features/community-ai/api";
import {
  buildNevecoDraftBrief,
  buildNevecoTemplateContent,
  NEVECO_TEMPLATES,
} from "./catalog";

const AMBER = "#CB923E";

/**
 * A small, permission-gated community template picker.
 * It only appears after collaborative sync on an editable empty page.
 * AI is optional and never automatically writes to the page.
 */
export default function NevecoTemplatePicker({
  editor,
  connected,
}: {
  editor: Editor;
  connected: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [selectedId, setSelectedId] = useState("sop");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const template =
    NEVECO_TEMPLATES.find((entry) => entry.id === selectedId) ??
    NEVECO_TEMPLATES[0];

  const { data: aiSettings } = useQuery({
    queryKey: ["community-ai-settings"],
    queryFn: getAiSettings,
    enabled: opened,
    retry: false,
  });

  const canApply =
    connected && !editor.isDestroyed && editor.isEditable && editor.isEmpty;

  const insert = (content: Parameters<Editor["commands"]["insertContent"]>[0]) => {
    // Recheck immediately: a collaborator may have written while the modal
    // was open or the connection may have changed.
    if (!canApply || !editor.isEmpty || !editor.isEditable) {
      setError("This page is no longer empty, editable and synced. Nothing was changed.");
      return;
    }
    try {
      const applied = editor.chain().focus().insertContent(content).run();
      if (!applied) {
        setError("The editor could not insert the documentation.");
        return;
      }
      setOpened(false);
      setDraft("");
      setError("");
    } catch {
      setError("The editor could not insert the documentation. Nothing else was changed.");
    }
  };

  const insertBlank = () => insert(buildNevecoTemplateContent(template));

  const generateDraft = async () => {
    if (!notes.trim() || !aiSettings?.enabled || !aiSettings.configured) return;
    setBusy(true);
    setDraft("");
    setError("");
    try {
      const response = await generate("draft", buildNevecoDraftBrief(template, notes));
      setDraft(response.answer);
    } catch (cause) {
      setError(aiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const insertDraft = () => {
    if (!draft.trim()) return;
    // Never render raw model HTML. Tiptap parses only its supported elements
    // after this sanitisation step; links still require technician review.
    const html = marked.parse(draft, { async: false, gfm: true }) as string;
    const safeHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "h1", "h2", "h3", "h4", "ul", "ol", "li", "strong",
        "b", "em", "i", "s", "code", "pre", "blockquote", "hr",
        "table", "thead", "tbody", "tr", "td", "th", "a",
      ],
      ALLOWED_ATTR: ["href", "title"],
    });
    if (!safeHtml.trim()) {
      setError("The draft contained no supported content.");
      return;
    }
    insert(safeHtml);
  };

  return (
    <>
      <Box mb="sm" className="print-hide">
        <Button
          type="button"
          variant="light"
          color="orange"
          size="sm"
          onClick={() => setOpened(true)}
        >
          Start with a Neveco template
        </Button>
      </Box>

      <Modal
        title="Neveco documentation templates"
        opened={opened}
        onClose={() => {
          if (!busy) setOpened(false);
        }}
        size="xl"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="md">
          <Box style={{ borderLeft: "3px solid " + AMBER, paddingLeft: 12 }}>
            <Text fw={700} style={{ color: AMBER }}>
              NEVECO / DOCUMENTATION STANDARD
            </Text>
            <Text size="sm" c="dimmed">
              Choose a structured, editable starter page. Customer details are
              placeholders until a technician verifies them.
            </Text>
          </Box>

          <ScrollArea.Autosize mah={290} type="auto">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" pr="xs">
              {NEVECO_TEMPLATES.map((item) => (
                <Paper
                  key={item.id}
                  withBorder
                  radius="md"
                  p="sm"
                  style={{
                    borderColor: selectedId === item.id ? AMBER : undefined,
                    backgroundColor: selectedId === item.id
                      ? "var(--mantine-color-default-hover)"
                      : undefined,
                  }}
                >
                  <Stack gap={4}>
                    <Button
                      type="button"
                      variant={selectedId === item.id ? "light" : "subtle"}
                      color={selectedId === item.id ? "orange" : "gray"}
                      onClick={() => {
                        setSelectedId(item.id);
                        setDraft("");
                        setError("");
                      }}
                      fullWidth
                      justify="start"
                      aria-pressed={selectedId === item.id}
                    >
                      {item.name}
                    </Button>
                    <Text size="xs" c="dimmed">
                      {item.description}
                    </Text>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          </ScrollArea.Autosize>

          <Text size="sm">
            <strong>{template.name}:</strong> {template.sections.length} guided
            sections, standard document control, evidence and review fields.
          </Text>
          <Group>
            <Button
              style={{ backgroundColor: AMBER, color: "#121212" }}
              onClick={insertBlank}
              disabled={!canApply || busy}
            >
              Insert template
            </Button>
            <Text size="xs" c="dimmed">
              Only available on an empty, synced page you can edit.
            </Text>
          </Group>

          <Box>
            <Text fw={600}>Optional: draft using OpenAI</Text>
            <Text size="xs" c="dimmed" mb="xs">
              Only the notes below and the chosen template structure are sent
              when you click Generate. Remove passwords, tokens, sensitive
              personal data and unapproved customer information first.
            </Text>
            <Textarea
              label="Technician notes or rough steps"
              placeholder="Paste verified notes, steps, intended outcome and relevant references..."
              value={notes}
              onChange={(event) => {
                setNotes(event.currentTarget.value);
                setDraft("");
              }}
              minRows={3}
              maxRows={7}
              autosize
              maxLength={5500}
              disabled={busy}
            />
            <Group mt="sm">
              <Button
                variant="default"
                onClick={generateDraft}
                loading={busy}
                disabled={!canApply || !notes.trim() || !aiSettings?.enabled || !aiSettings.configured}
              >
                Generate draft with OpenAI
              </Button>
              {!aiSettings?.enabled || !aiSettings.configured ? (
                <Text size="xs" c="dimmed">
                  AI drafting requires enabled OpenAI settings; templates work without AI.
                </Text>
              ) : null}
            </Group>
          </Box>

          {error && <Alert color="red">{error}</Alert>}
          {draft && (
            <Stack gap="xs">
              <Text fw={600}>Review AI draft before inserting</Text>
              <Textarea
                aria-label="AI draft preview"
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                minRows={8}
                maxRows={15}
                autosize
                maxLength={24000}
              />
              <Text size="xs" c="dimmed">
                AI may be incorrect. Verify all facts, tenant scope, approvals,
                links, security steps and section headings before publishing.
              </Text>
              <Group>
                <Button
                  style={{ backgroundColor: AMBER, color: "#121212" }}
                  onClick={insertDraft}
                  disabled={!canApply || busy}
                >
                  Insert reviewed draft
                </Button>
                <Button
                  variant="default"
                  onClick={insertBlank}
                  disabled={!canApply || busy}
                >
                  Use blank template instead
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      </Modal>
    </>
  );
}
