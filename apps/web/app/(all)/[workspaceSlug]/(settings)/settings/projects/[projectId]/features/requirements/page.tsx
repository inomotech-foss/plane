/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { RequirementRepositorySettings } from "@/components/requirements/settings";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { ProjectSettingsFeatureControlItem } from "@/components/settings/project/content/feature-control-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesRequirementsProjectSettingsHeader } from "./header";

function FeaturesRequirementsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  const { t } = useTranslation();

  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} settings - ${t("project_settings.features.requirements.short_title")}`
    : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<FeaturesRequirementsProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.requirements.title")}
          description={t("project_settings.features.requirements.description")}
        />
        <div className="mt-7 space-y-6">
          <ProjectSettingsFeatureControlItem
            title={t("project_settings.features.requirements.toggle_title")}
            description={t("project_settings.features.requirements.toggle_description")}
            featureProperty="requirement_view"
            projectId={projectId}
            value={!!currentProjectDetails?.requirement_view}
            workspaceSlug={workspaceSlug}
          />
          {currentProjectDetails?.requirement_view && (
            <RequirementRepositorySettings workspaceSlug={workspaceSlug} projectId={projectId} />
          )}
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesRequirementsSettingsPage);
