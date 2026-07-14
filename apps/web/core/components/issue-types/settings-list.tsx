/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TIssueType } from "@plane/types";
import { Loader } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { SettingsHeading } from "../settings/heading";
import type { TIssueTypeOperationsCallbacks } from "./create-update-form";
import { CreateUpdateIssueTypeForm } from "./create-update-form";
import { DeleteIssueTypeModal } from "./delete-modal";
import { IssueTypeItem } from "./type-item";

export const ProjectSettingsIssueTypesList = observer(function ProjectSettingsIssueTypesList() {
  // router
  const { workspaceSlug, projectId } = useParams();
  // states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [issueTypeToDelete, setIssueTypeToDelete] = useState<TIssueType | null>(null);
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { getProjectIssueTypes, fetchProjectIssueTypes, createIssueType, updateIssueType } = useIssueTypes();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isEditable = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  const issueTypes = getProjectIssueTypes(projectId?.toString());

  useSWR(
    workspaceSlug && projectId ? `PROJECT_ISSUE_TYPES_SETTINGS_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectIssueTypes(workspaceSlug.toString(), projectId.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const operationsCallbacks: TIssueTypeOperationsCallbacks = {
    createIssueType: (data) => createIssueType(workspaceSlug?.toString(), projectId?.toString(), data),
    updateIssueType: (issueTypeId, data) =>
      updateIssueType(workspaceSlug?.toString(), projectId?.toString(), issueTypeId, data),
  };

  return (
    <>
      <DeleteIssueTypeModal
        isOpen={!!issueTypeToDelete}
        issueType={issueTypeToDelete}
        onClose={() => setIssueTypeToDelete(null)}
      />
      <SettingsHeading
        title={t("work_item_types.settings.types.title")}
        description={t("work_item_types.settings.types.description")}
        control={
          isEditable && (
            <Button variant="primary" size="lg" onClick={() => setShowCreateForm(true)}>
              {t("work_item_types.create.button")}
            </Button>
          )
        }
      />
      <div className="space-y-2 py-4">
        {showCreateForm && (
          <CreateUpdateIssueTypeForm
            operationsCallbacks={operationsCallbacks}
            onClose={() => setShowCreateForm(false)}
          />
        )}
        {!issueTypes ? (
          <Loader className="space-y-2">
            <Loader.Item height="42px" />
            <Loader.Item height="42px" />
            <Loader.Item height="42px" />
          </Loader>
        ) : issueTypes.length === 0 && !showCreateForm ? (
          <p className="py-4 text-13 text-placeholder">{t("work_item_types.empty_state.enable.description")}</p>
        ) : (
          issueTypes.map((issueType) => (
            <IssueTypeItem
              key={issueType.id}
              issueType={issueType}
              operationsCallbacks={operationsCallbacks}
              onDelete={() => setIssueTypeToDelete(issueType)}
              isEditable={isEditable}
            />
          ))
        )}
      </div>
    </>
  );
});
