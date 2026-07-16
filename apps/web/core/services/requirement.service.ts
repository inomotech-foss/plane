/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TProposeChangePayload,
  TProposeChangeResponse,
  TRequirement,
  TRequirementCommit,
  TRequirementRepository,
  TRequirementRepositoryPayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TRequirement[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/requirements/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, requirementId: string): Promise<TRequirement> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/requirements/${requirementId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async proposeChange(
    workspaceSlug: string,
    projectId: string,
    requirementId: string,
    payload: TProposeChangePayload
  ): Promise<TProposeChangeResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/requirements/${requirementId}/propose-change/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getRepository(workspaceSlug: string, projectId: string): Promise<TRequirementRepository | Record<string, never>> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/requirement-repository/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRepository(
    workspaceSlug: string,
    projectId: string,
    payload: TRequirementRepositoryPayload
  ): Promise<TRequirementRepository> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/requirement-repository/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async history(workspaceSlug: string, projectId: string, requirementId: string): Promise<TRequirementCommit[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/requirements/${requirementId}/history/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async sync(workspaceSlug: string, projectId: string): Promise<{ message: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/requirement-repository/sync/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const requirementService = new RequirementService();
