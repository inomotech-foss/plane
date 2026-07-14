/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// plane imports
import { IssueCustomProperties } from "@/components/issues/issue-detail/custom-properties";

export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};

export function WorkItemAdditionalSidebarProperties(props: TWorkItemAdditionalSidebarProperties) {
  const { workItemId, projectId, workspaceSlug, isEditable } = props;
  return (
    <IssueCustomProperties
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      issueId={workItemId}
      disabled={!isEditable}
    />
  );
}
