import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditorAssist from "./editor-assist";
import { generate } from "./api";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { enabled: true } }),
}));
vi.mock("./api", () => ({
  getAiSettings: vi.fn(),
  generate: vi.fn(),
  aiError: () => "Request failed",
}));

describe("AI writing requires explicit, safe application", () => {
  beforeEach(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: new EventTarget(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    vi.mocked(generate).mockResolvedValue({
      answer: "A clear suggestion",
      sources: [],
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  const setup = (sameDocument = true, text = "Original text") => {
    const chain: any = {
      focus: vi.fn(() => chain),
      insertContentAt: vi.fn(() => chain),
      run: vi.fn(),
    };
    const editor: any = {
      isEditable: true,
      state: {
        selection: { from: 4, to: 17 },
        doc: { textBetween: () => text, eq: () => sameDocument },
      },
      chain: () => chain,
    };
    render(
      <MantineProvider env="test">
        <EditorAssist editor={editor} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "AI writing" }));
    return { editor, chain };
  };
  it("does not edit until Apply is clicked", async () => {
    const { chain } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    const apply = await screen.findByRole("button", {
      name: "Apply suggestion",
    });
    expect(chain.insertContentAt).not.toHaveBeenCalled();
    fireEvent.click(apply);
    expect(chain.insertContentAt).toHaveBeenCalledWith({ from: 4, to: 17 }, [
      {
        type: "paragraph",
        content: [{ type: "text", text: "A clear suggestion" }],
      },
    ]);
  });
  it("refuses to overwrite a document changed by another editor", async () => {
    const { chain } = setup(false);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Apply suggestion" }),
    );
    expect(chain.insertContentAt).not.toHaveBeenCalled();
    expect(screen.getByText(/The document changed/)).toBeTruthy();
  });
  it("does not silently truncate a selection and replace its full range", () => {
    const { chain } = setup(true, "x".repeat(12001));
    expect(screen.getByText(/Select less than 12,000/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(chain.insertContentAt).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
