/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
import type { TIssueComment, TIssueEmailMessage, TIssueEmailThread, TServiceDeskConfig } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class ServiceDeskService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getConfig(workspaceSlug: string, projectId: string): Promise<TServiceDeskConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/service-desk/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateConfig(
    workspaceSlug: string,
    projectId: string,
    payload: Partial<Pick<TServiceDeskConfig, "mailbox_email" | "is_enabled" | "notify_mode" | "notify_user_ids">>
  ): Promise<TServiceDeskConfig> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/service-desk/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getEmailThread(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueEmailThread> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/email-thread/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateEmailThread(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: Partial<Pick<TIssueEmailThread, "to_emails" | "cc_emails">>
  ): Promise<TIssueEmailThread> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/email-thread/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async sendEmailReply(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: { comment_html: string; attachment_asset_ids?: string[] }
  ): Promise<{ comment: TIssueComment; email_message: TIssueEmailMessage }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/email-replies/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
