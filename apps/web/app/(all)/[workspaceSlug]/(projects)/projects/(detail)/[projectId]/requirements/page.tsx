/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { RequirementsRoot } from "@/components/requirements/root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectRequirementsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { getProjectById } = useProject();
  // derived values
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project?.name} - Requirements` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <RequirementsRoot workspaceSlug={workspaceSlug} projectId={projectId} />
    </>
  );
}

export default observer(ProjectRequirementsPage);
