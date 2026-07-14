/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Bridges the editor "create comment" action and the comments panel.
 *
 * When the user picks "Comment" in the editor selection menu, the mark is
 * applied to the document and a thread id is generated, but the thread has no
 * content yet. The page root stashes that id here and opens the comments tab;
 * the panel consumes it to show a composer for the new thread.
 */
let pendingThreadId: string | null = null;

export const setPendingCommentThread = (threadId: string | null): void => {
  pendingThreadId = threadId;
};

export const consumePendingCommentThread = (): string | null => {
  const value = pendingThreadId;
  pendingThreadId = null;
  return value;
};
