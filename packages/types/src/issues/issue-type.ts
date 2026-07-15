/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { TLogoProps } from "../common";

/**
 * A named work item type (with icon/color/description) scoped to a project.
 */
export type TIssueType = {
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
  project?: string | null;
  workspace: string;
  external_source?: string | null;
  external_id?: string | null;
  created_at?: string;
};
