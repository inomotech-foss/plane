/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueCustomProperty, TIssueCustomPropertyValue } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// local imports
import { CustomPropertyOptionSelect } from "./option-select";

type TCustomPropertyValueEditorProps = {
  property: TIssueCustomProperty;
  projectId: string;
  value: TIssueCustomPropertyValue | undefined;
  onChange: (value: TIssueCustomPropertyValue) => void;
  disabled?: boolean;
};

type TTextInputProps = {
  type: "text" | "number";
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  disabled: boolean;
};

function CustomPropertyInput(props: TTextInputProps) {
  const { type, value, onCommit, placeholder, disabled } = props;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type={type}
      className={cn(
        "h-full w-full rounded-sm bg-transparent px-2 py-0.5 text-body-xs-regular outline-none placeholder:text-placeholder",
        { "hover:bg-layer-transparent-hover focus:bg-layer-transparent-hover": !disabled }
      )}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function CustomPropertyValueEditor(props: TCustomPropertyValueEditorProps) {
  const { property, projectId, value, onChange, disabled = false } = props;
  const { t } = useTranslation();

  switch (property.property_type) {
    case "TEXT":
      return (
        <CustomPropertyInput
          type="text"
          value={typeof value === "string" ? value : ""}
          onCommit={(draft) => onChange(draft === "" ? null : draft)}
          placeholder={t("work_item_custom_properties.enter_value")}
          disabled={disabled}
        />
      );
    case "NUMBER":
      return (
        <CustomPropertyInput
          type="number"
          value={typeof value === "number" ? String(value) : ""}
          onCommit={(draft) => {
            if (draft === "") onChange(null);
            else if (!Number.isNaN(Number(draft))) onChange(Number(draft));
          }}
          placeholder={t("work_item_custom_properties.enter_value")}
          disabled={disabled}
        />
      );
    case "OPTION":
      return (
        <CustomPropertyOptionSelect
          property={property}
          value={typeof value === "string" ? value : null}
          onChange={(selected) => onChange(selected)}
          multiple={false}
          disabled={disabled}
        />
      );
    case "MULTI_OPTION":
      return (
        <CustomPropertyOptionSelect
          property={property}
          value={Array.isArray(value) ? value : []}
          onChange={(selected) => onChange(selected)}
          multiple
          disabled={disabled}
        />
      );
    case "DATE":
      return (
        <DateDropdown
          value={typeof value === "string" ? value : null}
          onChange={(date) => onChange(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
          placeholder={t("work_item_custom_properties.select_date")}
          buttonVariant="transparent-with-text"
          className="h-full w-full grow"
          buttonContainerClassName="w-full text-left"
          buttonClassName={cn("text-body-xs-regular", { "text-placeholder": !value })}
          disabled={disabled}
        />
      );
    case "BOOLEAN":
      return (
        <div className="flex h-full items-center px-2">
          <ToggleSwitch value={value === true} onChange={(next) => onChange(next)} disabled={disabled} size="sm" />
        </div>
      );
    case "USER":
      return (
        <MemberDropdown
          value={typeof value === "string" ? value : null}
          onChange={(memberId) => onChange(memberId)}
          projectId={projectId}
          multiple={false}
          placeholder={t("work_item_custom_properties.select_member")}
          buttonVariant="transparent-with-text"
          className="h-full w-full grow"
          buttonContainerClassName="w-full text-left"
          buttonClassName="text-body-xs-regular"
          disabled={disabled}
          showUserDetails
        />
      );
    default:
      return null;
  }
}
