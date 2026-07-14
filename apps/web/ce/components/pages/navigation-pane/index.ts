/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TPageNavigationPaneTab = "outline" | "comments" | "sub_pages" | "info" | "assets";

export const PAGE_NAVIGATION_PANE_TABS_LIST: Record<
  TPageNavigationPaneTab,
  {
    key: TPageNavigationPaneTab;
    i18n_label: string;
  }
> = {
  outline: {
    key: "outline",
    i18n_label: "page_navigation_pane.tabs.outline.label",
  },
  comments: {
    key: "comments",
    i18n_label: "page_navigation_pane.tabs.comments.label",
  },
  sub_pages: {
    key: "sub_pages",
    i18n_label: "page_navigation_pane.tabs.sub_pages.label",
  },
  info: {
    key: "info",
    i18n_label: "page_navigation_pane.tabs.info.label",
  },
  assets: {
    key: "assets",
    i18n_label: "page_navigation_pane.tabs.assets.label",
  },
};

export const ORDERED_PAGE_NAVIGATION_TABS_LIST: {
  key: TPageNavigationPaneTab;
  i18n_label: string;
}[] = [
  PAGE_NAVIGATION_PANE_TABS_LIST.outline,
  PAGE_NAVIGATION_PANE_TABS_LIST.comments,
  PAGE_NAVIGATION_PANE_TABS_LIST.sub_pages,
  PAGE_NAVIGATION_PANE_TABS_LIST.info,
  PAGE_NAVIGATION_PANE_TABS_LIST.assets,
];
