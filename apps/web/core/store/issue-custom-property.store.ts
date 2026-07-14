/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  TIssueCustomProperty,
  TIssueCustomPropertyOption,
  TIssueCustomPropertyValue,
  TIssueCustomPropertyValueMap,
} from "@plane/types";
// services
import { IssueCustomPropertyService } from "@/services/issue";
// store
import type { CoreRootStore } from "./root.store";

export interface IIssueCustomPropertyStore {
  // loaders
  fetchedMap: Record<string, boolean>;
  valuesFetchedMap: Record<string, boolean>;
  // observables
  propertyMap: Record<string, TIssueCustomProperty>;
  issueValuesMap: Record<string, TIssueCustomPropertyValueMap>;
  // computed actions
  getProjectProperties: (projectId: string | undefined | null) => TIssueCustomProperty[] | undefined;
  getActiveProjectProperties: (projectId: string | undefined | null) => TIssueCustomProperty[] | undefined;
  getPropertyById: (propertyId: string) => TIssueCustomProperty | null;
  getIssueValues: (issueId: string) => TIssueCustomPropertyValueMap | undefined;
  getIssueValue: (issueId: string, propertyId: string) => TIssueCustomPropertyValue | undefined;
  // fetch actions
  fetchProjectProperties: (workspaceSlug: string, projectId: string) => Promise<TIssueCustomProperty[]>;
  fetchBulkValues: (workspaceSlug: string, projectId: string) => Promise<void>;
  fetchIssueValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  // crud actions
  createProperty: (
    workspaceSlug: string,
    projectId: string,
    data: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ) => Promise<TIssueCustomProperty>;
  updateProperty: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssueCustomProperty>
  ) => Promise<TIssueCustomProperty>;
  deleteProperty: (workspaceSlug: string, projectId: string, propertyId: string) => Promise<void>;
  createOption: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssueCustomPropertyOption>
  ) => Promise<TIssueCustomPropertyOption>;
  updateOption: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssueCustomPropertyOption>
  ) => Promise<TIssueCustomPropertyOption>;
  deleteOption: (workspaceSlug: string, projectId: string, propertyId: string, optionId: string) => Promise<void>;
  // value actions
  updateIssueValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueCustomPropertyValueMap
  ) => Promise<void>;
}

