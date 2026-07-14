/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Mark, mergeAttributes } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

/** DOM attribute that carries the comment thread id on a highlighted range. */
export const COMMENT_MARK_DATA_ATTRIBUTE = "data-comment-thread-id";
/** DOM attribute flagging a highlighted range whose thread is resolved. */
export const COMMENT_MARK_RESOLVED_ATTRIBUTE = "data-comment-resolved";
/** Class applied to highlighted comment ranges (styled by the app). */
export const COMMENT_MARK_CLASS = "editor-comment-mark";

/**
 * DOM CustomEvents the app dispatches to mutate comment marks without holding a
 * direct editor command handle. Every mounted editor with the extension listens
 * and applies the change to its own document (no-op if the thread isn't there).
 */
export const EDITOR_COMMENT_RESOLVE_EVENT = "editor:page-comment:resolve";
export const EDITOR_COMMENT_UNSET_EVENT = "editor:page-comment:unset";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.COMMENT]: {
      /** Wrap the current selection in a comment mark for the given thread. */
      setCommentThread: (threadId: string) => ReturnType;
      /** Toggle the resolved styling of every mark matching the thread id. */
      setCommentThreadResolved: (threadId: string, resolved: boolean) => ReturnType;
      /** Remove every comment mark matching the given thread id from the document. */
      unsetCommentThread: (threadId: string) => ReturnType;
    };
  }
}

type TCommentMarkStorage = {
  handlers: (() => void) | null;
};

type TCommentMarkOptions = {
  HTMLAttributes: Record<string, unknown>;
};

/**
 * Inline mark that anchors a document comment thread to a text range.
 *
 * The `threadId` attribute matches the `anchor_id` of the PageComment thread
 * persisted in Postgres. Because the mark lives inside the ProseMirror/Yjs
 * document it travels with the text through edits and syncs between
 * collaborators for free, avoiding brittle character offsets.
 */
export const CommentMark = Mark.create<TCommentMarkOptions, TCommentMarkStorage>({
  name: CORE_EXTENSIONS.COMMENT,
  // A comment mark should not automatically extend as the user keeps typing
  // at its boundary.
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {
        class: COMMENT_MARK_CLASS,
      },
    };
  },

  addStorage() {
    return { handlers: null };
  },

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute(COMMENT_MARK_DATA_ATTRIBUTE),
        renderHTML: (attributes: { threadId: string | null }) => {
          if (!attributes.threadId) return {};
          return { [COMMENT_MARK_DATA_ATTRIBUTE]: attributes.threadId };
        },
      },
      resolved: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute(COMMENT_MARK_RESOLVED_ATTRIBUTE) === "true",
        renderHTML: (attributes: { resolved: boolean }) => {
          if (!attributes.resolved) return {};
          return { [COMMENT_MARK_RESOLVED_ATTRIBUTE]: "true" };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${COMMENT_MARK_DATA_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    const rewriteThreadMarks = (
      threadId: string,
      nextAttrs: { threadId: string; resolved: boolean } | null
    ) =>
      ({ state, dispatch, tr }: { state: any; dispatch: any; tr: any }) => {
        const markType = state.schema.marks[this.name];
        if (!markType) return false;
        let changed = false;
        state.doc.descendants((node: any, pos: number) => {
          if (!node.isText) return;
          const hasThread = node.marks.some(
            (mark: any) => mark.type === markType && mark.attrs.threadId === threadId
          );
          if (hasThread) {
            const from = pos;
            const to = pos + node.nodeSize;
            tr.removeMark(from, to, markType);
            if (nextAttrs) tr.addMark(from, to, markType.create(nextAttrs));
            changed = true;
          }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };

    return {
      setCommentThread:
        (threadId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId, resolved: false }),
      setCommentThreadResolved: (threadId: string, resolved: boolean) =>
        rewriteThreadMarks(threadId, { threadId, resolved }),
      unsetCommentThread: (threadId: string) => rewriteThreadMarks(threadId, null),
    };
  },

  onCreate() {
    if (typeof document === "undefined") return;
    const onResolve = (event: Event) => {
      if (!this.editor.isEditable) return;
      const detail = (event as CustomEvent).detail as { threadId?: string; resolved?: boolean };
      if (detail?.threadId !== undefined) {
        this.editor.commands.setCommentThreadResolved(detail.threadId, Boolean(detail.resolved));
      }
    };
    const onUnset = (event: Event) => {
      if (!this.editor.isEditable) return;
      const detail = (event as CustomEvent).detail as { threadId?: string };
      if (detail?.threadId) this.editor.commands.unsetCommentThread(detail.threadId);
    };
    document.addEventListener(EDITOR_COMMENT_RESOLVE_EVENT, onResolve);
    document.addEventListener(EDITOR_COMMENT_UNSET_EVENT, onUnset);
    this.storage.handlers = () => {
      document.removeEventListener(EDITOR_COMMENT_RESOLVE_EVENT, onResolve);
      document.removeEventListener(EDITOR_COMMENT_UNSET_EVENT, onUnset);
    };
  },

  onDestroy() {
    this.storage.handlers?.();
    this.storage.handlers = null;
  },
});
