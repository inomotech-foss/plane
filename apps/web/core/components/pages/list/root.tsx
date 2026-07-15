/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import type { TPageNavigationTabs } from "@plane/types";
// components
import { ListLayout } from "@/components/core/list";
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// local imports
import { PageListBlock } from "./block";

type TPagesListRoot = {
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

type TPageListTreeItem = {
  pageId: string;
  depth: number;
  childPageIdsByParentId: Map<string, string[]>;
  storeType: EPageStoreType;
  isMobile: boolean;
};

// A closed row placeholder MUST occupy real height: RenderIfVisible only
// applies its recorded height when `shouldRecordHeights` is on, so without a
// sized placeholder every off-screen row collapses to 0px, all of them
// "intersect" the viewport at once, and the whole branch mounts eagerly —
// defeating the virtualization entirely.
const pageRowPlaceholder = <div className="h-[52px] border-b border-subtle" />;

const PageListTreeItem = observer(function PageListTreeItem(props: TPageListTreeItem) {
  const { pageId, depth, childPageIdsByParentId, storeType, isMobile } = props;
  // store hooks
  const { isPageExpanded, togglePageExpanded } = usePageStore(storeType);
  // derived values
  const childPageIds = childPageIdsByParentId.get(pageId) ?? [];
  const isExpanded = isPageExpanded(pageId);

  return (
    <>
      {/* Only rows near the viewport mount the full (heavy) block — off-screen
          rows are height-matched placeholders, so expanding a large branch stays cheap. */}
      <RenderIfVisible
        defaultHeight="52px"
        verticalOffset={100}
        shouldRecordHeights={isMobile}
        placeholderChildren={pageRowPlaceholder}
      >
        <PageListBlock
          pageId={pageId}
          storeType={storeType}
          depth={depth}
          hasChildPages={childPageIds.length > 0}
          isExpanded={isExpanded}
          handleToggleExpanded={() => togglePageExpanded(pageId)}
        />
      </RenderIfVisible>
      {isExpanded &&
        childPageIds.map((childPageId) => (
          <PageListTreeItem
            key={childPageId}
            pageId={childPageId}
            depth={depth + 1}
            childPageIdsByParentId={childPageIdsByParentId}
            storeType={storeType}
            isMobile={isMobile}
          />
        ))}
    </>
  );
});

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { pageType, storeType } = props;
  // store hooks
  const { getCurrentProjectFilteredPageIdsByTab, getPageTreeStructureByTab, filters } = usePageStore(storeType);
  const { isMobile } = usePlatformOS();
  // derived values
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);
  const isSearchActive = filters.searchQuery.trim().length > 0;

  if (!filteredPageIds) return <></>;

  // while searching, render a flat list so that matches don't hide inside collapsed parents
  if (isSearchActive) {
    return (
      <ListLayout>
        {filteredPageIds.map((pageId) => (
          <RenderIfVisible
            key={pageId}
            defaultHeight="52px"
            verticalOffset={100}
            shouldRecordHeights={isMobile}
            placeholderChildren={pageRowPlaceholder}
          >
            <PageListBlock pageId={pageId} storeType={storeType} />
          </RenderIfVisible>
        ))}
      </ListLayout>
    );
  }

  // The parent/child grouping (and cycle safety net) lives in a memoized store
  // computedFn. It is invalidated only by data/filter/sort changes, NOT by
  // expand/collapse state, so toggling a node does not re-filter or re-sort the
  // whole page set here. Reading expand state is isolated to `PageListTreeItem`,
  // so a toggle only re-renders the affected row's subtree.
  const { rootPageIds, childPageIdsByParentId } = getPageTreeStructureByTab(pageType);

  return (
    <ListLayout>
      {rootPageIds.map((pageId) => (
        <PageListTreeItem
          key={pageId}
          pageId={pageId}
          depth={0}
          childPageIdsByParentId={childPageIdsByParentId}
          storeType={storeType}
          isMobile={isMobile}
        />
      ))}
    </ListLayout>
  );
});
