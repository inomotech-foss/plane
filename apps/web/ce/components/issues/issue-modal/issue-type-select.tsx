/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Controller } from "react-hook-form";
import type { Control, Path } from "react-hook-form";
// plane imports
import type { EditorRefApi } from "@plane/editor";
// types
import type { TBulkIssueProperties, TIssue } from "@plane/types";
// components
import { IssueTypeDropdown } from "@/components/dropdowns/issue-type";

export type TIssueFields = TIssue & TBulkIssueProperties;

export type TIssueTypeDropdownVariant = "xs" | "sm";

export type TIssueTypeSelectProps<T extends Partial<TIssueFields>> = {
  control: Control<T>;
  projectId: string | null;
  editorRef?: React.MutableRefObject<EditorRefApi | null>;
  disabled?: boolean;
  variant?: TIssueTypeDropdownVariant;
  placeholder?: string;
  isRequired?: boolean;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  showMandatoryFieldInfo?: boolean; // Show info about mandatory fields
  handleFormChange?: () => void;
};

export function IssueTypeSelect<T extends Partial<TIssueFields>>(props: TIssueTypeSelectProps<T>) {
  const { control, projectId, disabled, placeholder, renderChevron, dropDownContainerClassName, handleFormChange } =
    props;

  return (
    <Controller
      control={control}
      name={"type_id" as Path<T>}
      render={({ field: { value, onChange } }) => (
        <IssueTypeDropdown
          projectId={projectId}
          value={(value as string | null) ?? null}
          onChange={(val) => {
            onChange(val as never);
            handleFormChange?.();
          }}
          disabled={disabled}
          placeholder={placeholder}
          dropdownArrow={renderChevron}
          buttonVariant="border-with-text"
          buttonContainerClassName={dropDownContainerClassName}
          showTooltip
        />
      )}
    />
  );
}
