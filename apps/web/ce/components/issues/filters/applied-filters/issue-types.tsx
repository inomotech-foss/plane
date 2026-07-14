/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// icons
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CloseIcon } from "@plane/propel/icons";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  handleRemove: (val: string) => void;
  values: string[];
  editable: boolean | undefined;
};

export const AppliedIssueTypeFilters = observer(function AppliedIssueTypeFilters(props: Props) {
  const { handleRemove, values, editable } = props;
  // hooks
  const { getIssueTypeById } = useIssueTypes();

  return (
    <>
      {values.map((typeId) => {
        const issueType = getIssueTypeById(typeId);
        if (!issueType) return null;
        return (
          <div key={typeId} className="flex items-center gap-1 rounded-sm bg-layer-1 p-1 text-11">
            <Logo logo={issueType.logo_props} size={12} />
            {issueType.name}
            {editable && (
              <button
                type="button"
                className="grid place-items-center text-tertiary hover:text-secondary"
                onClick={() => handleRemove(typeId)}
              >
                <CloseIcon height={10} width={10} strokeWidth={2} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
});
