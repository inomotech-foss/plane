/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TServiceDeskNotifyMode = "NONE" | "ADMINS" | "MEMBERS" | "CUSTOM";

export type TServiceDeskConfig = {
  id: string;
  workspace: string;
  project: string;
  mailbox_email: string;
  is_enabled: boolean;
  notify_mode: TServiceDeskNotifyMode;
  notify_user_ids: string[];
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TEmailDirection = "INBOUND" | "OUTBOUND";

export type TEmailDeliveryStatus = "RECEIVED" | "PENDING" | "SENT" | "FAILED";

export type TIssueEmailMessage = {
  id: string;
  thread: string;
  direction: TEmailDirection;
  status: TEmailDeliveryStatus;
  from_email: string;
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  body_text: string;
  comment: string | null;
  error: string | null;
  created_at: string;
};

export type TIssueEmailThread = {
  id: string;
  workspace: string;
  project: string;
  issue: string;
  mailbox_email: string;
  creator_email: string;
  creator_name: string;
  subject: string;
  to_emails: string[];
  cc_emails: string[];
  messages: TIssueEmailMessage[];
  created_at: string;
  updated_at: string;
};
