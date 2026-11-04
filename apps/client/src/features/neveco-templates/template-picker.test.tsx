import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { generate } from "@/features/community-ai/api";
import NevecoTemplatePicker from "./template-picker";

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@/features/community-ai/api", () => ({
  getAiSettings: vi.fn(),
  generate: vi.fn(),
  aiError: () => "AI request failed",
}));

describe("Neveco template picker", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({
      data: { enabled: false, configured: false },
    } as any);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: new EventTarget(),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
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

  const setup = (connected = true, empty = true) => {
    const chain: any = {
      focus: vi.fn(() => chain),
      insertContent: vi.fn(() => chain),
      run: vi.fn(() => true),
    };
    const editor: any = {
      isDestroyed: false,
      isEditable: true,
      isEmpty: empty,
      chain: vi.fn(() => chain),
    };
    render(
      <MantineProvider env="test">
        <NevecoTemplatePicker editor={editor} connected={connected} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start with a Neveco template" }));
    return { chain, editor };
  };

  it("inserts structured starter content without requiring OpenAI", () => {
    const { chain } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Insert template" }));
    expect(chain.insertContent).toHaveBeenCalledOnce();
    const content = vi.mocked(chain.insertContent).mock.calls[0][0];
    expect(Array.isArray(content)).toBe(true);
    expect(JSON.stringify(content)).toContain("Document control");
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses insertion if a document is not empty or synced", () => {
    const { chain } = setup(false, true);
    expect((screen.getByRole("button", { name: "Insert template" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(chain.insertContent).not.toHaveBeenCalled();
  });

  it("generates a preview, then sanitises AI output on explicit insertion", async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { enabled: true, configured: true },
    } as any);
    vi.mocked(generate).mockResolvedValue({
      answer: "## Verified section\n\nSafe text <script>alert(1)</script>",
      sources: [],
    });
    const { chain } = setup();
    fireEvent.change(screen.getByLabelText("Technician notes or rough steps"), {
      target: { value: "Step 1: Check service status." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate draft with OpenAI" }));
    expect(generate).toHaveBeenCalledOnce();
    expect(chain.insertContent).not.toHaveBeenCalled();
    await screen.findByLabelText("AI draft preview");
    expect(chain.insertContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Insert reviewed draft" }));
    expect(chain.insertContent).toHaveBeenCalledOnce();
    const html = String(vi.mocked(chain.insertContent).mock.calls[0][0]);
    expect(html).toContain("Verified section");
    expect(html).not.toContain("<script");
  });
});
