/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { IssueTypeDropdown } from "@/components/dropdowns/issue-type";
// store hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId, disabled } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const { getActiveProjectIssueTypes } = useIssueTypes();
  // derived values
  const issue = getIssueById(issueId);

  if (!issue || !issue.project_id) return <></>;

  const projectIssueTypes = getActiveProjectIssueTypes(issue.project_id);
  // fall back to nothing only if the project has no work item types
  if (!projectIssueTypes || projectIssueTypes.length === 0) return <></>;

  const handleChange = async (typeId: string) => {
    if (!workspaceSlug || !issue.project_id) return;
    await updateIssue(workspaceSlug.toString(), issue.project_id, issueId, { type_id: typeId });
  };

  return (
    <IssueTypeDropdown
      projectId={issue.project_id}
      value={issue.type_id}
      onChange={handleChange}
      disabled={disabled}
      buttonVariant="border-with-text"
      dropdownArrow={!disabled}
      showTooltip
    />
  );
});
