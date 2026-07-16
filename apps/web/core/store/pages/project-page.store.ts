/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { unset, set } from "lodash-es";
import { makeObservable, observable, runInAction, action, reaction, computed } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { EUserPermissions } from "@plane/constants";
import type { TPage, TPageFilters, TPageNavigationTabs } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// helpers
import { filterPagesByPageType, getPageName, orderPages, shouldFilterPage } from "@plane/utils";
// plane web constants
// plane web store
import type { RootStore } from "@/plane-web/store/root.store";
// services
import { ProjectPageService } from "@/services/page";
// store
import type { CoreRootStore } from "../root.store";
import { flattenVisibleTree } from "./page-tree";
import type { TProjectPage } from "./project-page";
import { ProjectPage } from "./project-page";

type TLoader = "init-loader" | "mutation-loader" | undefined;

type TError = { title: string; description: string };

/**
 * @description derived tree structure for the pages list.
 * `rootPageIds` are the top-level rows; `childPageIdsByParentId` maps a parent
 * page id to its ordered child page ids. Expand/collapse state is deliberately
 * NOT part of this structure so it can be memoized independently of it.
 */
export type TPageTreeStructure = {
  rootPageIds: string[];
  childPageIdsByParentId: Map<string, string[]>;
};

/**
 * @description a single row of the flattened, currently-visible pages tree.
 * `depth` is the indentation level and `hasChildren` drives the expand chevron.
 * The list contains only rows that are actually visible given the current
 * expand state, so the view can window over it without walking the tree.
 */
export type TPageVisibleRow = {
  pageId: string;
  depth: number;
  hasChildren: boolean;
};

export const ROLE_PERMISSIONS_TO_CREATE_PAGE = [
  EUserPermissions.ADMIN,
  EUserPermissions.MEMBER,
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.MEMBER,
];

export interface IProjectPageStore {
  // observables
  loader: TLoader;
  data: Record<string, TProjectPage>; // pageId => Page
  error: TError | undefined;
  filters: TPageFilters;
  expandedPageIds: Record<string, boolean>; // pageId => isExpanded
  // computed
  isAnyPageAvailable: boolean;
  canCurrentUserCreatePage: boolean;
  // helper actions
  getCurrentProjectPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  getCurrentProjectPageIds: (projectId: string) => string[];
  getCurrentProjectFilteredPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  getPageTreeStructureByTab: (pageType: TPageNavigationTabs) => TPageTreeStructure;
  getVisibleRows: (pageType: TPageNavigationTabs) => TPageVisibleRow[];
  getPageById: (pageId: string) => TProjectPage | undefined;
  getChildPageIds: (pageId: string) => string[];
  isPageExpanded: (pageId: string) => boolean;
  togglePageExpanded: (pageId: string) => void;
  updateFilters: <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => void;
  clearAllFilters: () => void;
  // actions
  fetchPagesList: (
    workspaceSlug: string,
    projectId: string,
    pageType?: TPageNavigationTabs
  ) => Promise<TPage[] | undefined>;
  fetchPageDetails: (
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    options?: { trackVisit?: boolean }
  ) => Promise<TPage | undefined>;
  createPage: (pageData: Partial<TPage>) => Promise<TPage | undefined>;
  removePage: (params: { pageId: string; shouldSync?: boolean }) => Promise<void>;
  movePage: (workspaceSlug: string, projectId: string, pageId: string, newProjectId: string) => Promise<void>;
}

export class ProjectPageStore implements IProjectPageStore {
  // observables
  loader: TLoader = "init-loader";
  data: Record<string, TProjectPage> = {}; // pageId => Page
  error: TError | undefined = undefined;
  filters: TPageFilters = {
    searchQuery: "",
    sortKey: "updated_at",
    sortBy: "desc",
  };
  expandedPageIds: Record<string, boolean> = {}; // pageId => isExpanded, collapsed by default
  // service
  service: ProjectPageService;
  rootStore: CoreRootStore;