export class IssueCustomPropertyStore implements IIssueCustomPropertyStore {
  // observables
  propertyMap: Record<string, TIssueCustomProperty> = {};
  issueValuesMap: Record<string, TIssueCustomPropertyValueMap> = {};
  // loaders
  fetchedMap: Record<string, boolean> = {};
  valuesFetchedMap: Record<string, boolean> = {};
  // root store
  rootStore;
  // services
  customPropertyService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      propertyMap: observable,
      issueValuesMap: observable,
      fetchedMap: observable,
      valuesFetchedMap: observable,
      fetchProjectProperties: action,
      fetchBulkValues: action,
      fetchIssueValues: action,
      createProperty: action,
      updateProperty: action,
      deleteProperty: action,
      createOption: action,
      updateOption: action,
      deleteOption: action,
      updateIssueValues: action,
    });

    this.rootStore = _rootStore;
    this.customPropertyService = new IssueCustomPropertyService();
  }

  /**
   * Returns all custom properties of a project ordered by sort order.
   */
  getProjectProperties = computedFn((projectId: string | undefined | null) => {
    if (!projectId || !this.fetchedMap[projectId]) return;
    return sortBy(
      Object.values(this.propertyMap).filter((property) => property.project === projectId),
      "sort_order"
    );
  });

  /**
   * Returns the active (non-deactivated) custom properties of a project.
   */
  getActiveProjectProperties = computedFn((projectId: string | undefined | null) =>
    this.getProjectProperties(projectId)?.filter((property) => property.is_active)
  );

  getPropertyById = computedFn(
    (propertyId: string): TIssueCustomProperty | null => this.propertyMap?.[propertyId] || null
  );

  /**
   * Returns the `{property_id: value}` map of a work item.
   */
  getIssueValues = computedFn((issueId: string) => this.issueValuesMap?.[issueId]);

  getIssueValue = computedFn((issueId: string, propertyId: string) => this.issueValuesMap?.[issueId]?.[propertyId]);

  /**
   * Fetches all custom properties (with their options) of a project.
   */
  fetchProjectProperties = async (workspaceSlug: string, projectId: string) =>
    await this.customPropertyService.getProjectProperties(workspaceSlug, projectId).then((response) => {
      runInAction(() => {
        // Drop stale properties of the project before applying the fresh list
        Object.values(this.propertyMap).forEach((property) => {
          if (property.project === projectId && !response.some((fetched) => fetched.id === property.id))
            delete this.propertyMap[property.id];
        });
        response.forEach((property) => {
          set(this.propertyMap, [property.id], property);
        });
        set(this.fetchedMap, projectId, true);
      });
      return response;
    });

  /**
   * Fetches the custom property values of all work items of a project in one
   * call so views can render custom fields without per-item requests.
   */
  fetchBulkValues = async (workspaceSlug: string, projectId: string) =>
    await this.customPropertyService.getBulkValues(workspaceSlug, projectId).then((response) => {
      runInAction(() => {
        Object.entries(response).forEach(([issueId, values]) => {
          set(this.issueValuesMap, [issueId], values);
        });
        set(this.valuesFetchedMap, projectId, true);
      });
    });

  /**
   * Fetches the custom property values of a single work item.
   */
  fetchIssueValues = async (workspaceSlug: string, projectId: string, issueId: string) =>
    await this.customPropertyService.getIssueValues(workspaceSlug, projectId, issueId).then((response) => {
      runInAction(() => {
        set(this.issueValuesMap, [issueId], response.values);
      });
    });

  createProperty = async (
    workspaceSlug: string,
    projectId: string,
    data: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ) =>
    await this.customPropertyService.createProperty(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.propertyMap, [response.id], response);
      });
      return response;
    });

  updateProperty = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssueCustomProperty>
  ) => {
    const originalProperty = this.propertyMap[propertyId];
    try {
      runInAction(() => {
        set(this.propertyMap, [propertyId], { ...originalProperty, ...data });
      });
      const response = await this.customPropertyService.patchProperty(workspaceSlug, projectId, propertyId, data);
      runInAction(() => {
        set(this.propertyMap, [propertyId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.propertyMap, [propertyId], originalProperty);
      });
      throw error;
    }
  };

  deleteProperty = async (workspaceSlug: string, projectId: string, propertyId: string) => {
    if (!this.propertyMap[propertyId]) return;
    await this.customPropertyService.deleteProperty(workspaceSlug, projectId, propertyId).then(() => {
      runInAction(() => {
        delete this.propertyMap[propertyId];
      });
    });
  };

  createOption = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssueCustomPropertyOption>
  ) =>
    await this.customPropertyService.createOption(workspaceSlug, projectId, propertyId, data).then((response) => {
      runInAction(() => {
        const property = this.propertyMap[propertyId];
        if (property) set(this.propertyMap, [propertyId, "options"], [...property.options, response]);
      });
      return response;
    });

  updateOption = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssueCustomPropertyOption>
  ) => {
    const property = this.propertyMap[propertyId];
    const originalOptions = property?.options;
    try {
      if (property)
        runInAction(() => {
          set(
            this.propertyMap,
            [propertyId, "options"],
            property.options.map((option) => (option.id === optionId ? { ...option, ...data } : option))
          );
        });
      return await this.customPropertyService.patchOption(workspaceSlug, projectId, propertyId, optionId, data);
    } catch (error) {
      if (property && originalOptions)
        runInAction(() => {
          set(this.propertyMap, [propertyId, "options"], originalOptions);
        });
      throw error;
    }
  };

  deleteOption = async (workspaceSlug: string, projectId: string, propertyId: string, optionId: string) => {
    await this.customPropertyService.deleteOption(workspaceSlug, projectId, propertyId, optionId).then(() => {
      runInAction(() => {
        const property = this.propertyMap[propertyId];
        if (property)
          set(
            this.propertyMap,
            [propertyId, "options"],
            property.options.filter((option) => option.id !== optionId)
          );
      });
    });
  };

  /**
   * Replaces the values of the listed properties on a work item. Applies the
   * change optimistically and reverts on error.
   */
  updateIssueValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueCustomPropertyValueMap
  ) => {
    const originalValues = this.issueValuesMap[issueId];
    try {
      runInAction(() => {
        set(this.issueValuesMap, [issueId], { ...originalValues, ...data });
      });
      const response = await this.customPropertyService.updateIssueValues(workspaceSlug, projectId, issueId, data);
      runInAction(() => {
        set(this.issueValuesMap, [issueId], response.values);
      });
    } catch (error) {
      runInAction(() => {
        set(this.issueValuesMap, [issueId], originalValues);
      });
      throw error;
    }
  };
}
