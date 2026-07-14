/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TBulkIssueCustomPropertyValues,
  TIssueCustomProperty,
  TIssueCustomPropertyOption,
  TIssueCustomPropertyValueMap,
  TIssueCustomPropertyValuesResponse,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IssueCustomPropertyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getProjectProperties(workspaceSlug: string, projectId: string): Promise<TIssueCustomProperty[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createProperty(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ): Promise<TIssueCustomProperty> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchProperty(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssueCustomProperty>
  ): Promise<TIssueCustomProperty> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/${propertyId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProperty(workspaceSlug: string, projectId: string, propertyId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/${propertyId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createOption(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssueCustomPropertyOption>
  ): Promise<TIssueCustomPropertyOption> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/${propertyId}/options/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchOption(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssueCustomPropertyOption>
  ): Promise<TIssueCustomPropertyOption> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/${propertyId}/options/${optionId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteOption(workspaceSlug: string, projectId: string, propertyId: string, optionId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/${propertyId}/options/${optionId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssueCustomPropertyValuesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueCustomPropertyValueMap
  ): Promise<TIssueCustomPropertyValuesResponse> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getBulkValues(
    workspaceSlug: string,
    projectId: string,
    issueIds?: string[]
  ): Promise<TBulkIssueCustomPropertyValues> {
    const query = issueIds?.length ? `?issue_ids=${issueIds.join(",")}` : "";
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-property-values/${query}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
