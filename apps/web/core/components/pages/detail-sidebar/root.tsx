/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
// plane imports
import { EPageAccess } from "@plane/constants";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TPageNavigationTabs } from "@plane/types";
import { cn, getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";

const SIDEBAR_WIDTH = 260;
const ROW_HEIGHT = 30;
const ROW_OVERSCAN = 10;
const COLLAPSE_STORAGE_KEY = "page_details_tree_collapsed";

const storeType = EPageStoreType.PROJECT;

type TTreeRowProps = {
  pageId: string;
  depth: number;
  hasChildren: boolean;
  isActive: boolean;
  href: string;
};

const PageTreeRow = observer(function PageTreeRow(props: TTreeRowProps) {
  const { pageId, depth, hasChildren, isActive, href } = props;
  // router
  const router = useAppRouter();
  // store hooks
  const { getPageById, isPageExpanded, togglePageExpanded } = usePageStore(storeType);
  // derived values
  const page = getPageById(pageId);
  const isExpanded = isPageExpanded(pageId);

  if (!page) return null;
  const pageName = getPageName(page.name);

  return (
    <button
      type="button"
      className={cn(
        "flex h-[30px] w-full cursor-pointer items-center gap-1 rounded-sm pr-2 text-13",
        isActive ? "bg-layer-1 font-medium text-primary" : "text-secondary hover:bg-layer-transparent-hover"
      )}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
      onClick={() => router.push(href)}
    >
      {hasChildren ? (
        <span
          role="button"
          tabIndex={0}
          className="grid size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-primary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePageExpanded(pageId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              togglePageExpanded(pageId);
            }
          }}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={cn("size-3.5 transition-transform duration-200", { "rotate-90": isExpanded })} />
        </span>
      ) : (
        <span aria-hidden className="size-5 flex-shrink-0" />
      )}
      <span className="flex size-4 flex-shrink-0 items-center justify-center">
        {page.logo_props?.in_use ? (
          <Logo logo={page.logo_props} size={14} type="lucide" />
        ) : (
          <PageIcon className="size-3.5 text-tertiary" />
        )}
      </span>
      <Tooltip tooltipContent={pageName} openDelay={500}>
        <span className="truncate">{pageName}</span>
      </Tooltip>
    </button>
  );
});

export const PageDetailsTreeSidebar = observer(function PageDetailsTreeSidebar() {
  // router
  const { workspaceSlug, projectId, pageId } = useParams();
  const currentPageId = pageId?.toString() ?? "";
  // store hooks
  const { getVisibleRows, getPageById, getPageAncestorIds, expandPages } = usePageStore(storeType);
  // local storage
  const { storedValue: storedCollapsed, setValue: setStoredCollapsed } = useLocalStorage<boolean>(
    COLLAPSE_STORAGE_KEY,
    false
  );
  const isCollapsed = !!storedCollapsed;
  // refs
  const scrollRef = useRef<HTMLDivElement>(null);
  // derived values
  const currentPage = getPageById(currentPageId);
  const pageType: TPageNavigationTabs = currentPage?.archived_at
    ? "archived"
    : currentPage?.access === EPageAccess.PRIVATE
      ? "private"
      : "public";
  const rows = getVisibleRows(pageType);

  // reveal the current page in the tree whenever navigation lands on it; keyed
  // on the chain itself so it re-runs once the pages list finishes loading
  const ancestorIdsKey = currentPageId ? getPageAncestorIds(currentPageId).join(",") : "";
  useEffect(() => {
    if (ancestorIdsKey) expandPages(ancestorIdsKey.split(","));
  }, [ancestorIdsKey, expandPages]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    getItemKey: (index) => rows[index]?.pageId ?? index,
  });

  // keep the current page in view when it changes
  const currentRowIndex = rows.findIndex((row) => row.pageId === currentPageId);
  useEffect(() => {
    if (currentRowIndex >= 0 && !isCollapsed) virtualizer.scrollToIndex(currentRowIndex, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageId, currentRowIndex >= 0, isCollapsed]);

  if (isCollapsed) {
    return (
      <div className="flex h-full flex-shrink-0 flex-col items-center border-r border-subtle bg-surface-1 px-1 py-3">
        <button
          type="button"
          className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-primary"
          onClick={() => setStoredCollapsed(false)}
          aria-label="Show page tree"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-shrink-0 flex-col border-r border-subtle bg-surface-1"
      style={{ width: `${SIDEBAR_WIDTH}px` }}
    >
      <div className="flex flex-shrink-0 items-center justify-between px-3 py-2.5">
        <span className="text-11 font-semibold text-tertiary uppercase">Pages</span>
        <button
          type="button"
          className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-primary"
          onClick={() => setStoredCollapsed(true)}
          aria-label="Hide page tree"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <div ref={scrollRef} className="vertical-scrollbar scrollbar-sm h-full overflow-y-auto px-2 pb-4">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) return null;
            return (
              <div
                key={virtualItem.key}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)`, height: `${ROW_HEIGHT}px` }}
              >
                <PageTreeRow
                  pageId={row.pageId}
                  depth={row.depth}
                  hasChildren={row.hasChildren}
                  isActive={row.pageId === currentPageId}
                  href={`/${workspaceSlug}/projects/${projectId}/pages/${row.pageId}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
