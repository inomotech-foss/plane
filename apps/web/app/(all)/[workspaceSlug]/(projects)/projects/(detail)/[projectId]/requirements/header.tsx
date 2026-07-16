/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useSearchParams } from "react-router";
import { ClipboardList, RefreshCw } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageSearchInput } from "@/components/pages/list/search-input";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
// services
import { requirementService } from "@/services/requirement.service";

export const RequirementsHeader = observer(function RequirementsHeader() {
  const { workspaceSlug, projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentProjectDetails } = useProject();
  const [syncing, setSyncing] = useState(false);

  const query = searchParams.get("q") ?? "";

  const setQuery = (val: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (val) params.set("q", val);
        else params.delete("q");
        return params;
      },
      { replace: true }
    );
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await requirementService.sync(workspaceSlug!.toString(), projectId!.toString());
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Sync started", message: "Refreshing requirements from git." });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: (error as { error?: string })?.error || "Sync failed." });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Requirements"
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/requirements/`}
                icon={<ClipboardList className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <PageSearchInput searchQuery={query} updateSearchQuery={setQuery} />
        <Button variant="secondary" size="lg" prependIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={handleSync} loading={syncing}>
          Sync
        </Button>
      </Header.RightItem>
    </Header>
  );
});
