# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    RequirementViewSet,
    RequirementRepositoryEndpoint,
    RequirementRepositorySyncEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirement-repository/",
        RequirementRepositoryEndpoint.as_view(),
        name="project-requirement-repository",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirement-repository/sync/",
        RequirementRepositorySyncEndpoint.as_view(),
        name="project-requirement-repository-sync",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/",
        RequirementViewSet.as_view({"get": "list"}),
        name="project-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:pk>/",
        RequirementViewSet.as_view({"get": "retrieve"}),
        name="project-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:pk>/history/",
        RequirementViewSet.as_view({"get": "history"}),
        name="project-requirement-history",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:pk>/propose-change/",
        RequirementViewSet.as_view({"post": "propose_change"}),
        name="project-requirement-propose-change",
    ),
]
