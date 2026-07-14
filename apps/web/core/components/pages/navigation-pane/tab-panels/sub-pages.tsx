/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import { ScrollArea } from "@plane/propel/scrollarea";
import { getPageName } from "@plane/utils";
// hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

type SubPageItemProps = {
  pageId: string;
  storeType: EPageStoreType;
};

const SubPageItem = observer(function SubPageItem(props: SubPageItemProps) {
  const { pageId, storeType } = props;
  // store hooks
  const { getPageById } = usePageStore(storeType);
  // derived values
  const subPage = getPageById(pageId);

  if (!subPage) return null;

  return (
    <Link
      href={subPage.getRedirectionLink()}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-layer-1"
    >
      <span className="flex flex-shrink-0 items-center">
        {subPage.logo_props?.in_use ? (
          <Logo logo={subPage.logo_props} size={14} type="lucide" />
        ) : (
          <PageIcon className="size-3.5 text-tertiary" />
        )}
      </span>
      <span className="truncate text-13 font-medium">{getPageName(subPage.name)}</span>
    </Link>
  );
});

export const PageNavigationPaneSubPagesTabPanel = observer(function PageNavigationPaneSubPagesTabPanel(props: Props) {
  const { page, storeType } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { getChildPageIds, fetchPagesList } = usePageStore(storeType);
  // translation
  const { t } = useTranslation();
  // derived values
  const projectId = page.project_ids?.[0];
  // make sure the project pages list is available when the page is opened directly
  useSWR(
    workspaceSlug && projectId ? `PROJECT_PAGES_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchPagesList(workspaceSlug.toString(), projectId) : null
  );
  const subPageIds = page.id ? getChildPageIds(page.id) : [];

  if (subPageIds.length === 0)
    return (
      <div className="grid size-full place-items-center px-4">
        <div className="space-y-2.5 text-center">
          <h4 className="text-14 font-medium">{t("page_navigation_pane.tabs.sub_pages.empty_state.title")}</h4>
          <p className="text-13 font-medium text-secondary">
            {t("page_navigation_pane.tabs.sub_pages.empty_state.description")}
          </p>
        </div>
      </div>
    );

  return (
    <ScrollArea
      orientation="vertical"
      size="sm"
      scrollType="hover"
      className="hide-scrollbar size-full overflow-y-auto"
      viewportClassName="px-2.5"
    >
      <div className="mt-2 space-y-0.5">
        {subPageIds.map((subPageId) => (
          <SubPageItem key={subPageId} pageId={subPageId} storeType={storeType} />
        ))}
      </div>
    </ScrollArea>
  );
});
