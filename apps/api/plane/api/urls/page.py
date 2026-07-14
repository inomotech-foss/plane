# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    PageListCreateAPIEndpoint,
    PageDetailAPIEndpoint,
    PageCommentListCreateAPIEndpoint,
    PageCommentDetailAPIEndpoint,
    PageCommentResolveAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/",
        PageDetailAPIEndpoint.as_view(http_method_names=["get", "patch"]),
        name="pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/",
        PageCommentListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="page-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/",
        PageCommentDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="page-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/resolve/",
        PageCommentResolveAPIEndpoint.as_view(http_method_names=["post", "delete"]),
        name="page-comments-resolve",
    ),
]
