/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueCustomProperty } from "@plane/types";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useIssueCustomProperties } from "@/hooks/store/use-issue-custom-properties";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { CustomPropertyIcon } from "./property-icon";
import { CustomPropertyValueEditor } from "./value-editor";

export type TIssueCustomPropertiesProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

export const IssueCustomProperties = observer(function IssueCustomProperties(props: TIssueCustomPropertiesProps) {
  const { workspaceSlug, projectId, issueId, disabled = false } = props;
  // store hooks
  const { getActiveProjectPropertiesForType, getIssueValue, updateIssueValues } = useIssueCustomProperties();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getProjectDefaultIssueType } = useIssueTypes();
  // i18n
  const { t } = useTranslation();
  // derived values
  // Resolve the issue's work item type, falling back to the project default so
  // type-scoped properties still show; unscoped properties always show.
  const issueTypeId = getIssueById(issueId)?.type_id ?? getProjectDefaultIssueType(projectId)?.id ?? null;
  const properties = getActiveProjectPropertiesForType(projectId, issueTypeId);

  if (!properties || properties.length === 0) return null;

  const handleChange = async (
    property: TIssueCustomProperty,
    value: Parameters<typeof updateIssueValues>[3][string]
  ) => {
    try {
      await updateIssueValues(workspaceSlug, projectId, issueId, { [property.id]: value });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("work_item_custom_properties.update_error"),
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-subtle pt-4">
      <span className="text-body-sm-medium text-secondary">{t("work_item_custom_properties.title")}</span>
      {properties.map((property) => (
        <SidebarPropertyListItem
          key={property.id}
          icon={({ className }) => <CustomPropertyIcon propertyType={property.property_type} className={className} />}
          label={property.display_name}
        >
          <CustomPropertyValueEditor
            property={property}
            projectId={projectId}
            value={getIssueValue(issueId, property.id)}
            onChange={(value) => handleChange(property, value)}
            disabled={disabled}
          />
        </SidebarPropertyListItem>
      ))}
    </div>
  );
});
