# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hmac
import json
import uuid

# Django imports
from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.core.validators import validate_email
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import strip_tags

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IssueCommentSerializer,
    IssueEmailMessageSerializer,
    IssueEmailThreadSerializer,
    ServiceDeskConfigSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.service_desk_task import (
    service_desk_maintain_subscriptions,
    service_desk_send_reply,
    service_desk_sync_mailbox,
)
from plane.db.models import (
    IssueComment,
    IssueEmailMessage,
    IssueEmailThread,
    Project,
    ProjectMember,
    ServiceDeskConfig,
)
from plane.db.models.service_desk import EmailDeliveryStatus, EmailDirection, ServiceDeskNotifyMode
from plane.utils.content_validator import validate_html_content
from plane.utils.host import base_host


def _clean_email_list(emails, exclude=()):
    """Normalize a list of email addresses; raises ValidationError on bad input."""
    if not isinstance(emails, list):
        raise ValidationError("Expected a list of email addresses")
    cleaned = []
    for email in emails:
        if not isinstance(email, str):
            raise ValidationError("Expected a list of email addresses")
        email = email.strip().lower()
        if not email:
            continue
        validate_email(email)
        if email not in cleaned and email not in exclude:
            cleaned.append(email)
    return cleaned


class ServiceDeskConfigEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        config = ServiceDeskConfig.objects.filter(workspace__slug=slug, project_id=project_id).first()
        if config is None:
            return Response(
                {"error": "Service desk is not configured for this project"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ServiceDeskConfigSerializer(config).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        mailbox_email = (request.data.get("mailbox_email") or "").strip().lower()
        is_enabled = bool(request.data.get("is_enabled", False))

        if mailbox_email:
            try:
                validate_email(mailbox_email)
            except ValidationError:
                return Response({"error": "Invalid mailbox email"}, status=status.HTTP_400_BAD_REQUEST)
        if is_enabled and not mailbox_email:
            return Response(
                {"error": "A mailbox email is required to enable the service desk"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        config = ServiceDeskConfig.objects.filter(workspace__slug=slug, project_id=project_id).first()
        created = config is None

        # Notification settings are optional in the payload; omitting them keeps
        # the stored values instead of resetting them.
        notify_mode = request.data.get("notify_mode", ServiceDeskNotifyMode.NONE if created else config.notify_mode)
        if notify_mode not in ServiceDeskNotifyMode.values:
            return Response({"error": "Invalid notify mode"}, status=status.HTTP_400_BAD_REQUEST)
        if notify_mode == ServiceDeskNotifyMode.CUSTOM:
            notify_user_ids = request.data.get("notify_user_ids", [] if created else config.notify_user_ids)
            if not isinstance(notify_user_ids, list):
                return Response(
                    {"error": "notify_user_ids must be a list of user ids"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            candidate_ids = []
            for entry in notify_user_ids:
                try:
                    candidate_ids.append(uuid.UUID(str(entry)))
                except (ValueError, TypeError):
                    continue
            # Keep only active project members; drops stale/foreign ids silently.
            notify_user_ids = [
                str(member_id)
                for member_id in ProjectMember.objects.filter(
                    project_id=project_id, is_active=True, member_id__in=candidate_ids
                ).values_list("member_id", flat=True)
            ]
        else:
            notify_user_ids = []

        if created:
            config = ServiceDeskConfig.objects.create(
                project_id=project_id,
                mailbox_email=mailbox_email,
                is_enabled=is_enabled,
                notify_mode=notify_mode,
                notify_user_ids=notify_user_ids,
            )
        else:
            config.mailbox_email = mailbox_email
            config.is_enabled = is_enabled
            config.notify_mode = notify_mode
            config.notify_user_ids = notify_user_ids
            config.save(
                update_fields=[
                    "mailbox_email",
                    "is_enabled",
                    "notify_mode",
                    "notify_user_ids",
                    "updated_at",
                    "updated_by",
                ]
            )

        # Tickets land in the intake queue, so make sure agents can see it.
        if is_enabled:
            Project.objects.filter(pk=project_id, intake_view=False).update(intake_view=True)

        # Create/renew/drop the Graph push subscription to match the new state.
        service_desk_maintain_subscriptions.delay()

        return Response(
            ServiceDeskConfigSerializer(config).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ServiceDeskWebhookEndpoint(APIView):
    """Receiver for Microsoft Graph change notifications.

    Unauthenticated by design — Graph calls it directly. The subscription
    handshake echoes the validationToken; real notifications are only acted
    on when their clientState matches the per-mailbox secret, and even then
    the payload is never trusted: we just schedule a mailbox sync.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def post(self, request):
        validation_token = request.query_params.get("validationToken")
        if validation_token is not None:
            return HttpResponse(validation_token, content_type="text/plain")

        payload = request.data if isinstance(request.data, dict) else {}
        for notification in payload.get("value", []):
            if not isinstance(notification, dict):
                continue
            subscription_id = notification.get("subscriptionId")
            client_state = notification.get("clientState") or ""
            if not subscription_id:
                continue
            config = ServiceDeskConfig.objects.filter(
                graph_subscription_id=subscription_id, is_enabled=True, deleted_at__isnull=True
            ).first()
            if (
                config
                and config.webhook_client_state
                and hmac.compare_digest(client_state, config.webhook_client_state)
            ):
                service_desk_sync_mailbox.delay(str(config.id))
        return Response(status=status.HTTP_202_ACCEPTED)


class IssueEmailThreadEndpoint(BaseAPIView):
    def _get_thread(self, slug, project_id, issue_id):
        return (
            IssueEmailThread.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id)
            .prefetch_related("messages")
            .first()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, issue_id):
        thread = self._get_thread(slug, project_id, issue_id)
        if thread is None:
            return Response(
                {"error": "This work item has no email thread"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(IssueEmailThreadSerializer(thread).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id):
        thread = self._get_thread(slug, project_id, issue_id)
        if thread is None:
            return Response(
                {"error": "This work item has no email thread"},
                status=status.HTTP_404_NOT_FOUND,
            )

        updated_fields = []
        try:
            reserved = (thread.creator_email, thread.mailbox_email)
            if "to_emails" in request.data:
                thread.to_emails = _clean_email_list(request.data.get("to_emails"), exclude=reserved)
                updated_fields.append("to_emails")
            if "cc_emails" in request.data:
                thread.cc_emails = _clean_email_list(request.data.get("cc_emails"), exclude=reserved)
                updated_fields.append("cc_emails")
        except ValidationError:
            return Response(
                {"error": "Recipients must be valid email addresses"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if updated_fields:
            thread.save(update_fields=[*updated_fields, "updated_at", "updated_by"])
        return Response(IssueEmailThreadSerializer(thread).data, status=status.HTTP_200_OK)


class IssueEmailReplyEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        thread = IssueEmailThread.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id).first()
        if thread is None:
            return Response(
                {"error": "This work item has no email thread"},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw_comment_html = request.data.get("comment_html", "")
        _, _, sanitized_html = validate_html_content(raw_comment_html)
        comment_html = sanitized_html if sanitized_html is not None else "<p></p>"
        body_text = strip_tags(comment_html).strip()
        if not body_text:
            return Response({"error": "A reply message is required"}, status=status.HTTP_400_BAD_REQUEST)

        comment = IssueComment.objects.create(
            project_id=project_id,
            issue_id=issue_id,
            comment_html=comment_html,
            actor=request.user,
            access="EXTERNAL",
        )
        issue_activity.delay(
            type="comment.activity.created",
            requested_data=json.dumps(
                {"id": str(comment.id), "comment_html": comment.comment_html},
                cls=DjangoJSONEncoder,
            ),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )

        email_message = IssueEmailMessage.objects.create(
            project_id=project_id,
            thread=thread,
            direction=EmailDirection.OUTBOUND,
            status=EmailDeliveryStatus.PENDING,
            from_email=thread.mailbox_email,
            to_emails=[thread.creator_email, *thread.to_emails],
            cc_emails=thread.cc_emails,
            subject=f"RE: {thread.subject}".strip(),
            body_text=body_text,
            body_html=comment_html,
            comment=comment,
        )
        service_desk_send_reply.delay(str(email_message.id))

        return Response(
            {
                "comment": IssueCommentSerializer(comment).data,
                "email_message": IssueEmailMessageSerializer(email_message).data,
            },
            status=status.HTTP_201_CREATED,
        )
