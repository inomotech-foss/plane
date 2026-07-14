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
import type { TIssueCustomProperty } from "@plane/types";
import { Loader } from "@plane/ui";
// hooks
import { useIssueCustomProperties } from "@/hooks/store/use-issue-custom-properties";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { SettingsHeading } from "../settings/heading";
import type { TCustomPropertyOperationsCallbacks } from "./create-update-form";
import { CreateUpdateCustomPropertyForm } from "./create-update-form";
import { DeleteCustomPropertyModal } from "./delete-modal";
import type { TCustomPropertyOptionOperationsCallbacks } from "./options-list";
import { CustomPropertyItem } from "./property-item";

export const ProjectSettingsCustomPropertiesList = observer(function ProjectSettingsCustomPropertiesList() {
  // router
  const { workspaceSlug, projectId } = useParams();
  // states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<TIssueCustomProperty | null>(null);
  // i18n
  const { t } = useTranslation();
  // store hooks
  const {
    getProjectProperties,
    fetchProjectProperties,
    createProperty,
    updateProperty,
    createOption,
    updateOption,
    deleteOption,
  } = useIssueCustomProperties();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const isEditable = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  const properties = getProjectProperties(projectId?.toString());

  useSWR(
    workspaceSlug && projectId ? `PROJECT_CUSTOM_PROPERTIES_SETTINGS_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectProperties(workspaceSlug.toString(), projectId.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const operationsCallbacks: TCustomPropertyOperationsCallbacks = {
    createProperty: (data) => createProperty(workspaceSlug?.toString(), projectId?.toString(), data),
    updateProperty: (propertyId, data) =>
      updateProperty(workspaceSlug?.toString(), projectId?.toString(), propertyId, data),
  };

  const optionOperationsCallbacks: TCustomPropertyOptionOperationsCallbacks = {
    createOption: (propertyId, data) =>
      createOption(workspaceSlug?.toString(), projectId?.toString(), propertyId, data),
    updateOption: (propertyId, optionId, data) =>
      updateOption(workspaceSlug?.toString(), projectId?.toString(), propertyId, optionId, data),
    deleteOption: (propertyId, optionId) =>
      deleteOption(workspaceSlug?.toString(), projectId?.toString(), propertyId, optionId),
  };

  return (
    <>
      <DeleteCustomPropertyModal
        isOpen={!!propertyToDelete}
        property={propertyToDelete}
        onClose={() => setPropertyToDelete(null)}
      />
      <SettingsHeading
        title={t("work_item_custom_properties.settings.heading")}
        description={t("work_item_custom_properties.settings.description")}
        control={
          isEditable && (
            <Button variant="primary" size="lg" onClick={() => setShowCreateForm(true)}>
              {t("work_item_custom_properties.settings.add_field")}
            </Button>
          )
        }
      />
      <div className="space-y-2 py-4">
        {showCreateForm && (
          <CreateUpdateCustomPropertyForm
            operationsCallbacks={operationsCallbacks}
            onClose={() => setShowCreateForm(false)}
          />
        )}
        {!properties ? (
          <Loader className="space-y-2">
            <Loader.Item height="42px" />
            <Loader.Item height="42px" />
            <Loader.Item height="42px" />
          </Loader>
        ) : properties.length === 0 && !showCreateForm ? (
          <p className="py-4 text-13 text-placeholder">{t("work_item_custom_properties.settings.empty_state")}</p>
        ) : (
          properties.map((property) => (
            <CustomPropertyItem
              key={property.id}
              property={property}
              operationsCallbacks={operationsCallbacks}
              optionOperationsCallbacks={optionOperationsCallbacks}
              onDelete={() => setPropertyToDelete(property)}
              isEditable={isEditable}
            />
          ))
        )}
      </div>
    </>
  );
});
