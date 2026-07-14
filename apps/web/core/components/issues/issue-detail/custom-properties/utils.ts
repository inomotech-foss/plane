/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueCustomPropertyDisplayKey } from "@plane/types";

export const CUSTOM_PROPERTY_DISPLAY_KEY_PREFIX = "custom_property_";

/**
 * Returns the display-property key of a custom property.
 */
export const getCustomPropertyDisplayKey = (propertyId: string): TIssueCustomPropertyDisplayKey =>
  `${CUSTOM_PROPERTY_DISPLAY_KEY_PREFIX}${propertyId}`;

/**
 * Extracts the property id from a custom property display key, or undefined
 * when the key does not belong to a custom property.
 */
export const extractCustomPropertyId = (key: string): string | undefined =>
  key.startsWith(CUSTOM_PROPERTY_DISPLAY_KEY_PREFIX) ? key.slice(CUSTOM_PROPERTY_DISPLAY_KEY_PREFIX.length) : undefined;
