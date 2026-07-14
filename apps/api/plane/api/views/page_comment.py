# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.api.serializers.page_comment import PageCommentSerializer
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import Page, PageComment
from .base import BaseAPIView


class PageCommentListCreateAPIEndpoint(BaseAPIView):
    """Page Comment List and Create Endpoint"""

    serializer_class = PageCommentSerializer
    model = PageComment
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            PageComment.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"))
            .filter(page__projects__id=self.kwargs.get("project_id"))
            .filter(
                page__projects__project_projectmember__member=self.request.user,
                page__projects__project_projectmember__is_active=True,
            )
            .select_related("workspace", "page", "actor", "resolved_by")
            .distinct()
        )

    def get(self, request, slug, project_id, page_id):
        return self.paginate(
            request=request,
            queryset=self.get_queryset().order_by("created_at"),
            on_results=lambda comments: PageCommentSerializer(
                comments, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug, project_id, page_id):
        page = Page.objects.filter(
            workspace__slug=slug, pk=page_id, projects__id=project_id
        ).first()
        if not page:
            return Response({"error": "Page does not exist"}, status=status.HTTP_404_NOT_FOUND)

        if (
            request.data.get("external_id")
            and request.data.get("external_source")
            and PageComment.objects.filter(
                workspace__slug=slug,
                page_id=page_id,
                external_source=request.data.get("external_source"),
                external_id=request.data.get("external_id"),
            ).exists()
        ):
            comment = PageComment.objects.filter(
                workspace__slug=slug,
                page_id=page_id,
                external_source=request.data.get("external_source"),
                external_id=request.data.get("external_id"),
            ).first()
            return Response(
                {
                    "error": "Page comment with the same external id and external source already exists",
                    "id": str(comment.id),
                },
                status=status.HTTP_409_CONFLICT,
            )

        serializer = PageCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(page_id=page_id, actor=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PageCommentDetailAPIEndpoint(BaseAPIView):
    """Page Comment Detail Endpoint"""

    serializer_class = PageCommentSerializer
    model = PageComment
    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get_queryset(self):
        return (
            PageComment.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"))
            .filter(page__projects__id=self.kwargs.get("project_id"))
            .filter(
                page__projects__project_projectmember__member=self.request.user,
                page__projects__project_projectmember__is_active=True,
            )
            .select_related("workspace", "page", "actor", "resolved_by")
            .distinct()
        )

    def get(self, request, slug, project_id, page_id, pk):
        serializer = PageCommentSerializer(
            self.get_queryset().get(pk=pk), fields=self.fields, expand=self.expand
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, slug, project_id, page_id, pk):
        page_comment = self.get_queryset().get(pk=pk)
        serializer = PageCommentSerializer(page_comment, data=request.data, partial=True)
        if serializer.is_valid():
            if (
                "comment_html" in request.data
                and request.data["comment_html"] != page_comment.comment_html
            ):
                serializer.save(edited_at=timezone.now())
            else:
                serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, project_id, page_id, pk):
        page_comment = self.get_queryset().get(pk=pk)
        page_comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageCommentResolveAPIEndpoint(BaseAPIView):
    """Resolve / unresolve a top-level page comment thread."""

    serializer_class = PageCommentSerializer
    model = PageComment
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        return (
            PageComment.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"), parent__isnull=True)
            .filter(page__projects__id=self.kwargs.get("project_id"))
            .filter(
                page__projects__project_projectmember__member=self.request.user,
                page__projects__project_projectmember__is_active=True,
            )
            .distinct()
        )

    def post(self, request, slug, project_id, page_id, pk):
        page_comment = self.get_queryset().get(pk=pk)
        page_comment.is_resolved = True
        page_comment.resolved_at = timezone.now()
        page_comment.resolved_by = request.user
        page_comment.save()
        return Response(PageCommentSerializer(page_comment).data, status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, page_id, pk):
        page_comment = self.get_queryset().get(pk=pk)
        page_comment.is_resolved = False
        page_comment.resolved_at = None
        page_comment.resolved_by = None
        page_comment.save()
        return Response(PageCommentSerializer(page_comment).data, status=status.HTTP_200_OK)
