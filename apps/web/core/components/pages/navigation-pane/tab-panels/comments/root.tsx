/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { stringToEmoji } from "@plane/propel/emoji-icon-picker";
import { EmojiReactionGroup, EmojiReactionPicker } from "@plane/propel/emoji-reaction";
import type { EmojiReactionType } from "@plane/propel/emoji-reaction";
import { ScrollArea } from "@plane/propel/scrollarea";
import { EFileAssetType } from "@plane/types";
import type { TPageComment } from "@plane/types";
import { cn, isCommentEmpty, renderFormattedDate } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser } from "@/hooks/store/user";
// services
import { FileService } from "@/services/file.service";
// store
import { PageCommentStore } from "@/store/pages/page-comment.store";
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { consumePendingCommentThread } from "./pending-thread";

const fileService = new FileService();

type Props = {
  page: TPageInstance;
};

const EMPTY_COMMENT_HTML = "<p></p>";

/** Scroll the editor to the highlighted range for a thread and flash it. */
function scrollToAnchor(anchorId: string | null): void {
  if (!anchorId || typeof document === "undefined") return;
  const node = document.querySelector<HTMLElement>(`[${COMMENT_MARK_DATA_ATTRIBUTE}="${anchorId}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("editor-comment-mark--active");
  setTimeout(() => node.classList.remove("editor-comment-mark--active"), 1600);
}

/** Read-only render of a comment's HTML so mentions and formatting display. */
const CommentBody = observer(function CommentBody(props: { commentId: string; html: string | null | undefined }) {
  const { commentId, html } = props;
  const { workspaceSlug, projectId } = useParams();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(String(workspaceSlug))?.id ?? "";

  return (
    <LiteTextEditor
      editable={false}
      id={`page-comment-${commentId}`}
      workspaceId={workspaceId}
      workspaceSlug={String(workspaceSlug)}
      projectId={projectId ? String(projectId) : undefined}
      initialValue={html || EMPTY_COMMENT_HTML}
      containerClassName="border-none p-0"
      editorClassName="!p-0"
      displayConfig={{ fontSize: "small-font" }}
    />
  );
});

type ComposerProps = {
  placeholder: string;
  /** Creates the comment and returns it so uploaded assets can be associated. */
  createComment: (html: string) => Promise<TPageComment | undefined>;
  /** Called after the comment and its assets are saved (e.g. to close the composer). */
  onSuccess?: () => void;
  onCancel?: () => void;
};

const CommentComposer = observer(function CommentComposer(props: ComposerProps) {
  const { placeholder, createComment, onSuccess, onCancel } = props;
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const { getWorkspaceBySlug } = useWorkspace();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceId = getWorkspaceBySlug(String(workspaceSlug))?.id ?? "";
  const editorRef = useRef<EditorRefApi>(null);
  // Images are uploaded before the comment exists; associate them once it does.
  const uploadedAssetIds = useRef<string[]>([]);
  const [value, setValue] = useState(EMPTY_COMMENT_HTML);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isCommentEmpty(value) || submitting) return;
    setSubmitting(true);
    try {
      const comment = await createComment(value);
      if (comment && uploadedAssetIds.current.length > 0) {
        await fileService.updateBulkProjectAssetsUploadStatus(String(workspaceSlug), String(projectId), comment.id, {
          asset_ids: uploadedAssetIds.current,
        });
        uploadedAssetIds.current = [];
      }
      editorRef.current?.clearEditor();
      setValue(EMPTY_COMMENT_HTML);
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <LiteTextEditor
        editable
        variant="lite"
        id={`page-comment-composer-${String(projectId)}`}
        workspaceId={workspaceId}
        workspaceSlug={String(workspaceSlug)}
        projectId={projectId ? String(projectId) : undefined}
        ref={editorRef}
        // initialValue feeds the wrapper's isEmpty (submit-button gating); value stays
        // constant so the editor doesn't re-sync content (and reset the cursor) on every keystroke.
        initialValue={value}
        value={EMPTY_COMMENT_HTML}
        placeholder={placeholder}
        onChange={(_json, html) => setValue(html)}
        onEnterKeyPress={() => void handleSubmit()}
        isSubmitting={submitting}
        uploadFile={async (blockId, file) => {
          const { asset_id } = await uploadEditorAsset({
            blockId,
            data: { entity_identifier: "", entity_type: EFileAssetType.PAGE_COMMENT_DESCRIPTION },
            file,
            projectId: String(projectId),
            workspaceSlug: String(workspaceSlug),
          });
          uploadedAssetIds.current.push(asset_id);
          return asset_id;
        }}
        duplicateFile={async (assetId) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityType: EFileAssetType.PAGE_COMMENT_DESCRIPTION,
            projectId: String(projectId),
            workspaceSlug: String(workspaceSlug),
          });
          uploadedAssetIds.current.push(asset_id);
          return asset_id;
        }}
        displayConfig={{ fontSize: "small-font" }}
      />
      {onCancel && (
        <div className="flex items-center justify-end">
          <button type="button" className="text-xs text-secondary hover:text-primary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
});

type CommentReactionsProps = {
  store: PageCommentStore;
  comment: TPageComment;
};

/** Emoji reactions on a page comment, backed by the page-comment reactions API. */
const CommentReactions = observer(function CommentReactions(props: CommentReactionsProps) {
  const { store, comment } = props;
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const reaction of comment.comment_reactions ?? []) {
      (map[reaction.reaction] ??= []).push(reaction.actor ?? "");
    }
    return map;
  }, [comment.comment_reactions]);

  const userReactionCodes = useMemo(() => {
    const codes = new Set<string>();
    if (currentUser) {
      for (const code of Object.keys(grouped)) if (grouped[code].includes(currentUser.id)) codes.add(code);
    }
    return codes;
  }, [grouped, currentUser]);

  const reactions: EmojiReactionType[] = useMemo(
    () =>
      Object.keys(grouped).map((code) => ({
        emoji: stringToEmoji(code),
        count: grouped[code].length,
        reacted: userReactionCodes.has(code),
        users: grouped[code].flatMap((id) => {
          const name = getUserDetails(id)?.display_name;
          return name ? [name] : [];
        }),
      })),
    [grouped, userReactionCodes, getUserDetails]
  );

  const toggle = (code: string) => {
    if (!currentUser) return;
    if (userReactionCodes.has(code)) void store.removeReaction(comment.id, code, currentUser.id);
    else void store.addReaction(comment.id, code);
  };

  if (!currentUser) return null;

  return (
    <div className="relative mt-1.5">
      <EmojiReactionPicker
        isOpen={isPickerOpen}
        handleToggle={setIsPickerOpen}
        onChange={(emoji) => toggle(emoji)}
        label={
          <EmojiReactionGroup
            reactions={reactions}
            onReactionClick={(emoji) =>
              toggle(
                Array.from(emoji)
                  .map((char) => char.codePointAt(0))
                  .join("-")
              )
            }
            showAddButton
            onAddReaction={() => setIsPickerOpen(true)}
          />
        }
        placement="bottom-start"
      />
    </div>
  );
});

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
      document.dispatchEvent(new CustomEvent(EDITOR_COMMENT_UNSET_EVENT, { detail: { threadId: thread.anchor_id } }));
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
        className="flex w-full items-center justify-between text-left"
        onClick={() => scrollToAnchor(thread.anchor_id)}
      >
        <span className="text-xs font-medium text-primary">{authorName(thread)}</span>
        <span className="text-[10px] text-tertiary">{renderFormattedDate(thread.created_at)}</span>
      </button>
      <CommentBody commentId={thread.id} html={thread.comment_html} />
      <CommentReactions store={store} comment={thread} />

      {replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-l border-subtle pl-2.5">
          {replies.map((reply) => (
            <div key={reply.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">{authorName(reply)}</span>
                <span className="text-[10px] text-tertiary">{renderFormattedDate(reply.created_at)}</span>
              </div>
              <CommentBody commentId={reply.id} html={reply.comment_html} />
              <CommentReactions store={store} comment={reply} />
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
          className="text-xs flex items-center gap-1 text-secondary hover:text-primary"
          onClick={() => void handleResolve()}
        >
          {thread.is_resolved ? <RotateCcw className="size-3" /> : <Check className="size-3" />}
          {thread.is_resolved
            ? t("page_navigation_pane.tabs.comments.unresolve")
            : t("page_navigation_pane.tabs.comments.resolve")}
        </button>
        <button
          type="button"
          className="hover:text-danger ml-auto text-tertiary"
          aria-label={t("common.delete")}
          onClick={() => void handleDelete()}
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {showReply && (
        <div className="mt-2">
          <CommentComposer
            placeholder={t("page_navigation_pane.tabs.comments.reply_placeholder")}
            createComment={(html) => store.createReply(thread.id, html)}
            onSuccess={() => setShowReply(false)}
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

  const threads = store.threads.filter((thread) => (filter === "resolved" ? thread.is_resolved : !thread.is_resolved));
  const unresolvedCount = store.threads.filter((thread) => !thread.is_resolved).length;
  const resolvedCount = store.threads.filter((thread) => thread.is_resolved).length;

  const cancelPending = () => {
    if (pendingThreadId) {
      document.dispatchEvent(new CustomEvent(EDITOR_COMMENT_UNSET_EVENT, { detail: { threadId: pendingThreadId } }));
    }
    consumePendingCommentThread();
    setPendingThreadId(null);
  };

  return (
    <div className="flex h-full flex-col px-3.5">
      <div className="text-xs mb-2 flex items-center gap-1">
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
        <div className="border-accent-primary/40 mb-2 rounded-md border bg-surface-1 p-2.5">
          <CommentComposer
            placeholder={t("page_navigation_pane.tabs.comments.composer_placeholder")}
            createComment={(html) => store.createThread(pendingThreadId, html)}
            onSuccess={() => {
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
