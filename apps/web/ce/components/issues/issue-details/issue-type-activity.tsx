/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Layers } from "lucide-react";
import { observer } from "mobx-react";
// store hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import {
  IssueActivityBlockComponent,
  IssueLink,
} from "@/components/issues/issue-detail/issue-activity/activity/actions";

export type TIssueTypeActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

export const IssueTypeActivity = observer(function IssueTypeActivity(props: TIssueTypeActivity) {
  const { activityId, showIssue = true, ends } = props;
  // store hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      icon={<Layers className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {activity.new_value ? (
          <>
            set the work item type to <span className="font-medium text-primary">{activity.new_value}</span>
          </>
        ) : (
          <>removed the work item type</>
        )}
        {showIssue ? ` for ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
