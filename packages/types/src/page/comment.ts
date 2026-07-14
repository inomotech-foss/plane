/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "../users";

/** An emoji reaction on a page comment. `reaction` is the decimal codepoint
 * string (e.g. "128077"), matching how issue comment reactions are stored. */
export type TPageCommentReaction = {
  id: string;
  comment: string;
  actor: string | null;
  actor_detail?: IUserLite;
  reaction: string;
};

/**
 * A document/inline comment thread (or reply) anchored to a page.
 *
 * Top-level threads carry an `anchor_id` matching the `threadId` attribute of
 * the inline comment mark in the page's collaborative document. Replies set
 * `parent` to the top-level comment id and have no `anchor_id`.
 */
export type TPageComment = {
  id: string;
  page: string;
  workspace: string;
  parent: string | null;
  anchor_id: string | null;
  comment_html: string;
  comment_json: object;
  comment_stripped: string;
  actor: string | null;
  actor_detail?: IUserLite;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_detail?: IUserLite;
  edited_at: string | null;
  comment_reactions?: TPageCommentReaction[];
  external_id?: string | null;
  external_source?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TPageCommentMap = { [commentId: string]: TPageComment };
export type TPageCommentIdMap = { [pageId: string]: string[] };
