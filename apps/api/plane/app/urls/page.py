# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    PageViewSet,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageVersionEndpoint,
    PageDuplicateEndpoint,
    PageCommentViewSet,
    PageCommentReactionViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages-summary/",
        PageViewSet.as_view({"get": "summary"}),
        name="project-pages-summary",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}),
        name="project-pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/",
        PageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-pages",
    ),
    # favorite pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/favorite-pages/<uuid:page_id>/",
        PageFavoriteViewSet.as_view({"post": "create", "delete": "destroy"}),
        name="user-favorite-pages",
    ),
    # archived pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="project-page-archive-unarchive",
    ),
    # lock and unlock
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="project-pages-lock-unlock",
    ),
    # private and public page
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}),
        name="project-pages-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="page-description",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/duplicate/",
        PageDuplicateEndpoint.as_view(),
        name="page-duplicate",
    ),
    # page comments (document / inline comment threads)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/",
        PageCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="project-page-comment",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/",
        PageCommentViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-page-comment",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:pk>/resolve/",
        PageCommentViewSet.as_view({"post": "resolve", "delete": "unresolve"}),
        name="project-page-comment-resolve",
    ),
    # page comment reactions
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:comment_id>/reactions/",
        PageCommentReactionViewSet.as_view({"get": "list", "post": "create"}),
        name="project-page-comment-reaction",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/comments/<uuid:comment_id>/reactions/<str:reaction_code>/",
        PageCommentReactionViewSet.as_view({"delete": "destroy"}),
        name="project-page-comment-reaction",
    ),
]
