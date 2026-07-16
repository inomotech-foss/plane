/* eslint-disable no-extend-native -- jsdom has no layout engine; the tests stub element sizing */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { TPageNavigationTabs } from "@plane/types";
import type { TPageVisibleRow } from "@/store/pages/project-page.store";

const TOTAL_PAGES = 5000;
const VIEWPORT_HEIGHT = 600;
const ROW_HEIGHT = 52;

// simulate the worst case: one giant branch fully expanded, so the store reports
// every page as a visible row. Windowing must still render only a small window.
const visibleRows: TPageVisibleRow[] = Array.from({ length: TOTAL_PAGES }, (_, i) => ({
  pageId: `p${i}`,
  depth: 0,
  hasChildren: false,
}));

const mockStore = {
  getCurrentProjectFilteredPageIdsByTab: () => visibleRows.map((r) => r.pageId),
  getVisibleRows: () => visibleRows,
  isPageExpanded: () => false,
  togglePageExpanded: vi.fn(),
  filters: { searchQuery: "" },
};

// keep the test focused on windowing: stub the heavy per-row block and the
// scroll container, and avoid pulling in the real store/hooks graph.
vi.mock("@/hooks/store", () => ({
  EPageStoreType: { PROJECT: "PROJECT_PAGE" },
  usePageStore: () => mockStore,
}));

vi.mock("@/components/core/list", () => ({
  ListLayout: ({ children, containerRef }: { children: React.ReactNode; containerRef: React.Ref<HTMLDivElement> }) => (
    <div ref={containerRef} data-testid="scroll-container" style={{ height: VIEWPORT_HEIGHT, overflow: "auto" }}>
      {children}
    </div>
  ),
}));

vi.mock("./block", () => ({
  PageListBlock: ({ pageId }: { pageId: string }) => (
    <div data-testid="page-row" data-page-id={pageId} style={{ height: ROW_HEIGHT }} />
  ),
}));

// jsdom has no layout engine, so give the virtualizer a viewport and fixed row heights.
beforeAll(() => {
  // no-op observer: virtual-core reads the scroll rect synchronously from
  // offsetHeight, so the observer only needs to exist, not fire.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  // virtual-core measures via offsetWidth/offsetHeight, which jsdom reports as 0
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute("data-testid") === "scroll-container" ? VIEWPORT_HEIGHT : ROW_HEIGHT;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 400;
    },
  });
});

describe("PagesListRoot windowing", () => {
  it("renders only a viewport-sized window of rows for a huge page set", async () => {
    const { PagesListRoot } = await import("./root");
    const { container } = render(
      <PagesListRoot pageType={"public" as TPageNavigationTabs} storeType={mockStore as never} />
    );

    const renderedRows = container.querySelectorAll("[data-testid='page-row']").length;

    // the whole point: the DOM must not hold one node per page
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(100);
    expect(renderedRows).not.toBe(TOTAL_PAGES);
  });
});
