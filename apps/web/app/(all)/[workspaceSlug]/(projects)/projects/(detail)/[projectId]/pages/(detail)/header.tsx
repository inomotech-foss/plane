/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { PageIcon } from "@plane/propel/icons";
import type { ICustomSearchSelectOption } from "@plane/types";
import { Breadcrumbs, CustomMenu, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
import { getPageName } from "@plane/utils";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageAccessIcon } from "@/components/common/page-access-icon";
import { SwitcherIcon, SwitcherLabel } from "@/components/common/switcher-label";
import { PageHeaderActions } from "@/components/pages/header/actions";
import { PageSyncingBadge } from "@/components/pages/header/syncing-badge";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { PageDetailsHeaderExtraActions } from "@/plane-web/components/pages";
import { EPageStoreType, usePage, usePageStore } from "@/hooks/store";

export interface IPagesHeaderProps {
  showButton?: boolean;
}

const storeType = EPageStoreType.PROJECT;

export const PageDetailsHeader = observer(function PageDetailsHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, pageId, projectId } = useParams();
  // store hooks
  const { loader } = useProject();
  const { getPageById, getCurrentProjectPageIds, getPageAncestorIds } = usePageStore(storeType);
  const page = usePage({
    pageId: pageId?.toString() ?? "",
    storeType,
  });
  // derived values
  const projectPageIds = getCurrentProjectPageIds(projectId?.toString());
  const pageLink = (id: string) => `/${workspaceSlug}/projects/${projectId}/pages/${id}`;
  // ancestor chain, root first; deep chains collapse the middle into a dropdown
  const ancestorIds = pageId ? getPageAncestorIds(pageId.toString()) : [];
  const collapseAncestors = ancestorIds.length > 3;
  const visibleAncestorIds = collapseAncestors ? [ancestorIds[0]] : ancestorIds;
  const collapsedAncestorIds = collapseAncestors ? ancestorIds.slice(1, -1) : [];
  const trailingAncestorIds = collapseAncestors ? [ancestorIds[ancestorIds.length - 1]] : [];

  const renderAncestorCrumb = (ancestorId: string) => {
    const ancestor = getPageById(ancestorId);
    if (!ancestor) return null;
    return (
      <Breadcrumbs.Item
        key={ancestorId}
        component={
          <BreadcrumbLink
            label={getPageName(ancestor.name)}
            href={pageLink(ancestorId)}
            icon={<SwitcherIcon logo_props={ancestor.logo_props} LabelIcon={PageIcon} size={14} />}
          />
        }
      />
    );
  };

  const switcherOptions = projectPageIds
    .map((id) => {
      const _page = id === pageId ? page : getPageById(id);
      if (!_page) return;
      return {
        value: _page.id,
        query: _page.name,
        content: (
          <div className="flex items-center justify-between gap-2">
            <SwitcherLabel logo_props={_page.logo_props} name={getPageName(_page.name)} LabelIcon={PageIcon} />
            <PageAccessIcon {..._page} />
          </div>
        ),
      };
    })
    .filter((option) => option !== undefined) as ICustomSearchSelectOption[];

  if (!page) return null;

  return (
    <Header>
      <Header.LeftItem>
        <div>
          <Breadcrumbs isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Pages"
                  href={`/${workspaceSlug}/projects/${projectId}/pages/`}
                  icon={<PageIcon className="h-4 w-4 text-tertiary" />}
                />
              }
            />

            {visibleAncestorIds.map(renderAncestorCrumb)}
            {collapsedAncestorIds.length > 0 && (
              <Breadcrumbs.Item
                component={
                  <CustomMenu
                    customButton={
                      <span className="grid place-items-center rounded-sm px-1 py-0.5 text-13 text-secondary hover:bg-layer-transparent-hover hover:text-primary">
                        …
                      </span>
                    }
                    placement="bottom-start"
                    closeOnSelect
                  >
                    {collapsedAncestorIds.map((ancestorId) => {
                      const ancestor = getPageById(ancestorId);
                      if (!ancestor) return null;
                      return (
                        <CustomMenu.MenuItem
                          key={ancestorId}
                          onClick={() => router.push(pageLink(ancestorId))}
                          className="flex items-center gap-2"
                        >
                          <SwitcherIcon logo_props={ancestor.logo_props} LabelIcon={PageIcon} size={14} />
                          <span className="truncate">{getPageName(ancestor.name)}</span>
                        </CustomMenu.MenuItem>
                      );
                    })}
                  </CustomMenu>
                }
              />
            )}
            {trailingAncestorIds.map(renderAncestorCrumb)}

            <Breadcrumbs.Item
              component={
                <BreadcrumbNavigationSearchDropdown
                  selectedItem={pageId?.toString() ?? ""}
                  navigationItems={switcherOptions}
                  onChange={(value: string) => {
                    router.push(`/${workspaceSlug}/projects/${projectId}/pages/${value}`);
                  }}
                  title={getPageName(page?.name)}
                  icon={
                    <Breadcrumbs.Icon>
                      <SwitcherIcon logo_props={page.logo_props} LabelIcon={PageIcon} size={16} />
                    </Breadcrumbs.Icon>
                  }
                  isLast
                />
              }
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        <PageSyncingBadge syncStatus={page.isSyncingWithServer} />
        <PageDetailsHeaderExtraActions page={page} storeType={storeType} />
        <PageHeaderActions page={page} storeType={storeType} />
      </Header.RightItem>
    </Header>
  );
});
