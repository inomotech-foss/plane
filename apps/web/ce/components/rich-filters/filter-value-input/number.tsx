/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterConditionNodeForDisplay, TFilterProperty } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { COMMON_FILTER_ITEM_BORDER_CLASSNAME, EMPTY_FILTER_PLACEHOLDER_TEXT } from "@/components/rich-filters/shared";

type TNumberFilterValueInputProps<P extends TFilterProperty> = {
  condition: TFilterConditionNodeForDisplay<P, number>;
  isDisabled?: boolean;
  onChange: (value: number | null) => void;
};

export const NumberFilterValueInput = observer(function NumberFilterValueInput<P extends TFilterProperty>(
  props: TNumberFilterValueInputProps<P>
) {
  const { condition, isDisabled, onChange } = props;
  // derived values
  const conditionValue = typeof condition.value === "number" ? String(condition.value) : "";
  // states
  const [draft, setDraft] = useState(conditionValue);

  useEffect(() => {
    setDraft(conditionValue);
  }, [conditionValue]);

  const commit = () => {
    if (draft === "") {
      onChange(null);
      return;
    }
    const parsed = Number(draft);
    if (!Number.isNaN(parsed)) onChange(parsed);
  };

  return (
    <input
      type="number"
      className={cn("h-full w-24 bg-transparent px-2 text-11 outline-none placeholder:text-placeholder", {
        [COMMON_FILTER_ITEM_BORDER_CLASSNAME]: !isDisabled,
      })}
      value={draft}
      placeholder={EMPTY_FILTER_PLACEHOLDER_TEXT}
      disabled={isDisabled}
      autoFocus={conditionValue === ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
});
