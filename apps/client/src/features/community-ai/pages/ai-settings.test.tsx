import { MantineProvider } from "@mantine/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { checkAiAgentAccess, generate, saveAiSettings } from "../api";
import AiSettingsPage from "./ai-settings";
import AiAssistantPage from "./ai-assistant";

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  settings: {
    enabled: true,
    configured: true,
    model: "gpt-5-mini",
    semanticEnabled: false,
    embeddingModel: "text-embedding-3-small",
    backend: "direct" as "direct" | "agent",
    agentId: null as string | null,
  },
  saveSettings: vi.fn().mockResolvedValue(undefined),
  checkAgent: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock("@/features/community-ai/api", () => ({
  getAiSettings: vi.fn(),
  getAiIndexStatus: vi.fn(),
  refreshAiIndex: vi.fn(),
  saveAiSettings: mocks.saveSettings,
  checkAiAgentAccess: mocks.checkAgent,
  generate: vi.fn(),
  aiError: () => "Request failed",
}));
vi.mock("@/hooks/use-user-role", () => ({
  default: () => ({ isAdmin: mocks.isAdmin }),
}));
vi.mock("@/components/settings/settings-title", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/document-title", () => ({
  DocumentTitle: () => null,
}));

describe("AI backend settings", () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: new EventTarget(),
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    mocks.isAdmin = true;
    mocks.settings = {
      enabled: true,
      configured: true,
      model: "gpt-5-mini",
      semanticEnabled: false,
      embeddingModel: "text-embedding-3-small",
      backend: "direct",
      agentId: null,
    };
    mocks.saveSettings.mockReset().mockResolvedValue(undefined);
    mocks.checkAgent.mockReset().mockResolvedValue({
      id: "agent-42",
      name: "Documentation agent",
      model: "gpt-5-mini",
      tools: [{ type: "mcp", label: "Argus Docs", host: "docs.example" }],
    });
    mocks.invalidate.mockReset();
    vi.mocked(useQuery).mockImplementation(
      () =>
        ({
          data: mocks.settings,
          isPending: false,
          error: null,
        }) as any,
    );
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves agent mode and its user supplied ID without sending a provider request", async () => {
    render(
      <MantineProvider env="test">
        <AiSettingsPage />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "AI mode" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "OpenAI Agent" }),
    );
    fireEvent.change(screen.getByLabelText("Agent ID"), {
      target: { value: "agent-42" },
    });

    expect(screen.queryByLabelText("OpenAI model")).toBeNull();
    expect(screen.getByText(/agent defines its model and tools/i)).toBeTruthy();
    expect(
      screen.getByText(
        /only your question may be sent to configured public documentation MCPs/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /writing notes are sent to OpenAI only and never to MCP or web tools/i,
      ),
    ).toBeTruthy();
    expect(checkAiAgentAccess).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(saveAiSettings).toHaveBeenCalled());
    expect(saveAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        model: "gpt-5-mini",
        backend: "agent",
        agentId: "agent-42",
      }),
    );
  });

  it("checks only the saved agent ID after an explicit click and clears success on edit", async () => {
    mocks.settings.backend = "agent";
    mocks.settings.agentId = "agent-42";
    render(
      <MantineProvider env="test">
        <AiSettingsPage />
      </MantineProvider>,
    );
    const checkButton = screen.getByRole("button", {
      name: "Check agent access",
    });
    expect(checkAiAgentAccess).not.toHaveBeenCalled();
    fireEvent.click(checkButton);
    expect(
      await screen.findByText("Documentation agent (gpt-5-mini)"),
    ).toBeTruthy();
    expect(checkAiAgentAccess).toHaveBeenCalledWith("agent-42");
    expect(screen.getByText("Argus Docs — docs.example")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Replace API key"), {
      target: { value: "replacement-key-test" },
    });
    expect(screen.queryByText("Documentation agent (gpt-5-mini)")).toBeNull();
    expect((checkButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Agent ID"), {
      target: { value: "agent-new" },
    });
    expect(screen.queryByText("Documentation agent (gpt-5-mini)")).toBeNull();
    expect(checkAiAgentAccess).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps access checks unavailable to non-admins", () => {
    mocks.isAdmin = false;
    mocks.settings.backend = "agent";
    mocks.settings.agentId = "agent-42";
    render(
      <MantineProvider env="test">
        <AiSettingsPage />
      </MantineProvider>,
    );
    expect(
      screen.getByText("Only workspace administrators can manage AI settings."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Check agent access" }),
    ).toBeNull();
    expect(checkAiAgentAccess).not.toHaveBeenCalled();
  });

  it("requires an agent ID before enabling AI in agent mode", async () => {
    render(
      <MantineProvider env="test">
        <AiSettingsPage />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "AI mode" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "OpenAI Agent" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      screen.getByText(
        "Enter an agent ID before enabling AI with the agent backend.",
      ),
    ).toBeTruthy();
    expect(saveAiSettings).not.toHaveBeenCalled();
    expect(checkAiAgentAccess).not.toHaveBeenCalled();
  });

  it("opens only HTTPS external sources safely and rejects unsafe source URLs", async () => {
    mocks.settings.backend = "agent";
    mocks.settings.agentId = "agent-42";
    vi.mocked(generate).mockResolvedValue({
      answer: "Verified summary",
      sources: [
        {
          id: "safe",
          title: "Vendor site",
          url: "https://docs.vendor.test/reference",
        },
        {
          id: "unsafe",
          title: "Unsafe source",
          url: "javascript:alert(1)",
        },
      ],
    });
    render(
      <MantineProvider env="test">
        <MemoryRouter>
          <AiAssistantPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(
      screen.getByText(
        /only your question may be sent to the agent's configured public documentation MCPs/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /accessible private Docmost excerpts are sent separately to OpenAI in a tool-free composition/i,
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "Summarize this vendor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    const sourceLink = await screen.findByRole("link", {
      name: "[1] Vendor site",
    });
    expect(sourceLink.getAttribute("href")).toBe(
      "https://docs.vendor.test/reference",
    );
    expect(sourceLink.getAttribute("target")).toBe("_blank");
    expect(sourceLink.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByText("Unsafe source")).toBeNull();
    expect(generate).toHaveBeenCalledWith("ask", "Summarize this vendor");
  });
});
