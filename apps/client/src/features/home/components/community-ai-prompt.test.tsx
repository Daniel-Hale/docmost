import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getAiSettings,
  generate,
  searchDocumentation,
} from "@/features/community-ai/api";
import CommunityAiPrompt from "./community-ai-prompt";
import Home from "@/pages/dashboard/home";
import AiAssistantPage from "@/features/community-ai/pages/ai-assistant";
import AiSettingsPage from "@/features/community-ai/pages/ai-settings";
import { saveAiSettings } from "@/features/community-ai/api";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock("@/features/community-ai/api", () => ({
  getAiSettings: vi.fn(),
  generate: vi.fn(),
  searchDocumentation: vi.fn(),
  getAiIndexStatus: vi.fn(),
  refreshAiIndex: vi.fn(),
  saveAiSettings: vi.fn(),
  aiError: () => "Request failed",
}));
vi.mock("@/features/space/components/space-carousel.tsx", () => ({
  default: () => <div>Companys carousel</div>,
}));
vi.mock("@/features/home/components/home-tabs", () => ({
  default: () => <div>Home tabs</div>,
}));
vi.mock("@/components/ui/document-title.tsx", () => ({
  DocumentTitle: () => null,
}));
vi.mock("@/components/ui/document-title", () => ({
  DocumentTitle: () => null,
}));
vi.mock("@/hooks/use-user-role", () => ({
  default: () => ({ isAdmin: true }),
}));

const renderWithApp = (ui: React.ReactNode, initialEntries = ["/"]) =>
  render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </MantineProvider>,
  );

describe("Home community AI prompt", () => {
  beforeEach(() => {
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
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("appears before the Companys carousel", () => {
    vi.mocked(useQuery).mockReturnValue({ data: { enabled: true } } as any);
    renderWithApp(<Home />);
    const prompt = screen.getByLabelText(
      "Ask a question about your documentation",
    );
    const carousel = screen.getByText("Companys carousel");
    expect(
      prompt.compareDocumentPosition(carousel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("passes the question in navigation state without sending it", () => {
    vi.mocked(useQuery).mockReturnValue({ data: { enabled: true } } as any);
    function Destination() {
      const location = useLocation();
      return <output>{JSON.stringify(location.state)}</output>;
    }
    renderWithApp(
      <Routes>
        <Route path="/" element={<CommunityAiPrompt />} />
        <Route path="/ai" element={<Destination />} />
      </Routes>,
    );
    fireEvent.change(
      screen.getByLabelText("Ask a question about your documentation"),
      {
        target: { value: "How does Vendor X work?" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(
      screen.getByText('{"question":"How does Vendor X work?"}'),
    ).toBeTruthy();
    expect(generate).not.toHaveBeenCalled();
  });

  it("offers keyless document search in search mode", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: { enabled: false } } as any);
    vi.mocked(searchDocumentation).mockResolvedValue({
      items: [
        {
          id: "page-1",
          title: "Vendor guide",
          url: "/s/example/p/vendor-guide",
          excerpt: "Approved vendor details",
          score: 0.9,
          kind: "hybrid",
        },
      ],
      mode: "hybrid",
    });
    renderWithApp(
      <Routes>
        <Route path="/ai" element={<AiAssistantPage />} />
      </Routes>,
      [
        {
          pathname: "/ai",
          state: { question: "vendor details", mode: "search" },
        } as any,
      ],
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Approved vendor details")).toBeTruthy();
    expect(searchDocumentation).toHaveBeenCalledWith("vendor details");
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps the prompt visible and links to settings when AI is disabled", () => {
    vi.mocked(useQuery).mockReturnValue({ data: { enabled: false } } as any);
    renderWithApp(<CommunityAiPrompt />);
    expect(
      screen.getByLabelText("Ask a question about your documentation"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Ask AI" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole("link", { name: "Configure AI" }).getAttribute("href"),
    ).toBe("/settings/ai");
  });

  it("allows semantic search opt-in alongside a newly entered key", () => {
    vi.mocked(useQuery).mockImplementation((options: any) =>
      options.queryKey[0] === "community-ai-index-status"
        ? ({ data: undefined } as any)
        : ({
            data: {
              enabled: true,
              configured: false,
              model: "gpt-5-mini",
              semanticEnabled: false,
              embeddingModel: "text-embedding-3-small",
            },
            isPending: false,
          } as any),
    );
    renderWithApp(<AiSettingsPage />);
    const semanticToggle = screen.getByRole("switch", {
      name: "Enable semantic search",
    }) as HTMLInputElement;
    expect(semanticToggle.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("OpenAI API key"), {
      target: { value: "new-key-entry" },
    });
    expect(semanticToggle.disabled).toBe(false);
  });

  it("prefills a validated navigation question without auto-submitting", () => {
    vi.mocked(useQuery).mockReturnValue({ data: { enabled: true } } as any);
    renderWithApp(
      <Routes>
        <Route path="/ai" element={<AiAssistantPage />} />
      </Routes>,
      [
        {
          pathname: "/ai",
          state: { question: "How does Vendor X work?" },
        } as any,
      ],
    );
    expect(
      (screen.getByLabelText("Question") as HTMLTextAreaElement).value,
    ).toBe("How does Vendor X work?");
    expect(generate).not.toHaveBeenCalled();
  });
});
