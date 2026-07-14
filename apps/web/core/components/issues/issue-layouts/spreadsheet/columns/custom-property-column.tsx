/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue, TIssueCustomPropertyValue } from "@plane/types";
// components
import { CustomPropertyValueEditor } from "@/components/issues/issue-detail/custom-properties/value-editor";
// hooks
import { useIssueCustomProperties } from "@/hooks/store/use-issue-custom-properties";

type Props = {
  issue: TIssue;
  propertyId: string;
  disabled: boolean;
};

export const SpreadsheetCustomPropertyColumn = observer(function SpreadsheetCustomPropertyColumn(props: Props) {
  const { issue, propertyId, disabled } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { getPropertyById, getIssueValue, updateIssueValues } = useIssueCustomProperties();
  // i18n
  const { t } = useTranslation();
  // derived values
  const property = getPropertyById(propertyId);

  if (!property || !issue.project_id || !workspaceSlug) return <div className="h-11 border-b-[0.5px] border-subtle" />;

  const handleChange = async (value: TIssueCustomPropertyValue) => {
    try {
      await updateIssueValues(workspaceSlug.toString(), issue.project_id ?? "", issue.id, { [property.id]: value });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("work_item_custom_properties.update_error"),
      });
    }
  };

  return (
    <div className="flex h-11 items-center border-b-[0.5px] border-subtle px-2">
      <CustomPropertyValueEditor
        property={property}
        projectId={issue.project_id}
        value={getIssueValue(issue.id, property.id)}
        onChange={(value) => void handleChange(value)}
        disabled={disabled}
      />
    </div>
  );
});
