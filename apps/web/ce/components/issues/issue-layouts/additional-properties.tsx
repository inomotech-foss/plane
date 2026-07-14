/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
// plane imports
import { IssueCustomPropertyChips } from "@/components/issues/issue-layouts/properties/custom-properties";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

export function WorkItemLayoutAdditionalProperties(props: TWorkItemLayoutAdditionalProperties) {
  const { displayProperties, issue } = props;
  if (!issue.project_id) return <></>;
  return (
    <IssueCustomPropertyChips projectId={issue.project_id} issueId={issue.id} displayProperties={displayProperties} />
  );
}
