/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// mobx store
import { StoreContext } from "@/lib/store-context";
// types
import type { IIssueCustomPropertyStore } from "@/store/issue-custom-property.store";

export const useIssueCustomProperties = (): IIssueCustomPropertyStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useIssueCustomProperties must be used within StoreProvider");
  return context.issueCustomProperty;
};
