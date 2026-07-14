/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy } from "lodash-es";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueCustomProperty } from "@plane/types";
import { ToggleSwitch, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { CustomPropertyIcon } from "@/components/issues/issue-detail/custom-properties/property-icon";
import type { TCustomPropertyOperationsCallbacks } from "./create-update-form";
import { CreateUpdateCustomPropertyForm } from "./create-update-form";
import type { TCustomPropertyOptionOperationsCallbacks } from "./options-list";
import { CustomPropertyOptionsList } from "./options-list";

type TCustomPropertyItemProps = {
  property: TIssueCustomProperty;
  operationsCallbacks: TCustomPropertyOperationsCallbacks;
  optionOperationsCallbacks: TCustomPropertyOptionOperationsCallbacks;
  onDelete: () => void;
  isEditable: boolean;
};

export const CustomPropertyItem = observer(function CustomPropertyItem(props: TCustomPropertyItemProps) {
  const { property, operationsCallbacks, optionOperationsCallbacks, onDelete, isEditable } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [isEditing, setIsEditing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  // derived values
  const hasOptions = property.property_type === "OPTION" || property.property_type === "MULTI_OPTION";
  const sortedOptions = sortBy(property.options, "sort_order");

  const handleToggleActive = async (isActive: boolean) => {
    try {
      await operationsCallbacks.updateProperty(property.id, { is_active: isActive });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("work_item_custom_properties.settings.update_error"),
      });
    }
  };

  if (isEditing)
    return (
      <CreateUpdateCustomPropertyForm
        propertyToUpdate={property}
        operationsCallbacks={operationsCallbacks}
        onClose={() => setIsEditing(false)}
      />
    );

  return (
    <div className="rounded-sm border border-subtle bg-surface-1">
      <div className="group flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {hasOptions ? (
            <button
              type="button"
              className="flex size-4 shrink-0 items-center justify-center text-tertiary hover:text-secondary"
              onClick={() => setShowOptions((prev) => !prev)}
              aria-label={t("work_item_custom_properties.settings.manage_options")}
            >
              {showOptions ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <CustomPropertyIcon propertyType={property.property_type} className="size-3.5 shrink-0 text-tertiary" />
          <span className={cn("truncate text-13", { "text-placeholder line-through": !property.is_active })}>
            {property.display_name}
          </span>
          <span className="shrink-0 rounded-sm bg-layer-1 px-1.5 py-0.5 text-10 text-tertiary uppercase">
            {t(`work_item_custom_properties.types.${property.property_type.toLowerCase()}`)}
          </span>
          {hasOptions && (
            <span className="shrink-0 text-11 text-placeholder">
              {t("work_item_custom_properties.settings.option_count", { count: property.options.length })}
            </span>
          )}
        </div>
        {isEditable && (
          <div className="flex shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100">
            <Tooltip tooltipContent={t("work_item_custom_properties.settings.active_tooltip")}>
              <div>
                <ToggleSwitch value={property.is_active} onChange={handleToggleActive} size="sm" />
              </div>
            </Tooltip>
            <button
              type="button"
              className="grid place-items-center rounded-sm p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
              onClick={() => setIsEditing(true)}
              aria-label={t("common.edit")}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              className="hover:text-red-500 grid place-items-center rounded-sm p-1 text-tertiary hover:bg-layer-transparent-hover"
              onClick={onDelete}
              aria-label={t("common.delete")}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {hasOptions && showOptions && (
        <CustomPropertyOptionsList
          propertyId={property.id}
          options={sortedOptions}
          optionOperationsCallbacks={optionOperationsCallbacks}
          isEditable={isEditable}
        />
      )}
    </div>
  );
});
