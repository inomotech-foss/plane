/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Supported types of a work item custom property.
 */
export const ISSUE_CUSTOM_PROPERTY_TYPES = [
  "TEXT",
  "NUMBER",
  "OPTION",
  "MULTI_OPTION",
  "DATE",
  "BOOLEAN",
  "USER",
] as const;

export type TIssueCustomPropertyType = (typeof ISSUE_CUSTOM_PROPERTY_TYPES)[number];

/**
 * A selectable option of an OPTION / MULTI_OPTION custom property.
 */
export type TIssueCustomPropertyOption = {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  property: string;
  project: string;
  workspace: string;
};

/**
 * A custom property (typed custom field) defined on a project.
 */
export type TIssueCustomProperty = {
  id: string;
  name: string;
  display_name: string;
  property_type: TIssueCustomPropertyType;
  is_active: boolean;
  is_required: boolean;
  sort_order: number;
  settings: Record<string, unknown>;
  options: TIssueCustomPropertyOption[];
  project: string;
  workspace: string;
};

/**
 * The value of a single custom property on a work item. MULTI_OPTION
 * properties hold a list of option ids, OPTION / USER hold an id, NUMBER a
 * number, BOOLEAN a boolean, DATE an ISO string and TEXT a string.
 */
export type TIssueCustomPropertyValue = string | number | boolean | string[] | null;

/**
 * Map of property id to value for one work item.
 */
export type TIssueCustomPropertyValueMap = Record<string, TIssueCustomPropertyValue>;

/**
 * Response of the property-values endpoints: raw values plus human readable
 * display values (option names, user display names).
 */
export type TIssueCustomPropertyValuesResponse = {
  values: TIssueCustomPropertyValueMap;
  display: TIssueCustomPropertyValueMap;
};

/**
 * Response of the bulk property-values endpoint: map of work item id to its
 * property value map.
 */
export type TBulkIssueCustomPropertyValues = Record<string, TIssueCustomPropertyValueMap>;

/**
 * Display-property key under which a custom property is toggled on/off in
 * work item views.
 */
export type TIssueCustomPropertyDisplayKey = `custom_property_${string}`;

/**
 * The filter key of a custom property in work item filter expressions,
 * mirrored by the backend `property__<property_id>` query params.
 */
export type TIssueCustomPropertyFilterKey = `property__${string}`;