  constructor(private store: RootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      data: observable,
      error: observable,
      filters: observable,
      expandedPageIds: observable,
      // computed
      isAnyPageAvailable: computed,
      canCurrentUserCreatePage: computed,
      pageChildrenMap: computed,
      // helper actions
      togglePageExpanded: action,
      updateFilters: action,
      clearAllFilters: action,
      // actions
      fetchPagesList: action,
      fetchPageDetails: action,
      createPage: action,
      removePage: action,
      movePage: action,
    });
    this.rootStore = store;
    // service
    this.service = new ProjectPageService();
    // initialize display filters of the current project
    reaction(
      () => this.store.router.projectId,
      (projectId) => {
        if (!projectId) return;
        this.filters.searchQuery = "";
      }
    );
  }

  /**
   * @description check if any page is available
   */
  get isAnyPageAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  /**
   * @description returns true if the current logged in user can create a page
   */
  get canCurrentUserCreatePage() {
    const { workspaceSlug, projectId } = this.store.router;
    const currentUserProjectRole = this.store.user.permission.getProjectRoleByWorkspaceSlugAndProjectId(
      workspaceSlug?.toString() || "",
      projectId?.toString() || ""
    );
    return !!currentUserProjectRole && ROLE_PERMISSIONS_TO_CREATE_PAGE.includes(currentUserProjectRole);
  }

  /**
   * @description get the current project page ids based on the pageType
   * @param {TPageNavigationTabs} pageType
   */
  getCurrentProjectPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;
    // helps to filter pages based on the pageType
    let pagesByType = filterPagesByPageType(pageType, Object.values(this?.data || {}));
    pagesByType = pagesByType.filter((p) => p.project_ids?.includes(projectId));

    const pages = (pagesByType.map((page) => page.id) as string[]) || undefined;

    return pages ?? undefined;
  });

  /**
   * @description get the current project page ids
   * @param {string} projectId
   */
  getCurrentProjectPageIds = computedFn((projectId: string) => {
    if (!projectId) return [];
    const pages = Object.values(this?.data || {}).filter((page) => page.project_ids?.includes(projectId));
    return pages.map((page) => page.id) as string[];
  });

  /**
   * @description get the current project filtered page ids based on the pageType
   * @param {TPageNavigationTabs} pageType
   */
  getCurrentProjectFilteredPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;

    // helps to filter pages based on the pageType
    const pagesByType = filterPagesByPageType(pageType, Object.values(this?.data || {}));
    let filteredPages = pagesByType.filter(
      (p) =>
        p.project_ids?.includes(projectId) &&
        getPageName(p.name).toLowerCase().includes(this.filters.searchQuery.toLowerCase()) &&
        shouldFilterPage(p, this.filters.filters)
    );
    filteredPages = orderPages(filteredPages, this.filters.sortKey, this.filters.sortBy);

    const pages = (filteredPages.map((page) => page.id) as string[]) || undefined;

    return pages ?? undefined;
  });

  /**
   * @description build the parent/child tree structure for the pages list of a tab.
   *
   * This is a MobX computedFn, so it is memoized and only recomputed when its
   * inputs change: the filtered/sorted page id list (data, filters, sort) or a
   * page's `parent`. It deliberately does NOT read `expandedPageIds`, so
   * expanding/collapsing a node does not invalidate it — no re-filter, no
   * re-sort, and no full regroup happen on a toggle.
   *
   * Behavior mirrors the previous inline grouping: siblings keep the applied
   * sort order, pages whose parent is not in the current result set become
   * roots, and pages caught in a parent cycle are promoted to roots (and
   * detached from their parent) instead of being hidden or recursing forever.
   * @param {TPageNavigationTabs} pageType
   */
  getPageTreeStructureByTab = computedFn((pageType: TPageNavigationTabs): TPageTreeStructure => {
    const filteredPageIds = this.getCurrentProjectFilteredPageIdsByTab(pageType) ?? [];

    const filteredPageIdsSet = new Set(filteredPageIds);
    const rootPageIds: string[] = [];
    const childPageIdsByParentId = new Map<string, string[]>();
    for (const pageId of filteredPageIds) {
      const parentId = this.getPageById(pageId)?.parent;
      if (parentId && parentId !== pageId && filteredPageIdsSet.has(parentId)) {
        const siblingIds = childPageIdsByParentId.get(parentId);
        if (siblingIds) siblingIds.push(pageId);
        else childPageIdsByParentId.set(parentId, [pageId]);
      } else {
        rootPageIds.push(pageId);
      }
    }

    // safety net for malformed data: pages caught in a parent cycle are unreachable from any
    // root, so promote them to roots instead of silently hiding them.
    const reachablePageIds = new Set<string>();
    const idsToVisit = [...rootPageIds];
    while (idsToVisit.length > 0) {
      const pageId = idsToVisit.pop();
      if (!pageId || reachablePageIds.has(pageId)) continue;
      reachablePageIds.add(pageId);
      idsToVisit.push(...(childPageIdsByParentId.get(pageId) ?? []));
    }
    if (reachablePageIds.size < filteredPageIds.length) {
      for (const pageId of filteredPageIds) {
        if (reachablePageIds.has(pageId)) continue;
        rootPageIds.push(pageId);
        // detach the promoted page from its parent to break the cycle while rendering
        const parentId = this.getPageById(pageId)?.parent;
        if (parentId) {
          const siblingIds = childPageIdsByParentId.get(parentId);
          if (siblingIds) {
            childPageIdsByParentId.set(
              parentId,
              siblingIds.filter((siblingId) => siblingId !== pageId)
            );
          }
        }
      }
    }

    return { rootPageIds, childPageIdsByParentId };
  });

  /**
   * @description flatten the tree into the ordered list of currently-visible rows.
   *
   * Unlike `getPageTreeStructureByTab`, this reads `expandedPageIds`, so a toggle
   * recomputes it. That is intentional and cheap: the tree structure itself is a
   * memoized computedFn (a cache hit here), and this only walks the visible rows
   * (bounded by what is expanded), doing no re-filter, re-sort, or full regroup.
   * The view windows over this list, so render cost stays proportional to the
   * viewport, not to the total number of pages.
   * @param {TPageNavigationTabs} pageType
   */
  getVisibleRows = computedFn((pageType: TPageNavigationTabs): TPageVisibleRow[] =>
    flattenVisibleTree(this.getPageTreeStructureByTab(pageType), this.expandedPageIds)
  );

  /**
   * @description get the page store by id
   * @param {string} pageId
   */
  getPageById = computedFn((pageId: string) => this.data?.[pageId] || undefined);

  /**
   * @description map of parent page id to its direct, non-archived child page ids, ordered by the
   * applied sort. Built once and memoized, so repeated child lookups don't each scan all pages.
   */
  get pageChildrenMap(): Map<string, string[]> {
    const childrenByParent = new Map<string, TProjectPage[]>();
    for (const page of Object.values(this.data)) {
      if (page.archived_at || !page.parent) continue;
      const siblings = childrenByParent.get(page.parent);
      if (siblings) siblings.push(page);
      else childrenByParent.set(page.parent, [page]);
    }
    const orderedByParent = new Map<string, string[]>();
    for (const [parentId, children] of childrenByParent) {
      const orderedIds = orderPages(children, this.filters.sortKey, this.filters.sortBy)
        .map((page) => page.id)
        .filter((id): id is string => !!id);
      orderedByParent.set(parentId, orderedIds);
    }
    return orderedByParent;
  }

  /**
   * @description get the ids of the direct, non-archived children of a page, ordered by the applied sort
   * @param {string} pageId
   */
  getChildPageIds = computedFn((pageId: string) => this.pageChildrenMap.get(pageId) ?? []);

  /**
   * @description returns whether a page is expanded in the pages list tree
   * @param {string} pageId
   */
  isPageExpanded = computedFn((pageId: string) => !!this.expandedPageIds[pageId]);

  /**
   * @description toggle the expanded state of a page in the pages list tree
   * @param {string} pageId
   */
  togglePageExpanded = (pageId: string) => {
    runInAction(() => {
      set(this.expandedPageIds, [pageId], !this.expandedPageIds[pageId]);
    });
  };

  updateFilters = <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => {
    runInAction(() => {
      set(this.filters, [filterKey], filterValue);
    });
  };

  /**
   * @description clear all the filters
   */
  clearAllFilters = () =>
    runInAction(() => {
      set(this.filters, ["filters"], {});
    });

  /**
   * @description fetch all the pages
   */
  fetchPagesList = async (workspaceSlug: string, projectId: string, pageType?: TPageNavigationTabs) => {
    try {
      if (!workspaceSlug || !projectId) return undefined;

      const currentPageIds = pageType ? this.getCurrentProjectPageIdsByTab(pageType) : undefined;
      runInAction(() => {
        this.loader = currentPageIds && currentPageIds.length > 0 ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const pages = await this.service.fetchAll(workspaceSlug, projectId);
      runInAction(() => {
        for (const page of pages) {
          if (page?.id) {
            const existingPage = this.getPageById(page.id);
            if (existingPage) {
              // If page already exists, update all fields except name

              const { name, ...otherFields } = page;
              existingPage.mutateProperties(otherFields, false);
            } else {
              // If new page, create a new instance with all data
              set(this.data, [page.id], new ProjectPage(this.store, page));
            }
          }
        }
        this.loader = undefined;
      });

      return pages;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the pages, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description fetch the details of a page
   * @param {string} pageId
   */
  fetchPageDetails = async (...args: Parameters<IProjectPageStore["fetchPageDetails"]>) => {
    const [workspaceSlug, projectId, pageId, options] = args;
    const { trackVisit } = options || {};
    try {
      if (!workspaceSlug || !projectId || !pageId) return undefined;

      const currentPageId = this.getPageById(pageId);
      runInAction(() => {
        this.loader = currentPageId ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const page = await this.service.fetchById(workspaceSlug, projectId, pageId, trackVisit ?? true);

      runInAction(() => {
        if (page?.id) {
          const pageInstance = this.getPageById(page.id);
          if (pageInstance) {
            pageInstance.mutateProperties(page, false);
          } else {
            set(this.data, [page.id], new ProjectPage(this.store, page));
          }
        }
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description create a page
   * @param {Partial<TPage>} pageData
   */
  createPage = async (pageData: Partial<TPage>) => {
    try {
      const { workspaceSlug, projectId } = this.store.router;
      if (!workspaceSlug || !projectId) return undefined;

      runInAction(() => {
        this.loader = "mutation-loader";
        this.error = undefined;
      });

      const page = await this.service.create(workspaceSlug, projectId, pageData);
      runInAction(() => {
        if (page?.id) set(this.data, [page.id], new ProjectPage(this.store, page));
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to create a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description delete a page
   * @param {string} pageId
   */
  removePage = async ({ pageId, shouldSync: _shouldSync = true }: { pageId: string; shouldSync?: boolean }) => {
    try {
      const { workspaceSlug, projectId } = this.store.router;
      if (!workspaceSlug || !projectId || !pageId) return undefined;

      await this.service.remove(workspaceSlug, projectId, pageId);
      runInAction(() => {
        unset(this.data, [pageId]);
        if (this.rootStore.favorite.entityMap[pageId]) this.rootStore.favorite.removeFavoriteFromStore(pageId);
      });
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to delete a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description move a page to a new project
   * @param {string} workspaceSlug
   * @param {string} projectId
   * @param {string} pageId
   * @param {string} newProjectId
   */
  movePage = async (workspaceSlug: string, projectId: string, pageId: string, newProjectId: string) => {
    try {
      await this.service.move(workspaceSlug, projectId, pageId, newProjectId);
      runInAction(() => {
        unset(this.data, [pageId]);
      });
    } catch (error) {
      console.error("Unable to move page", error);
      throw error;
    }
  };
}
