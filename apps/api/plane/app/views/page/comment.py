# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone

# Third Party imports
from bs4 import BeautifulSoup
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet
from plane.app.serializers import PageCommentSerializer, PageCommentReactionSerializer
from plane.app.permissions import ROLE
from plane.app.permissions.page import ProjectPageCommentPermission
from plane.db.models import (
    PageComment,
    PageCommentReaction,
    Page,
    Project,
    ProjectMember,
    Notification,
    EmailNotificationLog,
    UserNotificationPreference,
)


def _extract_mentioned_user_ids(html):
    """User IDs referenced by mention-component tags in comment HTML."""
    if not html:
        return set()
    soup = BeautifulSoup(html, "html.parser")
    return {
        tag.get("entity_identifier")
        for tag in soup.find_all("mention-component", attrs={"entity_name": "user_mention"})
        if tag.get("entity_identifier")
    }


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

    def _notify_mentions(self, comment, request, slug, project_id, previous_html=None):
        """Create in-app notifications for users newly mentioned in a comment.

        On edit, ``previous_html`` is passed so only newly added mentions are
        notified. Only active project members (excluding the author) are.
        """
        mentioned = _extract_mentioned_user_ids(comment.comment_html)
        if previous_html is not None:
            mentioned -= _extract_mentioned_user_ids(previous_html)
        mentioned.discard(str(request.user.id))
        if not mentioned:
            return
        recipients = {
            str(member_id)
            for member_id in ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member_id__in=mentioned,
                is_active=True,
            ).values_list("member_id", flat=True)
        }
        if not recipients:
            return
        project = Project.objects.get(pk=project_id)
        page = comment.page
        actor_name = request.user.display_name or request.user.email
        Notification.objects.bulk_create(
            [
                Notification(
                    workspace=project.workspace,
                    project=project,
                    sender="in_app:page_comment:mentioned",
                    triggered_by_id=request.user.id,
                    receiver_id=recipient_id,
                    entity_identifier=comment.page_id,
                    entity_name="page",
                    title=f"{actor_name} mentioned you in a comment",
                    message_html=comment.comment_html or "<p></p>",
                    message_stripped=comment.comment_stripped,
                    data={
                        "page": {
                            "id": str(comment.page_id),
                            "name": page.name,
                            "project_id": str(project_id),
                            "workspace_slug": slug,
                        },
                        "comment": {"id": str(comment.id)},
                    },
                )
                for recipient_id in recipients
            ],
            batch_size=100,
        )
        self._queue_mention_emails(comment, request, slug, project_id, page, recipients)

    def _queue_mention_emails(self, comment, request, slug, project_id, page, recipients):
        """Log mention emails for recipients who allow them; a periodic task sends them."""
        email_recipients = set(
            UserNotificationPreference.objects.filter(user_id__in=recipients, mention=True).values_list(
                "user_id", flat=True
            )
        )
        if not email_recipients:
            return
        base_url = (settings.WEB_URL or "").rstrip("/")
        page_url = f"{base_url}/{slug}/projects/{project_id}/pages/{comment.page_id}"
        snippet = (comment.comment_stripped or "")[:300]
        EmailNotificationLog.objects.bulk_create(
            [
                EmailNotificationLog(
                    triggered_by_id=request.user.id,
                    receiver_id=recipient_id,
                    entity_identifier=comment.page_id,
                    entity_name="page",
                    data={
                        "page": {"id": str(comment.page_id), "name": page.name, "url": page_url},
                        "comment": {"id": str(comment.id), "snippet": snippet},
                    },
                )
                for recipient_id in email_recipients
            ],
            batch_size=100,
        )

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
            self._notify_mentions(serializer.instance, request, slug, project_id)
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
        previous_html = page_comment.comment_html
        serializer = PageCommentSerializer(page_comment, data=request.data, partial=True)
        if serializer.is_valid():
            if "comment_html" in request.data and request.data["comment_html"] != page_comment.comment_html:
                serializer.save(edited_at=timezone.now())
            else:
                serializer.save()
            self._notify_mentions(page_comment, request, slug, project_id, previous_html=previous_html)
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
