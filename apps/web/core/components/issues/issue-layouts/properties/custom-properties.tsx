/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueDisplayProperties, TIssueCustomProperty, TIssueCustomPropertyValue } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useIssueCustomProperties } from "@/hooks/store/use-issue-custom-properties";
import { useMember } from "@/hooks/store/use-member";
// local imports
import { CustomPropertyIcon } from "@/components/issues/issue-detail/custom-properties/property-icon";

/**
 * Formats a custom property value into a short human readable string.
 * Returns undefined when there is nothing to display.
 */
export const useFormatCustomPropertyValue = () => {
  const { getUserDetails } = useMember();
  const { t } = useTranslation();

  return (property: TIssueCustomProperty, value: TIssueCustomPropertyValue | undefined): string | undefined => {
    if (value === null || value === undefined || value === "") return undefined;
    switch (property.property_type) {
      case "OPTION": {
        const option = property.options.find((candidate) => candidate.id === value);
        return option?.name;
      }
      case "MULTI_OPTION": {
        if (!Array.isArray(value) || value.length === 0) return undefined;
        const names = value
          .map((optionId) => property.options.find((candidate) => candidate.id === optionId)?.name)
          .filter((name): name is string => !!name);
        return names.length > 0 ? names.join(", ") : undefined;
      }
      case "DATE":
        return typeof value === "string" ? renderFormattedDate(value) || undefined : undefined;
      case "BOOLEAN":
        return value === true ? t("common.yes") : t("common.no");
      case "USER":
        return typeof value === "string" ? getUserDetails(value)?.display_name : undefined;
      default:
        return String(value);
    }
  };
};

type TIssueCustomPropertyChipsProps = {
  projectId: string;
  issueId: string;
  displayProperties: IIssueDisplayProperties;
};

/**
 * Compact read-only chips of enabled custom property values, rendered on
 * list rows and kanban cards. Values come from the bulk values endpoint via
 * the custom property store.
 */
export const IssueCustomPropertyChips = observer(function IssueCustomPropertyChips(
  props: TIssueCustomPropertyChipsProps
) {
  const { projectId, issueId, displayProperties } = props;
  // store hooks
  const { getActiveProjectProperties, getIssueValue } = useIssueCustomProperties();
  const formatValue = useFormatCustomPropertyValue();
  // derived values
  const properties = getActiveProjectProperties(projectId);

  if (!properties || properties.length === 0) return null;

  return (
    <>
      {properties.map((property) => {
        if (!displayProperties[`custom_property_${property.id}`]) return null;
        const formattedValue = formatValue(property, getIssueValue(issueId, property.id));
        if (formattedValue === undefined) return null;
        return (
          <Tooltip key={property.id} tooltipHeading={property.display_name} tooltipContent={formattedValue}>
            <div className="flex h-5 max-w-40 flex-shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1">
              <CustomPropertyIcon propertyType={property.property_type} className="h-3 w-3 flex-shrink-0" />
              <div className="truncate text-caption-sm-regular">{formattedValue}</div>
            </div>
          </Tooltip>
        );
      })}
    </>
  );
});
