/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlignLeft, Calendar, CheckSquare, ChevronDownSquare, Hash, ListChecks, UserCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
// plane imports
import type { TIssueCustomPropertyType } from "@plane/types";

const PROPERTY_TYPE_ICONS: Record<TIssueCustomPropertyType, LucideIcon> = {
  TEXT: AlignLeft,
  NUMBER: Hash,
  OPTION: ChevronDownSquare,
  MULTI_OPTION: ListChecks,
  DATE: Calendar,
  BOOLEAN: CheckSquare,
  USER: UserCircle2,
};

type TCustomPropertyIconProps = {
  propertyType: TIssueCustomPropertyType;
  className?: string;
};

export function CustomPropertyIcon(props: TCustomPropertyIconProps) {
  const { propertyType, className } = props;
  const Icon = PROPERTY_TYPE_ICONS[propertyType] ?? AlignLeft;
  return <Icon className={className} />;
}
