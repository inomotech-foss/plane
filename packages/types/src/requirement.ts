/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TRequirementRelation = {
  type: string;
  value: string;
};

export type TRequirement = {
  id: string;
  uid: string;
  node_type: string;
  file_path: string;
  document_title: string | null;
  title: string | null;
  statement: string | null;
  field_values: Record<string, string>;
  relations: TRequirementRelation[];
  sort_order: number;
  project: string;
  workspace: string;
  external_source: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TRequirementSyncStatus = "pending" | "syncing" | "success" | "error";

export type TRequirementRepository = {
  id: string;
  project: string;
  workspace: string;
  provider: string;
  repo_url: string;
  default_branch: string;
  last_synced_at: string | null;
  last_sync_status: TRequirementSyncStatus;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type TRequirementRepositoryPayload = {
  repo_url: string;
  default_branch?: string;
  provider?: string;
  access_token?: string;
};

export type TProposeChangePayload = {
  edits: Record<string, string>;
  branch?: string;
  message?: string;
  title?: string;
  body?: string;
};

export type TProposeChangeResponse = {
  pull_request_url: string;
};

export type TRequirementCommitRef = { number: string; url: string };

export type TRequirementCommitUser = { id: string; display_name: string; email: string };

export type TRequirementCommit = {
  sha: string;
  author: string;
  email: string;
  date: string;
  message: string;
  commit_url: string | null;
  refs: TRequirementCommitRef[];
  user: TRequirementCommitUser | null;
};
