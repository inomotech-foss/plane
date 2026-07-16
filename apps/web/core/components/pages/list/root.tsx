/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { useVirtualizer } from "@tanstack/react-virtual";
// types
import type { TPageNavigationTabs } from "@plane/types";
// components
import { ListLayout } from "@/components/core/list";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// store
import type { TPageVisibleRow } from "@/store/pages/project-page.store";
// local imports
import { PageListBlock } from "./block";

type TPagesListRoot = {
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

// rows are min-h-[52px]; this is only the initial estimate, real heights are measured.
const ESTIMATED_ROW_HEIGHT = 52;
const ROW_OVERSCAN = 5;

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { pageType, storeType } = props;
  // store hooks
  const { getCurrentProjectFilteredPageIdsByTab, getVisibleRows, isPageExpanded, togglePageExpanded, filters } =
    usePageStore(storeType);
  // refs
  const scrollRef = useRef<HTMLDivElement>(null);
  // derived values
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);
  const isSearchActive = filters.searchQuery.trim().length > 0;

  // While searching, render a flat list so matches don't hide inside collapsed
  // parents. Otherwise render the flattened, currently-visible tree rows. Both
  // are windowed: only the rows near the viewport mount, so cost stays
  // proportional to the viewport, not to the total number of pages.
  const rows: TPageVisibleRow[] = !filteredPageIds
    ? []
    : isSearchActive
      ? filteredPageIds.map((pageId) => ({ pageId, depth: 0, hasChildren: false }))
      : getVisibleRows(pageType);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    getItemKey: (index) => rows[index]?.pageId ?? index,
  });

  if (!filteredPageIds) return <></>;

  return (
    <ListLayout containerRef={scrollRef}>
      <div className="relative w-full shrink-0" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) return null;
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <PageListBlock
                pageId={row.pageId}
                storeType={storeType}
                depth={isSearchActive ? undefined : row.depth}
                hasChildPages={row.hasChildren}
                isExpanded={isPageExpanded(row.pageId)}
                handleToggleExpanded={() => togglePageExpanded(row.pageId)}
              />
            </div>
          );
        })}
      </div>
    </ListLayout>
  );
});
