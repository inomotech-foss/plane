/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Check, MessageSquareText, RotateCcw, Trash2 } from "lucide-react";
// plane imports
import {
  COMMENT_MARK_DATA_ATTRIBUTE,
  EDITOR_COMMENT_CREATE_EVENT,
  EDITOR_COMMENT_RESOLVE_EVENT,
  EDITOR_COMMENT_UNSET_EVENT,
} from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { ScrollArea } from "@plane/propel/scrollarea";
import type { TPageComment } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// store
import { PageCommentStore } from "@/store/pages/page-comment.store";
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { consumePendingCommentThread } from "./pending-thread";

type Props = {
  page: TPageInstance;
};

/** Escape user text and wrap it as a paragraph for the sanitized comment_html. */
function toCommentHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
  return `<p>${escaped.replace(/\n/g, "<br />")}</p>`;
}

/** Scroll the editor to the highlighted range for a thread and flash it. */
function scrollToAnchor(anchorId: string | null): void {
  if (!anchorId || typeof document === "undefined") return;
  const node = document.querySelector<HTMLElement>(`[${COMMENT_MARK_DATA_ATTRIBUTE}="${anchorId}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("editor-comment-mark--active");
  setTimeout(() => node.classList.remove("editor-comment-mark--active"), 1600);
}

type ComposerProps = {
  placeholder: string;
  submitLabel: string;
  onSubmit: (html: string) => Promise<void>;
  onCancel?: () => void;
  focusOnMount?: boolean;
};

const CommentComposer = function CommentComposer(props: ComposerProps) {
  const { placeholder, submitLabel, onSubmit, onCancel, focusOnMount } = props;
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(toCommentHtml(value));
      setValue("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={focusOnMount}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
        rows={2}
        className="w-full resize-none rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-sm outline-none focus:border-accent-primary"
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" className="text-xs text-secondary hover:text-primary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
        <button
          type="button"
          disabled={!value.trim() || submitting}
          className="rounded-md bg-accent-primary px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          onClick={() => void handleSubmit()}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

type ThreadCardProps = {
  store: PageCommentStore;
  thread: TPageComment;
};

const ThreadCard = observer(function ThreadCard(props: ThreadCardProps) {
  const { store, thread } = props;
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const [showReply, setShowReply] = useState(false);
  const replies = store.repliesForThread(thread.id);

  const authorName = (comment: TPageComment) =>
    getUserDetails(comment.actor ?? "")?.display_name || comment.actor_detail?.display_name || "";

  const handleResolve = async () => {
    const nextResolved = !thread.is_resolved;
    await store.resolveThread(thread.id, nextResolved);
    if (thread.anchor_id) {
      document.dispatchEvent(
        new CustomEvent(EDITOR_COMMENT_RESOLVE_EVENT, {
          detail: { threadId: thread.anchor_id, resolved: nextResolved },
        })
      );
    }
  };

  const handleDelete = async () => {
    await store.removeComment(thread.id);
    if (thread.anchor_id) {
      document.dispatchEvent(
        new CustomEvent(EDITOR_COMMENT_UNSET_EVENT, { detail: { threadId: thread.anchor_id } })
      );
    }
  };

  return (
    <div
      className={cn("rounded-md border border-subtle bg-surface-1 p-2.5", {
        "opacity-70": thread.is_resolved,
      })}
    >
      <button
        type="button"
        className="flex w-full flex-col items-start gap-1 text-left"
        onClick={() => scrollToAnchor(thread.anchor_id)}
      >
        <div className="flex w-full items-center justify-between">
          <span className="text-xs font-medium text-primary">{authorName(thread)}</span>
          <span className="text-[10px] text-tertiary">{renderFormattedDate(thread.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-secondary">{thread.comment_stripped}</p>
      </button>

      {replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-l border-subtle pl-2.5">
          {replies.map((reply) => (
            <div key={reply.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">{authorName(reply)}</span>
                <span className="text-[10px] text-tertiary">{renderFormattedDate(reply.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-secondary">{reply.comment_stripped}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          className="text-xs text-secondary hover:text-primary"
          onClick={() => setShowReply((prev) => !prev)}
        >
          {t("page_navigation_pane.tabs.comments.reply")}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-secondary hover:text-primary"
          onClick={() => void handleResolve()}
        >
          {thread.is_resolved ? <RotateCcw className="size-3" /> : <Check className="size-3" />}
          {thread.is_resolved
            ? t("page_navigation_pane.tabs.comments.unresolve")
            : t("page_navigation_pane.tabs.comments.resolve")}
        </button>
        <button
          type="button"
          className="ml-auto text-tertiary hover:text-danger"
          aria-label={t("common.delete")}
          onClick={() => void handleDelete()}
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {showReply && (
        <div className="mt-2">
          <CommentComposer
            focusOnMount
            placeholder={t("page_navigation_pane.tabs.comments.reply_placeholder")}
            submitLabel={t("page_navigation_pane.tabs.comments.reply")}
            onSubmit={async (html) => {
              await store.createReply(thread.id, html);
              setShowReply(false);
            }}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}
    </div>
  );
});

export const PageNavigationPaneCommentsTabPanel = observer(function PageNavigationPaneCommentsTabPanel(props: Props) {
  const { page } = props;
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const [filter, setFilter] = useState<"unresolved" | "resolved">("unresolved");
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);

  const store = useMemo(
    () => new PageCommentStore(String(workspaceSlug), String(projectId), String(page.id)),
    [workspaceSlug, projectId, page.id]
  );

  useEffect(() => {
    void store.fetch();
  }, [store]);

  // Pick up a thread just created from the editor selection menu.
  useEffect(() => {
    const initial = consumePendingCommentThread();
    if (initial) setPendingThreadId(initial);
    const onCreate = (event: Event) => {
      const threadId = (event as CustomEvent).detail?.threadId;
      if (threadId) setPendingThreadId(threadId);
    };
    document.addEventListener(EDITOR_COMMENT_CREATE_EVENT, onCreate);
    return () => document.removeEventListener(EDITOR_COMMENT_CREATE_EVENT, onCreate);
  }, []);

  const threads = store.threads.filter((thread) =>
    filter === "resolved" ? thread.is_resolved : !thread.is_resolved
  );
  const unresolvedCount = store.threads.filter((thread) => !thread.is_resolved).length;
  const resolvedCount = store.threads.filter((thread) => thread.is_resolved).length;

  const cancelPending = () => {
    if (pendingThreadId) {
      document.dispatchEvent(
        new CustomEvent(EDITOR_COMMENT_UNSET_EVENT, { detail: { threadId: pendingThreadId } })
      );
    }
    consumePendingCommentThread();
    setPendingThreadId(null);
  };

  return (
    <div className="flex h-full flex-col px-3.5">
      <div className="mb-2 flex items-center gap-1 text-xs">
        {(["unresolved", "resolved"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn("rounded-md px-2 py-1 transition-colors", {
              "bg-layer-1 text-primary": filter === key,
              "text-secondary hover:text-primary": filter !== key,
            })}
          >
            {key === "unresolved"
              ? `${t("page_navigation_pane.tabs.comments.unresolved")} (${unresolvedCount})`
              : `${t("page_navigation_pane.tabs.comments.resolved")} (${resolvedCount})`}
          </button>
        ))}
      </div>

      {pendingThreadId && (
        <div className="mb-2 rounded-md border border-accent-primary/40 bg-surface-1 p-2.5">
          <CommentComposer
            focusOnMount
            placeholder={t("page_navigation_pane.tabs.comments.composer_placeholder")}
            submitLabel={t("page_navigation_pane.tabs.comments.comment")}
            onSubmit={async (html) => {
              await store.createThread(pendingThreadId, html);
              consumePendingCommentThread();
              setPendingThreadId(null);
            }}
            onCancel={cancelPending}
          />
        </div>
      )}

      <ScrollArea className="flex-1">
        {threads.length === 0 && !pendingThreadId ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-secondary">
            <MessageSquareText className="size-6 text-tertiary" />
            <p className="text-sm">{t("page_navigation_pane.tabs.comments.empty_state.title")}</p>
            <p className="text-xs text-tertiary">{t("page_navigation_pane.tabs.comments.empty_state.description")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-6">
            {threads.map((thread) => (
              <ThreadCard key={thread.id} store={store} thread={thread} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});
