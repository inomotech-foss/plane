/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TPageComment, TPageCommentReaction } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/**
 * REST client for page document/inline comment threads and replies.
 * Talks to the app (session-auth) endpoints added in the page-comments API.
 */
export class PageCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(workspaceSlug: string, projectId: string, pageId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/`;
  }

  async list(workspaceSlug: string, projectId: string, pageId: string): Promise<TPageComment[]> {
    return this.get(this.basePath(workspaceSlug, projectId, pageId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    data: Partial<TPageComment>
  ): Promise<TPageComment> {
    return this.post(this.basePath(workspaceSlug, projectId, pageId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    commentId: string,
    data: Partial<TPageComment>
  ): Promise<TPageComment> {
    return this.patch(`${this.basePath(workspaceSlug, projectId, pageId)}${commentId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, pageId: string, commentId: string): Promise<void> {
    return this.delete(`${this.basePath(workspaceSlug, projectId, pageId)}${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async resolve(workspaceSlug: string, projectId: string, pageId: string, commentId: string): Promise<TPageComment> {
    return this.post(`${this.basePath(workspaceSlug, projectId, pageId)}${commentId}/resolve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unresolve(workspaceSlug: string, projectId: string, pageId: string, commentId: string): Promise<TPageComment> {
    return this.delete(`${this.basePath(workspaceSlug, projectId, pageId)}${commentId}/resolve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addReaction(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    commentId: string,
    reaction: string
  ): Promise<TPageCommentReaction> {
    return this.post(`${this.basePath(workspaceSlug, projectId, pageId)}${commentId}/reactions/`, { reaction })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeReaction(
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    commentId: string,
    reaction: string
  ): Promise<void> {
    return this.delete(`${this.basePath(workspaceSlug, projectId, pageId)}${commentId}/reactions/${reaction}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
