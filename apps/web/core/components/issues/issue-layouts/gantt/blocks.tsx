/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Popover } from "@plane/propel/popover";
import { Tooltip } from "@plane/propel/tooltip";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
import { ControlLink } from "@plane/ui";
import { findTotalDaysInRange, generateWorkItemLink } from "@plane/utils";
// components
import { SIDEBAR_WIDTH } from "@/components/gantt-chart/constants";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";
// plane web imports
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import { IssueStats } from "@/plane-web/components/issues/issue-layouts/issue-stats";
// local imports
import { WorkItemPreviewCard } from "../../preview-card";
import { getBlockViewDetails } from "../utils";
import type { GanttStoreType } from "./base-gantt-root";

type Props = {
  issueId: string;
  isEpic?: boolean;
};

// Resolve the work item type to show for an issue — its explicit type, else
// the project's default — mirroring IssueTypeDropdown's display behavior.
// Returns null when the project has no work item types configured.
const useResolvedIssueType = (issue: ReturnType<ReturnType<typeof useIssueDetail>["issue"]["getIssueById"]>) => {
  const { getIssueTypeById, getProjectDefaultIssueType } = useIssueTypes();
  return getIssueTypeById(issue?.type_id) ?? getProjectDefaultIssueType(issue?.project_id);
};

export const IssueGanttBlock = observer(function IssueGanttBlock(props: Props) {
  const { issueId, isEpic } = props;
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // store hooks
  const { getProjectStates } = useProjectState();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // hooks
  const { isMobile } = usePlatformOS();
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);

  // derived values
  const issueDetails = getIssueById(issueId);
  const issueType = useResolvedIssueType(issueDetails);
  const stateDetails =
    issueDetails && getProjectStates(issueDetails?.project_id)?.find((state) => state?.id == issueDetails?.state_id);

  const { blockStyle } = getBlockViewDetails(issueDetails, stateDetails?.color ?? "");

  const handleIssuePeekOverview = () => handleRedirection(workspaceSlug, issueDetails, isMobile);

  const duration = findTotalDaysInRange(issueDetails?.start_date, issueDetails?.target_date) || 0;

  return (
    <Popover>
      <Popover.Button
        delay={100}
        openOnHover
        className="w-full"
        render={
          <div
            id={`issue-${issueId}`}
            className="space-between relative flex h-full w-full cursor-pointer items-center rounded-sm"
            style={blockStyle}
            onClick={handleIssuePeekOverview}
          >
            <div className="absolute top-0 left-0 h-full w-full bg-surface-1/50" />
            <div
              className="sticky flex w-auto flex-1 items-center gap-1.5 overflow-hidden px-2.5 py-1 text-13 text-primary"
              style={{ left: `${SIDEBAR_WIDTH}px` }}
            >
              {issueType && (
                <span className="flex flex-shrink-0 items-center">
                  <Logo logo={issueType.logo_props} size={12} />
                </span>
              )}
              <span className="truncate">{issueDetails?.name}</span>
            </div>
            {isEpic && (
              <IssueStats
                issueId={issueId}
                className="sticky mx-2 w-auto flex-shrink-0 justify-end truncate overflow-hidden font-medium text-primary"
                showProgressText={duration >= 2}
              />
            )}
          </div>
        }
      />
      <Popover.Panel side="bottom" align="start">
        <>
          {issueDetails && issueDetails?.project_id && (
            <WorkItemPreviewCard
              projectId={issueDetails.project_id}
              stateDetails={{
                id: issueDetails.state_id ?? undefined,
              }}
              workItem={issueDetails}
            />
          )}
        </>
      </Popover.Panel>
    </Popover>
  );
});

// rendering issues on gantt sidebar
export const IssueGanttSidebarBlock = observer(function IssueGanttSidebarBlock(props: Props) {
  const { issueId, isEpic = false } = props;
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { isMobile } = usePlatformOS();
  const storeType = useIssueStoreType() as GanttStoreType;
  const { issuesFilter } = useIssues(storeType);
  const { getProjectIdentifierById } = useProject();

  // handlers
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);

  const { getBlockById } = useTimeLineChart(GANTT_TIMELINE_TYPE.ISSUE);

  // derived values
  const issueDetails = getIssueById(issueId);
  const issueType = useResolvedIssueType(issueDetails);
  const projectIdentifier = getProjectIdentifierById(issueDetails?.project_id);

  // nesting depth = number of ancestors that are themselves visible in the
  // chart (the block list is hierarchy-ordered, so children sit right below
  // their parent and only need to be indented)
  let nestingDepth = 0;
  const seenIds = new Set([issueId]);
  let parentId = issueDetails?.parent_id;
  while (parentId && !seenIds.has(parentId) && getBlockById(parentId)) {
    nestingDepth += 1;
    seenIds.add(parentId);
    parentId = getIssueById(parentId)?.parent_id;
  }

  const handleIssuePeekOverview = (e: any) => {
    e.stopPropagation(true);
    e.preventDefault();
    handleRedirection(workspaceSlug, issueDetails, isMobile);
  };

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issueDetails?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issueDetails?.sequence_id,
    isEpic,
  });

  return (
    <ControlLink
      id={`issue-${issueId}`}
      href={workItemLink}
      onClick={handleIssuePeekOverview}
      className="line-clamp-1 w-full cursor-pointer text-13 text-primary"
      disabled={!!issueDetails?.tempId}
    >
      <div className="relative flex h-full w-full cursor-pointer items-center gap-2">
        {nestingDepth > 0 && <span aria-hidden className="flex-shrink-0" style={{ width: `${nestingDepth * 16}px` }} />}
        {issueDetails?.project_id && (
          <IssueIdentifier
            issueId={issueDetails.id}
            projectId={issueDetails.project_id}
            size="xs"
            variant="tertiary"
            displayProperties={issuesFilter?.issueFilters?.displayProperties}
          />
        )}
        {issueType && (
          <span className="flex flex-shrink-0 items-center">
            <Logo logo={issueType.logo_props} size={14} />
          </span>
        )}
        <Tooltip tooltipContent={issueDetails?.name} isMobile={isMobile}>
          <span className="flex-grow truncate text-13 font-medium">{issueDetails?.name}</span>
        </Tooltip>
      </div>
    </ControlLink>
  );
});
