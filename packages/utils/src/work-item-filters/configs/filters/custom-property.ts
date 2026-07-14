/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IUserLite, TFilterProperty, TFilterValue, TIssueCustomProperty, TOperatorConfigMap } from "@plane/types";
import { COLLECTION_OPERATOR, COMPARISON_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";
// local imports
import {
  getDatePickerConfig,
  getDateRangePickerConfig,
  getMultiSelectConfig,
  getNumberPickerConfig,
  getSingleSelectConfig,
} from "../../../rich-filters/factories/configs/core";
import type {
  TCreateFilterConfigParams,
  IFilterIconConfig,
  TCreateFilterConfig,
} from "../../../rich-filters/factories/configs/shared";
import { createFilterConfig, createOperatorConfigEntry } from "../../../rich-filters/factories/configs/shared";

/**
 * Custom property filter specific params
 */
export type TCreateCustomPropertyFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<TIssueCustomProperty> & {
    property: TIssueCustomProperty;
    members: IUserLite[];
    getMemberIcon?: (member: IUserLite) => React.ReactNode;
  };

/**
 * Helper to get the option multi select config for OPTION / MULTI_OPTION
 * custom properties.
 */
const getCustomPropertyOptionMultiSelectConfig = (params: TCreateCustomPropertyFilterParams) =>
  getMultiSelectConfig<TIssueCustomProperty["options"][number], string, undefined>(
    {
      items: [...params.property.options].toSorted((a, b) => a.sort_order - b.sort_order),
      getId: (option) => option.id,
      getLabel: (option) => option.name,
      getValue: (option) => option.id,
    },
    {
      singleValueOperator: EQUALITY_OPERATOR.EXACT,
      ...params,
    }
  );

/**
 * Helper to get the member multi select config for USER custom properties.
 */
const getCustomPropertyMemberMultiSelectConfig = (params: TCreateCustomPropertyFilterParams) =>
  getMultiSelectConfig<IUserLite, string, IUserLite>(
    {
      items: params.members,
      getId: (member) => member.id,
      getLabel: (member) => member.display_name,
      getValue: (member) => member.id,
      getIconData: (member) => member,
    },
    {
      singleValueOperator: EQUALITY_OPERATOR.EXACT,
      ...params,
    },
    {
      getOptionIcon: params.getMemberIcon,
    }
  );

/**
 * Helper to get the boolean single select config for BOOLEAN custom properties.
 */
const getCustomPropertyBooleanSelectConfig = (params: TCreateCustomPropertyFilterParams) =>
  getSingleSelectConfig<{ value: boolean; label: string }, TFilterValue, undefined>(
    {
      items: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
      getId: (item) => String(item.value),
      getLabel: (item) => item.label,
      getValue: (item) => item.value,
    },
    { ...params }
  );

/**
 * Builds the supported operator configs map for a custom property based on
 * its property type.
 */
const getCustomPropertyOperatorConfigsMap = (
  params: TCreateCustomPropertyFilterParams
): TOperatorConfigMap | undefined => {
  switch (params.property.property_type) {
    case "OPTION":
    case "MULTI_OPTION":
      return new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getCustomPropertyOptionMultiSelectConfig(updatedParams)
        ),
      ]);
    case "BOOLEAN":
      return new Map([
        createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) =>
          getCustomPropertyBooleanSelectConfig(updatedParams)
        ),
      ]);
    case "NUMBER":
      return new Map([
        createOperatorConfigEntry(COMPARISON_OPERATOR.GT, params, (updatedParams) =>
          getNumberPickerConfig(updatedParams)
        ),
        createOperatorConfigEntry(COMPARISON_OPERATOR.LT, params, (updatedParams) =>
          getNumberPickerConfig(updatedParams)
        ),
      ]);
    case "DATE":
      return new Map([
        createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) =>
          getDatePickerConfig(updatedParams)
        ),
        createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, params, (updatedParams) =>
          getDateRangePickerConfig(updatedParams)
        ),
      ]);
    case "USER":
      return new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getCustomPropertyMemberMultiSelectConfig(updatedParams)
        ),
      ]);
    default:
      // TEXT properties are not filterable
      return undefined;
  }
};

/**
 * Get the filter config of a work item custom property
 * @template K - The filter key (`customproperty_<property_id>`)
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the custom property filter config
 */
export const getCustomPropertyFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateCustomPropertyFilterParams> =>
  (params: TCreateCustomPropertyFilterParams) => {
    const supportedOperatorConfigsMap = getCustomPropertyOperatorConfigsMap(params);
    return createFilterConfig<P>({
      id: key,
      label: params.property.display_name,
      ...params,
      isEnabled: params.isEnabled && supportedOperatorConfigsMap !== undefined,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: supportedOperatorConfigsMap ?? new Map(),
    });
  };
