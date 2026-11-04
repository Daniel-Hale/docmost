import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import GlobalSidebar from "./global-sidebar";

const pins = vi.hoisted(() => ({
  pinned: { id: "pin-1", name: "Procedures", slug: "procedures", logo: null },
  favorites: [
    {
      id: "fav-pin",
      space: {
        id: "pin-1",
        name: "Procedures",
        slug: "procedures",
        logo: null,
      },
    },
    {
      id: "fav-personal",
      space: {
        id: "personal-1",
        name: "Operations",
        slug: "operations",
        logo: null,
      },
    },
  ],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}));
vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtom: () => [false],
}));
vi.mock("@/components/layouts/global/hooks/atoms/sidebar-atom", () => ({
  mobileSidebarAtom: {},
}));
vi.mock("@/components/layouts/global/hooks/hooks/use-toggle-sidebar", () => ({
  useToggleSidebar: () => vi.fn(),
}));
vi.mock("@/features/favorite/queries/favorite-query", () => ({
  useFavoritesQuery: () => ({
    data: { pages: [{ items: pins.favorites }] },
    isPending: false,
  }),
}));
vi.mock("@/features/space/queries/global-pins-query", () => ({
  useGlobalPinsQuery: () => ({ data: { items: [pins.pinned] } }),
}));
vi.mock(
  "@/features/workspace/components/members/components/workspace-invite-form",
  () => ({
    WorkspaceInviteForm: () => null,
  }),
);
vi.mock("@/components/ui/custom-avatar", () => ({
  CustomAvatar: () => null,
}));

describe("global sidebar Company pins", () => {
  beforeEach(() => {
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
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows pins above personal favorites and deduplicates a pinned favorite", () => {
    render(
      <MantineProvider env="test">
        <MemoryRouter>
          <GlobalSidebar />
        </MemoryRouter>
      </MantineProvider>,
    );
    const pinnedHeading = screen.getByRole("heading", {
      name: "Pinned Companys",
    });
    const favoriteHeading = screen.getByRole("heading", {
      name: "Favorite spaces",
    });
    expect(
      pinnedHeading.compareDocumentPosition(favoriteHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText("Procedures")).toHaveLength(1);
    expect(screen.getByText("Operations")).toBeTruthy();
  });

  it("renders a separate Vendors navigation and vendor pin section", () => {
    const existing = pins.pinned;
    (pins as any).pinned = {
      id: "pin-vendor",
      name: "Example Vendor",
      slug: "example-vendor",
      logo: null,
      settings: { nevecoCategory: "vendor" },
    };
    try {
      render(
        <MantineProvider env="test">
          <MemoryRouter>
            <GlobalSidebar />
          </MemoryRouter>
        </MantineProvider>,
      );
      expect(screen.getByRole("link", { name: "Vendors" }).getAttribute("href")).toBe("/vendors");
      expect(screen.getByRole("heading", { name: "Pinned Vendors" })).toBeTruthy();
      expect(screen.getByText("Example Vendor")).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "Pinned Companys" })).toBeNull();
    } finally {
      (pins as any).pinned = existing;
    }
  });

  it("hides the personal section when every favorite is globally pinned", () => {
    const favorites = pins.favorites;
    pins.favorites = [favorites[0]];
    render(
      <MantineProvider env="test">
        <MemoryRouter>
          <GlobalSidebar />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(
      screen.queryByRole("heading", { name: "Favorite spaces" }),
    ).toBeNull();
    pins.favorites = favorites;
  });
});
