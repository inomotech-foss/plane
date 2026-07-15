/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
// components
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (val: string) => void;
  searchQuery: string;
};

export const FilterIssueTypes = observer(function FilterIssueTypes(props: Props) {
  const { appliedFilters, handleUpdate, searchQuery } = props;
  // router
  const { projectId } = useParams();
  // hooks
  const { t } = useTranslation();
  const { getActiveProjectIssueTypes } = useIssueTypes();
  // states
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const appliedFiltersCount = appliedFilters?.length ?? 0;
  const appliedFiltersSet = new Set(appliedFilters ?? []);
  const issueTypes = getActiveProjectIssueTypes(projectId?.toString()) ?? [];
  const filteredOptions = issueTypes.filter((type) => type.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (issueTypes.length === 0) return null;

  return (
    <>
      <FilterHeader
        title={`${t("work_item_types.label")} ${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((type) => (
              <FilterOption
                key={type.id}
                isChecked={appliedFiltersSet.has(type.id)}
                onClick={() => handleUpdate(type.id)}
                icon={<Logo logo={type.logo_props} size={14} />}
                title={type.name}
              />
            ))
          ) : (
            <p className="text-11 text-placeholder italic">{t("common.search.no_matches_found")}</p>
          )}
        </div>
      )}
    </>
  );
});
