/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty, TIssueType, TSupportedOperators } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import { getMultiSelectConfig } from "../../../rich-filters/factories/configs/core";
import type {
  TCreateFilterConfigParams,
  IFilterIconConfig,
  TCreateFilterConfig,
} from "../../../rich-filters/factories/configs/shared";
import { createFilterConfig, createOperatorConfigEntry } from "../../../rich-filters/factories/configs/shared";

/**
 * Work item type filter specific params
 */
export type TCreateIssueTypeFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<TIssueType> & {
    issueTypes: TIssueType[];
  };

/**
 * Helper to get the work item type multi select config
 * @param params - The filter params
 * @returns The work item type multi select config
 */
export const getIssueTypeMultiSelectConfig = (
  params: TCreateIssueTypeFilterParams,
  singleValueOperator: TSupportedOperators
) =>
  getMultiSelectConfig<TIssueType, string, TIssueType>(
    {
      items: params.issueTypes,
      getId: (issueType) => issueType.id,
      getLabel: (issueType) => issueType.name,
      getValue: (issueType) => issueType.id,
      getIconData: (issueType) => issueType,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      getOptionIcon: params.getOptionIcon,
    }
  );

/**
 * Get the work item type filter config
 * @template K - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the work item type filter config
 */
export const getIssueTypeFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateIssueTypeFilterParams> =>
  (params: TCreateIssueTypeFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Work item type",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getIssueTypeMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
        ),
      ]),
    });
