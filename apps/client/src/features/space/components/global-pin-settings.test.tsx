import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalPinSettings from "./global-pin-settings";

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  canManageSpace: true,
  mutate: vi.fn(),
  mutationError: null as Error | null,
}));

vi.mock("@/hooks/use-user-role", () => ({
  default: () => ({ isAdmin: mocks.isAdmin }),
}));
vi.mock("@/features/space/permissions/use-space-ability", () => ({
  useSpaceAbility: () => ({ can: () => mocks.canManageSpace }),
}));
vi.mock("@/features/space/queries/global-pins-query", () => ({
  useGlobalPinMutation: () => ({
    mutate: mocks.mutate,
    isPending: false,
    error: mocks.mutationError,
  }),
}));

const space = (globalPinned = false) =>
  ({
    id: "space-id",
    name: "Procedures",
    slug: "procedures",
    membership: { permissions: [] },
    settings: { globalPinned },
  }) as any;

describe("global Company pin settings", () => {
  beforeEach(() => {
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
    mocks.isAdmin = true;
    mocks.canManageSpace = true;
    mocks.mutationError = null;
    mocks.mutate.mockReset();
  });

  it("reads the saved global pin and persists changes", () => {
    mocks.mutate.mockImplementation((_value, callbacks) =>
      callbacks.onSuccess(),
    );
    render(
      <MantineProvider env="test">
        <GlobalPinSettings space={space(true)} />
      </MantineProvider>,
    );
    const toggle = screen.getByRole("switch", {
      name: "Pin for all staff",
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);
    expect(mocks.mutate).toHaveBeenCalledWith(
      { spaceId: "space-id", pinned: false },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(toggle.checked).toBe(false);
  });

  it("explains the Everyone group and surfaces mutation errors", () => {
    mocks.mutationError = Object.assign(
      new Error("Request failed with status code 400"),
      {
        response: {
          data: {
            message:
              "Share this Company with the Everyone group before pinning it for all staff.",
          },
        },
      },
    );
    render(
      <MantineProvider env="test">
        <GlobalPinSettings space={space()} />
      </MantineProvider>,
    );
    expect(
      screen.getByText(
        "Share with the Everyone group first. Existing page restrictions still apply.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Share this Company with the Everyone group before pinning it for all staff.",
      ),
    ).toBeTruthy();
  });

  it("hides the control unless the user is both workspace and space admin", () => {
    mocks.isAdmin = false;
    const { rerender } = render(
      <MantineProvider env="test">
        <GlobalPinSettings space={space()} />
      </MantineProvider>,
    );
    expect(screen.queryByRole("switch")).toBeNull();

    mocks.isAdmin = true;
    mocks.canManageSpace = false;
    rerender(
      <MantineProvider env="test">
        <GlobalPinSettings space={space()} />
      </MantineProvider>,
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
