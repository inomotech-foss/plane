# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError
from django.utils import timezone

# Third Party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet
from plane.app.serializers import PageCommentSerializer, PageCommentReactionSerializer
from plane.app.permissions import ROLE
from plane.app.permissions.page import ProjectPageCommentPermission
from plane.db.models import PageComment, PageCommentReaction, Page, Project, ProjectMember


class PageCommentViewSet(BaseViewSet):
    """Document/inline comment threads (and replies) anchored to a page.

    A top-level thread has ``parent = None``. Inline threads carry an
    ``anchor_id`` matching the comment mark in the document; a thread with no
    ``anchor_id`` is a document-level (end-of-page) comment.
    """

    serializer_class = PageCommentSerializer
    model = PageComment
    permission_classes = [ProjectPageCommentPermission]

    filterset_fields = ["anchor_id", "is_resolved", "parent__id"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(page_id=self.kwargs.get("page_id"))
            .select_related("actor", "resolved_by", "page", "workspace")
            .prefetch_related("page_comment_reactions")
            .order_by("created_at")
            .distinct()
        )

    def _is_project_admin(self, slug, project_id, user):
        return ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()

    def create(self, request, slug, project_id, page_id):
        # Guests may comment only when the project exposes all features to guests
        # or they own the page (mirrors issue comments).
        is_guest = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            role=ROLE.GUEST.value,
            is_active=True,
        ).exists()
        if is_guest:
            project = Project.objects.get(pk=project_id)
            page = Page.objects.get(pk=page_id)
            if not project.guest_view_all_features and page.owned_by_id != request.user.id:
                return Response(
                    {"error": "You are not allowed to comment on this page"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        serializer = PageCommentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(page_id=page_id, actor=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, project_id, page_id, pk):
        page_comment = PageComment.objects.get(workspace__slug=slug, page_id=page_id, pk=pk)
        # Only the author or a project admin can edit a comment.
        if page_comment.actor_id != request.user.id and not self._is_project_admin(slug, project_id, request.user):
            return Response(
                {"error": "You are not allowed to edit this comment"},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = PageCommentSerializer(page_comment, data=request.data, partial=True)
        if serializer.is_valid():
            if "comment_html" in request.data and request.data["comment_html"] != page_comment.comment_html:
                serializer.save(edited_at=timezone.now())
            else:
                serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, project_id, page_id, pk):
        page_comment = PageComment.objects.get(workspace__slug=slug, page_id=page_id, pk=pk)
        # Only the author or a project admin can delete a comment.
        if page_comment.actor_id != request.user.id and not self._is_project_admin(slug, project_id, request.user):
            return Response(
                {"error": "You are not allowed to delete this comment"},
                status=status.HTTP_403_FORBIDDEN,
            )
        page_comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def resolve(self, request, slug, project_id, page_id, pk):
        # Only top-level threads (parent is null) can be resolved.
        page_comment = PageComment.objects.get(workspace__slug=slug, page_id=page_id, pk=pk, parent__isnull=True)
        page_comment.is_resolved = True
        page_comment.resolved_at = timezone.now()
        page_comment.resolved_by = request.user
        page_comment.save()
        return Response(PageCommentSerializer(page_comment).data, status=status.HTTP_200_OK)

    def unresolve(self, request, slug, project_id, page_id, pk):
        page_comment = PageComment.objects.get(workspace__slug=slug, page_id=page_id, pk=pk, parent__isnull=True)
        page_comment.is_resolved = False
        page_comment.resolved_at = None
        page_comment.resolved_by = None
        page_comment.save()
        return Response(PageCommentSerializer(page_comment).data, status=status.HTTP_200_OK)


class PageCommentReactionViewSet(BaseViewSet):
    """Emoji reactions on a page comment."""

    serializer_class = PageCommentReactionSerializer
    model = PageCommentReaction
    permission_classes = [ProjectPageCommentPermission]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(comment_id=self.kwargs.get("comment_id"))
            .select_related("actor")
            .order_by("-created_at")
            .distinct()
        )

    def create(self, request, slug, project_id, page_id, comment_id):
        try:
            serializer = PageCommentReactionSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(actor=request.user, comment_id=comment_id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Reaction already exists for the user"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def destroy(self, request, slug, project_id, page_id, comment_id, reaction_code):
        page_comment_reaction = PageCommentReaction.objects.get(
            workspace__slug=slug,
            comment_id=comment_id,
            reaction=reaction_code,
            actor=request.user,
        )
        page_comment_reaction.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
