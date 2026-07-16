/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPageTreeStructure, TPageVisibleRow } from "./project-page.store";

/**
 * @description flatten a page tree into the ordered list of currently-visible rows.
 *
 * Walks the tree pre-order from the roots and descends into a node only when it
 * is expanded, so the result contains exactly the rows a fully-windowed view
 * needs to render. Cost is proportional to the number of visible rows, not to
 * the total number of pages. The walk is iterative so a pathologically deep
 * tree cannot overflow the stack.
 */
export function flattenVisibleTree(
  structure: TPageTreeStructure,
  expandedPageIds: Record<string, boolean>
): TPageVisibleRow[] {
  const { rootPageIds, childPageIdsByParentId } = structure;
  const rows: TPageVisibleRow[] = [];
  const stack: { pageId: string; depth: number }[] = [];
  for (let i = rootPageIds.length - 1; i >= 0; i--) stack.push({ pageId: rootPageIds[i], depth: 0 });
  while (stack.length > 0) {
    const { pageId, depth } = stack.pop() as { pageId: string; depth: number };
    const childIds = childPageIdsByParentId.get(pageId) ?? [];
    rows.push({ pageId, depth, hasChildren: childIds.length > 0 });
    if (childIds.length > 0 && expandedPageIds[pageId]) {
      for (let i = childIds.length - 1; i >= 0; i--) stack.push({ pageId: childIds[i], depth: depth + 1 });
    }
  }
  return rows;
}
