/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import type { TPageComment, TPageCommentMap } from "@plane/types";
// services
import { PageCommentService } from "@/services/page";

export type TPageCommentLoader = "init" | "mutate" | undefined;

// Array#toSorted is available at runtime but not in the web tsconfig lib
// (ES2022), so type it locally to keep the immutable, copy-free sort.
type Immutable<T> = { toSorted(compareFn: (a: T, b: T) => number): T[] };

/** Return a new array of comments ordered oldest-first by creation time. */
function byCreatedAtAsc(comments: TPageComment[]): TPageComment[] {
  return (comments as unknown as Immutable<TPageComment>).toSorted(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/**
 * Store for a single page's document/inline comment threads.
 *
 * Threads (top-level, `parent === null`) and their replies are kept in one flat
 * map keyed by comment id; helpers derive the thread list and per-thread
 * replies. Anchoring (which text range a thread belongs to) lives in the editor
 * document via the comment mark's `threadId` === thread `anchor_id`.
 */
export class PageCommentStore {
  loader: TPageCommentLoader = "init";
  // commentId -> comment
  commentMap: TPageCommentMap = {};

  workspaceSlug: string;
  projectId: string;
  pageId: string;
  service: PageCommentService;

  constructor(workspaceSlug: string, projectId: string, pageId: string) {
    this.workspaceSlug = workspaceSlug;
    this.projectId = projectId;
    this.pageId = pageId;
    this.service = new PageCommentService();
    makeObservable(this, {
      loader: observable.ref,
      commentMap: observable,
      threads: computed,
      fetch: action,
      createThread: action,
      createReply: action,
      updateComment: action,
      removeComment: action,
      resolveThread: action,
      addReaction: action,
      removeReaction: action,
    });
  }

  /** Top-level threads, oldest anchored first. */
  get threads(): TPageComment[] {
    return byCreatedAtAsc(Object.values(this.commentMap).filter((comment) => !comment.parent));
  }

  /** Replies for a given thread id, oldest first. */
  repliesForThread = (threadId: string): TPageComment[] =>
    byCreatedAtAsc(Object.values(this.commentMap).filter((comment) => comment.parent === threadId));

  getThreadByAnchorId = (anchorId: string): TPageComment | undefined =>
    this.threads.find((thread) => thread.anchor_id === anchorId);

  private set = (comment: TPageComment) => {
    runInAction(() => {
      this.commentMap[comment.id] = comment;
    });
  };

  fetch = async () => {
    const comments = await this.service.list(this.workspaceSlug, this.projectId, this.pageId);
    runInAction(() => {
      this.commentMap = {};
      for (const comment of comments) this.commentMap[comment.id] = comment;
      this.loader = undefined;
    });
    return comments;
  };

  createThread = async (anchorId: string, commentHtml: string) => {
    const comment = await this.service.create(this.workspaceSlug, this.projectId, this.pageId, {
      anchor_id: anchorId,
      comment_html: commentHtml,
    });
    this.set(comment);
    return comment;
  };

  createReply = async (threadId: string, commentHtml: string) => {
    const comment = await this.service.create(this.workspaceSlug, this.projectId, this.pageId, {
      parent: threadId,
      comment_html: commentHtml,
    });
    this.set(comment);
    return comment;
  };

  updateComment = async (commentId: string, commentHtml: string) => {
    const comment = await this.service.update(this.workspaceSlug, this.projectId, this.pageId, commentId, {
      comment_html: commentHtml,
    });
    this.set(comment);
    return comment;
  };

  removeComment = async (commentId: string) => {
    await this.service.destroy(this.workspaceSlug, this.projectId, this.pageId, commentId);
    runInAction(() => {
      // Remove the comment and, if it is a thread, its replies too.
      delete this.commentMap[commentId];
      for (const id of Object.keys(this.commentMap)) {
        if (this.commentMap[id]?.parent === commentId) delete this.commentMap[id];
      }
    });
  };

  resolveThread = async (threadId: string, resolved: boolean) => {
    const comment = resolved
      ? await this.service.resolve(this.workspaceSlug, this.projectId, this.pageId, threadId)
      : await this.service.unresolve(this.workspaceSlug, this.projectId, this.pageId, threadId);
    this.set(comment);
    return comment;
  };

  addReaction = async (commentId: string, reaction: string) => {
    const created = await this.service.addReaction(
      this.workspaceSlug,
      this.projectId,
      this.pageId,
      commentId,
      reaction
    );
    runInAction(() => {
      const comment = this.commentMap[commentId];
      if (comment) comment.comment_reactions = [...(comment.comment_reactions ?? []), created];
    });
    return created;
  };

  removeReaction = async (commentId: string, reaction: string, actorId: string) => {
    await this.service.removeReaction(this.workspaceSlug, this.projectId, this.pageId, commentId, reaction);
    runInAction(() => {
      const comment = this.commentMap[commentId];
      if (comment) {
        comment.comment_reactions = (comment.comment_reactions ?? []).filter(
          (r) => !(r.reaction === reaction && r.actor === actorId)
        );
      }
    });
  };
}
