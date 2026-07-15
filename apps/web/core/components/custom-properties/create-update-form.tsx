/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueCustomProperty, TIssueCustomPropertyType } from "@plane/types";
import { ISSUE_CUSTOM_PROPERTY_TYPES } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
// local imports
import { CustomPropertyIcon } from "@/components/issues/issue-detail/custom-properties/property-icon";
import { useIssueTypes } from "@/hooks/store/use-issue-types";

export type TCustomPropertyOperationsCallbacks = {
  createProperty: (data: Partial<TIssueCustomProperty>) => Promise<TIssueCustomProperty>;
  updateProperty: (propertyId: string, data: Partial<TIssueCustomProperty>) => Promise<TIssueCustomProperty>;
};

type TCreateUpdateCustomPropertyFormProps = {
  propertyToUpdate?: TIssueCustomProperty;
  operationsCallbacks: TCustomPropertyOperationsCallbacks;
  onClose: () => void;
};

export const CreateUpdateCustomPropertyForm = observer(function CreateUpdateCustomPropertyForm(
  props: TCreateUpdateCustomPropertyFormProps
) {
  const { propertyToUpdate, operationsCallbacks, onClose } = props;
  // router
  const { projectId } = useParams();
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { getActiveProjectIssueTypes, getIssueTypeById } = useIssueTypes();
  // states
  const [displayName, setDisplayName] = useState(propertyToUpdate?.display_name ?? "");
  const [propertyType, setPropertyType] = useState<TIssueCustomPropertyType>(propertyToUpdate?.property_type ?? "TEXT");
  const [issueType, setIssueType] = useState<string | null>(propertyToUpdate?.issue_type ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // derived values
  const issueTypes = getActiveProjectIssueTypes(projectId?.toString()) ?? [];
  const selectedIssueType = getIssueTypeById(issueType);

  useEffect(() => {
    setDisplayName(propertyToUpdate?.display_name ?? "");
    setPropertyType(propertyToUpdate?.property_type ?? "TEXT");
    setIssueType(propertyToUpdate?.issue_type ?? null);
  }, [propertyToUpdate]);

  const isUpdating = !!propertyToUpdate;

  const handleSubmit = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) return;
    setIsSubmitting(true);
    try {
      if (isUpdating)
        await operationsCallbacks.updateProperty(propertyToUpdate.id, {
          display_name: trimmedName,
          issue_type: issueType,
        });
      else
        await operationsCallbacks.createProperty({
          name: trimmedName,
          display_name: trimmedName,
          property_type: propertyType,
          issue_type: issueType,
        });
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message:
          (error as { error?: string })?.error ??
          t(
            isUpdating
              ? "work_item_custom_properties.settings.update_error"
              : "work_item_custom_properties.settings.create_error"
          ),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="flex w-full items-center gap-2 rounded-sm border border-subtle bg-surface-1 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <CustomSelect
        value={propertyType}
        onChange={(value: TIssueCustomPropertyType) => setPropertyType(value)}
        label={
          <span className="flex items-center gap-1.5">
            <CustomPropertyIcon propertyType={propertyType} className="size-3.5" />
            {t(`work_item_custom_properties.types.${propertyType.toLowerCase()}`)}
          </span>
        }
        disabled={isUpdating}
      >
        {ISSUE_CUSTOM_PROPERTY_TYPES.map((type) => (
          <CustomSelect.Option key={type} value={type}>
            <span className="flex items-center gap-1.5">
              <CustomPropertyIcon propertyType={type} className="size-3.5" />
              {t(`work_item_custom_properties.types.${type.toLowerCase()}`)}
            </span>
          </CustomSelect.Option>
        ))}
      </CustomSelect>
      <Input
        type="text"
        className="w-full"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={t("work_item_custom_properties.settings.name_placeholder")}
        autoFocus
      />
      {issueTypes.length > 0 && (
        <CustomSelect
          value={issueType}
          onChange={(value: string | null) => setIssueType(value)}
          label={
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {selectedIssueType ? (
                <>
                  <Logo logo={selectedIssueType.logo_props} size={14} />
                  {selectedIssueType.name}
                </>
              ) : (
                t("work_item_custom_properties.settings.applies_to_all_types")
              )}
            </span>
          }
        >
          <CustomSelect.Option value={null}>
            {t("work_item_custom_properties.settings.applies_to_all_types")}
          </CustomSelect.Option>
          {issueTypes.map((type) => (
            <CustomSelect.Option key={type.id} value={type.id}>
              <span className="flex items-center gap-1.5">
                <Logo logo={type.logo_props} size={14} />
                {type.name}
              </span>
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      )}
      <Button variant="secondary" onClick={onClose} size="sm">
        {t("common.cancel")}
      </Button>
      <Button variant="primary" type="submit" size="sm" loading={isSubmitting} disabled={!displayName.trim()}>
        {isUpdating ? t("common.update") : t("common.create")}
      </Button>
    </form>
  );
});
