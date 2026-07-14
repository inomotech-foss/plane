/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import type { SingleOrArray, TFilterConditionNodeForDisplay, TFilterValue, TFilterProperty } from "@plane/types";
import { FILTER_FIELD_TYPE } from "@plane/types";
// local imports
import type { TFilterValueInputProps } from "@/components/rich-filters/shared";
import { NumberFilterValueInput } from "./number";

export const AdditionalFilterValueInput = observer(function AdditionalFilterValueInput<
  P extends TFilterProperty,
  V extends TFilterValue,
>(props: TFilterValueInputProps<P, V>) {
  const { condition, filterFieldConfig, isDisabled = false, onChange } = props;

  // Number input (e.g. NUMBER custom properties with gt / lt operators)
  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.NUMBER) {
    return (
      <NumberFilterValueInput<P>
        condition={condition as TFilterConditionNodeForDisplay<P, number>}
        isDisabled={isDisabled}
        onChange={(value) => onChange(value as SingleOrArray<V>)}
      />
    );
  }

  return (
    // Fallback
    <div className="flex h-full cursor-not-allowed items-center px-4 text-11 text-placeholder transition-opacity duration-200">
      Filter type not supported
    </div>
  );
});
