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
};

const PageListTreeItem = observer(function PageListTreeItem(props: TPageListTreeItem) {
  const { pageId, depth, childPageIdsByParentId, storeType } = props;
  // store hooks
  const { isPageExpanded, togglePageExpanded } = usePageStore(storeType);
  // derived values
  const childPageIds = childPageIdsByParentId.get(pageId) ?? [];
  const isExpanded = isPageExpanded(pageId);

  return (
    <>
      <PageListBlock
        pageId={pageId}
        storeType={storeType}
        depth={depth}
        hasChildPages={childPageIds.length > 0}
        isExpanded={isExpanded}
        handleToggleExpanded={() => togglePageExpanded(pageId)}
      />
      {isExpanded &&
        childPageIds.map((childPageId) => (
          <PageListTreeItem
            key={childPageId}
            pageId={childPageId}
            depth={depth + 1}
            childPageIdsByParentId={childPageIdsByParentId}
            storeType={storeType}
          />
        ))}
    </>
  );
});

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { pageType, storeType } = props;
  // store hooks
  const { getCurrentProjectFilteredPageIdsByTab, getPageById, filters } = usePageStore(storeType);
  // derived values
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);
  const isSearchActive = filters.searchQuery.trim().length > 0;

  if (!filteredPageIds) return <></>;

  // while searching, render a flat list so that matches don't hide inside collapsed parents
  if (isSearchActive) {
    return (
      <ListLayout>
        {filteredPageIds.map((pageId) => (
          <PageListBlock key={pageId} pageId={pageId} storeType={storeType} />
        ))}
      </ListLayout>
    );
  }

  // group the sorted page ids by their parent, preserving the applied sort order among siblings.
  // pages whose parent is not part of the current result set are treated as roots so that
  // filtered tabs still show them.
  const filteredPageIdsSet = new Set(filteredPageIds);
  const rootPageIds: string[] = [];
  const childPageIdsByParentId = new Map<string, string[]>();
  for (const pageId of filteredPageIds) {
    const parentId = getPageById(pageId)?.parent;
    if (parentId && parentId !== pageId && filteredPageIdsSet.has(parentId)) {
      const siblingIds = childPageIdsByParentId.get(parentId);
      if (siblingIds) siblingIds.push(pageId);
      else childPageIdsByParentId.set(parentId, [pageId]);
    } else {
      rootPageIds.push(pageId);
    }
  }

  // safety net for malformed data: pages caught in a parent cycle are unreachable from any
  // root, so promote them to roots instead of silently hiding them.
  const reachablePageIds = new Set<string>();
  const idsToVisit = [...rootPageIds];
  while (idsToVisit.length > 0) {
    const pageId = idsToVisit.pop();
    if (!pageId || reachablePageIds.has(pageId)) continue;
    reachablePageIds.add(pageId);
    idsToVisit.push(...(childPageIdsByParentId.get(pageId) ?? []));
  }
  if (reachablePageIds.size < filteredPageIds.length) {
    for (const pageId of filteredPageIds) {
      if (reachablePageIds.has(pageId)) continue;
      rootPageIds.push(pageId);
      // detach the promoted page from its parent to break the cycle while rendering
      const parentId = getPageById(pageId)?.parent;
      if (parentId) {
        const siblingIds = childPageIdsByParentId.get(parentId);
        if (siblingIds) {
          childPageIdsByParentId.set(
            parentId,
            siblingIds.filter((siblingId) => siblingId !== pageId)
          );
        }
      }
    }
  }

  return (
    <ListLayout>
      {rootPageIds.map((pageId) => (
        <PageListTreeItem
          key={pageId}
          pageId={pageId}
          depth={0}
          childPageIdsByParentId={childPageIdsByParentId}
          storeType={storeType}
        />
      ))}
    </ListLayout>
  );
});
