# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import html
import json
import os
import uuid
from datetime import timedelta

# Third party imports
from celery import shared_task
from crum import impersonate

# Django imports
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.utils.html import strip_tags

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Intake,
    IntakeIssue,
    Issue,
    IssueComment,
    IssueEmailMessage,
    IssueEmailThread,
    IssueSubscriber,
    ProjectMember,
    ServiceDeskConfig,
    State,
    StateGroup,
    User,
)
from plane.db.models.intake import SourceType
from plane.db.models.service_desk import EmailDeliveryStatus, EmailDirection, ServiceDeskNotifyMode
from plane.license.utils.instance_value import get_configuration_value
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception
from plane.utils.ms365_graph import MSGraphError, MSGraphMailClient

SERVICE_DESK_BOT_EMAIL = "service-desk-bot@plane.internal"
SERVICE_DESK_POLL_LOCK = "service_desk_poll_lock"

# Graph caps mail subscriptions at 4230 minutes; stay well below and renew early.
SUBSCRIPTION_LIFETIME_MINUTES = 2880
SUBSCRIPTION_RENEW_THRESHOLD_MINUTES = 720


def get_service_desk_configuration():
    return get_configuration_value(
        [
            {"key": "SERVICE_DESK_MS365_TENANT_ID", "default": os.environ.get("SERVICE_DESK_MS365_TENANT_ID")},
            {"key": "SERVICE_DESK_MS365_CLIENT_ID", "default": os.environ.get("SERVICE_DESK_MS365_CLIENT_ID")},
            {
                "key": "SERVICE_DESK_MS365_CLIENT_SECRET",
                "default": os.environ.get("SERVICE_DESK_MS365_CLIENT_SECRET"),
            },
        ]
    )


def get_service_desk_notification_url():
    """Public HTTPS URL Graph should push change notifications to, or None.

    Returning None keeps the integration in polling-only mode (e.g. for
    instances that are not reachable from the internet).
    """
    (override,) = get_configuration_value(
        [{"key": "SERVICE_DESK_WEBHOOK_URL", "default": os.environ.get("SERVICE_DESK_WEBHOOK_URL")}]
    )
    if override:
        return override
    web_url = (getattr(settings, "WEB_URL", None) or "").strip()
    if not web_url.startswith("https://"):
        return None
    return f"{web_url.rstrip('/')}/api/service-desk/webhook/"


def get_service_desk_bot():
    bot = User.objects.filter(email=SERVICE_DESK_BOT_EMAIL).first()
    if bot is None:
        bot = User.objects.create(
            email=SERVICE_DESK_BOT_EMAIL,
            username=uuid.uuid4().hex,
            display_name="Service Desk",
            first_name="Service",
            last_name="Desk",
            is_bot=True,
            is_active=False,
        )
    return bot


def convert_text_to_html(text):
    text = (text or "").replace("\r\n", "\n").strip()
    if not text:
        return "<p></p>"
    paragraphs = []
    for block in text.split("\n\n"):
        escaped = html.escape(block).replace("\n", "<br />")
        paragraphs.append(f"<p>{escaped}</p>")
    return "".join(paragraphs)


def _recipient_addresses(recipients):
    addresses = []
    for recipient in recipients or []:
        address = (recipient.get("emailAddress") or {}).get("address")
        if address:
            addresses.append(address.strip().lower())
    return addresses


def _message_body_text(message):
    body = message.get("body") or {}
    content = body.get("content") or ""
    # The poller asks Graph for text bodies, but fall back gracefully.
    if (body.get("contentType") or "").lower() == "html":
        content = strip_tags(content)
    return content.strip()


def _merge_recipients(existing, incoming):
    merged = list(existing or [])
    for email in incoming:
        if email not in merged:
            merged.append(email)
    return merged


def _get_or_create_default_intake(project):
    intake = Intake.objects.filter(project=project, is_default=True).first()
    if intake is None:
        intake = Intake.objects.filter(project=project).first()
    if intake is None:
        intake = Intake.objects.create(name=f"{project.name} Intake", project=project, is_default=True)
    return intake


def _get_or_create_triage_state(project):
    triage_state = State.triage_objects.filter(project_id=project.id).first()
    if triage_state is None:
        triage_state = State.objects.create(
            name="Triage",
            group=StateGroup.TRIAGE.value,
            project_id=project.id,
            workspace_id=project.workspace_id,
            color="#4E5355",
            sequence=65000,
            default=False,
        )
    return triage_state


def _resolve_notify_user_ids(config):
    """Members to notify (and auto-subscribe) when a new ticket arrives."""
    members = ProjectMember.objects.filter(project_id=config.project_id, is_active=True, member__is_bot=False)
    if config.notify_mode == ServiceDeskNotifyMode.ADMINS:
        members = members.filter(role=20)
    elif config.notify_mode == ServiceDeskNotifyMode.MEMBERS:
        members = members.filter(role__gte=15)
    elif config.notify_mode == ServiceDeskNotifyMode.CUSTOM:
        members = members.filter(member_id__in=config.notify_user_ids or [])
    else:
        return []
    return list(members.values_list("member_id", flat=True))


def _create_ticket(config, bot, mailbox, message, sender, sender_name, to_emails, cc_emails):
    project = config.project
    subject = (message.get("subject") or "").strip()
    body_text = _message_body_text(message)

    intake = _get_or_create_default_intake(project)
    triage_state = _get_or_create_triage_state(project)

    issue = Issue.objects.create(
        name=subject[:255] or "(no subject)",
        description_html=convert_text_to_html(body_text),
        project_id=project.id,
        state_id=triage_state.id,
    )
    intake_issue = IntakeIssue.objects.create(
        intake_id=intake.id,
        project_id=project.id,
        issue=issue,
        source=SourceType.EMAIL,
        source_email=sender,
        extra={
            "conversation_id": message.get("conversationId"),
            "internet_message_id": message.get("internetMessageId"),
        },
    )
    thread = IssueEmailThread.objects.create(
        project_id=project.id,
        issue=issue,
        mailbox_email=mailbox,
        conversation_id=message.get("conversationId") or "",
        creator_email=sender,
        creator_name=sender_name,
        subject=subject,
        to_emails=[email for email in to_emails if email != sender],
        cc_emails=cc_emails,
        last_inbound_graph_message_id=message.get("id"),
    )
    _log_inbound_message(thread, message, sender, to_emails, cc_emails, body_text)

    # Subscribe the configured members before the activity fires so the
    # notification fan-out (and every follow-up on the ticket) reaches them.
    notify_user_ids = _resolve_notify_user_ids(config)
    if notify_user_ids:
        IssueSubscriber.objects.bulk_create(
            [
                IssueSubscriber(
                    issue=issue,
                    subscriber_id=user_id,
                    project_id=project.id,
                    workspace_id=project.workspace_id,
                )
                for user_id in notify_user_ids
            ],
            ignore_conflicts=True,
        )

    issue_activity.delay(
        type="issue.activity.created",
        requested_data=json.dumps({"name": issue.name}),
        actor_id=str(bot.id),
        issue_id=str(issue.id),
        project_id=str(project.id),
        current_instance=None,
        epoch=int(timezone.now().timestamp()),
        intake=str(intake_issue.id),
        subscriber=False,  # don't subscribe the bot actor
        notification=bool(notify_user_ids),
    )


def _append_customer_reply(thread, bot, message, sender, sender_name, to_emails, cc_emails):
    body_text = _message_body_text(message)
    attribution = (
        f"<p><strong>{html.escape(sender_name or sender)}</strong> ({html.escape(sender)}) replied by email:</p>"
    )
    comment = IssueComment.objects.create(
        project_id=thread.project_id,
        issue_id=thread.issue_id,
        comment_html=attribution + convert_text_to_html(body_text),
        actor=bot,
        access="EXTERNAL",
    )
    comment_message = _log_inbound_message(thread, message, sender, to_emails, cc_emails, body_text)
    comment_message.comment = comment
    comment_message.save(update_fields=["comment", "updated_at"])

    # Anyone new on the customer side of the conversation keeps receiving replies.
    if sender != thread.creator_email:
        to_emails = _merge_recipients(to_emails, [sender])
    thread.to_emails = [
        email
        for email in _merge_recipients(thread.to_emails, to_emails)
        if email not in (thread.creator_email, thread.mailbox_email)
    ]
    thread.cc_emails = [
        email
        for email in _merge_recipients(thread.cc_emails, cc_emails)
        if email not in (thread.creator_email, thread.mailbox_email) and email not in thread.to_emails
    ]
    thread.last_inbound_graph_message_id = message.get("id")
    thread.save(update_fields=["to_emails", "cc_emails", "last_inbound_graph_message_id", "updated_at"])

    issue_activity.delay(
        type="comment.activity.created",
        requested_data=json.dumps({"id": str(comment.id), "comment_html": comment.comment_html}),
        actor_id=str(bot.id),
        issue_id=str(thread.issue_id),
        project_id=str(thread.project_id),
        current_instance=None,
        epoch=int(timezone.now().timestamp()),
        subscriber=False,  # don't subscribe the bot actor
        notification=True,
    )


def _log_inbound_message(thread, message, sender, to_emails, cc_emails, body_text):
    return IssueEmailMessage.objects.create(
        project_id=thread.project_id,
        thread=thread,
        direction=EmailDirection.INBOUND,
        status=EmailDeliveryStatus.RECEIVED,
        graph_message_id=message.get("id"),
        internet_message_id=message.get("internetMessageId"),
        from_email=sender,
        to_emails=to_emails,
        cc_emails=cc_emails,
        subject=(message.get("subject") or "").strip(),
        body_text=body_text,
    )


def _process_message(client, config, bot, mailbox, message):
    graph_message_id = message.get("id")
    sender_address = ((message.get("from") or {}).get("emailAddress")) or {}
    sender = (sender_address.get("address") or "").strip().lower()
    sender_name = (sender_address.get("name") or "").strip()

    # Skip our own outbound mail and duplicates; both are safe to mark read.
    if not sender or sender == mailbox:
        return
    if IssueEmailMessage.objects.filter(graph_message_id=graph_message_id).exists():
        return

    to_emails = [email for email in _recipient_addresses(message.get("toRecipients")) if email != mailbox]
    cc_emails = [email for email in _recipient_addresses(message.get("ccRecipients")) if email != mailbox]

    conversation_id = message.get("conversationId") or ""
    thread = None
    if conversation_id:
        thread = (
            IssueEmailThread.objects.filter(
                project_id=config.project_id,
                mailbox_email=mailbox,
                conversation_id=conversation_id,
                deleted_at__isnull=True,
            )
            .select_related("issue")
            .first()
        )

    with impersonate(bot):
        if thread is not None and thread.issue is not None and thread.issue.deleted_at is None:
            _append_customer_reply(thread, bot, message, sender, sender_name, to_emails, cc_emails)
        else:
            _create_ticket(config, bot, mailbox, message, sender, sender_name, to_emails, cc_emails)


def _process_mailbox(client, config, bot):
    mailbox = config.mailbox_email.strip().lower()
    for message in client.list_unread_messages(mailbox):
        try:
            _process_message(client, config, bot, mailbox, message)
        except Exception as e:
            # Leave the message unread so the next poll retries it.
            log_exception(e)
            continue
        client.mark_message_read(mailbox, message.get("id"))


@shared_task
def service_desk_sync_mailbox(config_id):
    """Fetch and process unread mail for one mailbox.

    Triggered by Graph change notifications (push) and by the periodic
    reconciliation poll; a per-mailbox lock keeps the two from racing.
    """
    config = (
        ServiceDeskConfig.objects.filter(pk=config_id, is_enabled=True, deleted_at__isnull=True)
        .select_related("project", "project__workspace")
        .first()
    )
    if config is None:
        return
    tenant_id, client_id, client_secret = get_service_desk_configuration()
    if not (tenant_id and client_id and client_secret):
        return

    redis_client = redis_instance()
    lock_id = f"service_desk_sync_{config_id}"
    if not redis_client.set(lock_id, "true", nx=True, ex=240):
        return
    try:
        client = MSGraphMailClient(tenant_id, client_id, client_secret)
        bot = get_service_desk_bot()
        _process_mailbox(client, config, bot)
        config.last_synced_at = timezone.now()
        config.save(update_fields=["last_synced_at", "updated_at"])
    except Exception as e:
        log_exception(e)
    finally:
        redis_client.delete(lock_id)


@shared_task
def service_desk_poll():
    """Reconciliation sweep over all enabled mailboxes.

    Push notifications deliver mail near-instantly when a subscription is
    active; this poll catches dropped notifications and covers instances
    where Graph cannot reach the webhook at all.
    """
    redis_client = redis_instance()
    if not redis_client.set(SERVICE_DESK_POLL_LOCK, "true", nx=True, ex=300):
        return
    try:
        tenant_id, client_id, client_secret = get_service_desk_configuration()
        if not (tenant_id and client_id and client_secret):
            return
        config_ids = ServiceDeskConfig.objects.filter(is_enabled=True, deleted_at__isnull=True).values_list(
            "id", flat=True
        )
        for config_id in config_ids:
            service_desk_sync_mailbox(str(config_id))
    finally:
        redis_client.delete(SERVICE_DESK_POLL_LOCK)


def _subscription_expiration(result, requested):
    expires_at = parse_datetime(result.get("expirationDateTime") or "") if isinstance(result, dict) else None
    return expires_at or requested


@shared_task
def service_desk_maintain_subscriptions():
    """Keep Graph change-notification subscriptions in sync with the configs.

    Creates subscriptions for enabled mailboxes, renews them before expiry,
    and drops them for disabled mailboxes. Without a public HTTPS webhook URL
    this is a no-op and the integration stays polling-only.
    """
    tenant_id, client_id, client_secret = get_service_desk_configuration()
    if not (tenant_id and client_id and client_secret):
        return
    client = MSGraphMailClient(tenant_id, client_id, client_secret)
    now = timezone.now()

    # Disabled mailboxes should stop pushing.
    for config in ServiceDeskConfig.objects.filter(
        is_enabled=False, deleted_at__isnull=True, graph_subscription_id__isnull=False
    ):
        try:
            client.delete_subscription(config.graph_subscription_id)
        except MSGraphError as e:
            if e.status_code != 404:
                log_exception(e)
        config.graph_subscription_id = None
        config.graph_subscription_expires_at = None
        config.save(update_fields=["graph_subscription_id", "graph_subscription_expires_at", "updated_at"])

    notification_url = get_service_desk_notification_url()
    if not notification_url:
        return

    for config in ServiceDeskConfig.objects.filter(is_enabled=True, deleted_at__isnull=True):
        try:
            if (
                config.graph_subscription_id
                and config.graph_subscription_expires_at
                and config.graph_subscription_expires_at > now + timedelta(minutes=SUBSCRIPTION_RENEW_THRESHOLD_MINUTES)
            ):
                continue

            requested_expiration = now + timedelta(minutes=SUBSCRIPTION_LIFETIME_MINUTES)
            if config.graph_subscription_id:
                try:
                    result = client.renew_subscription(config.graph_subscription_id, requested_expiration.isoformat())
                    config.graph_subscription_expires_at = _subscription_expiration(result, requested_expiration)
                    config.save(update_fields=["graph_subscription_expires_at", "updated_at"])
                    continue
                except MSGraphError as e:
                    if e.status_code != 404:
                        raise
                    config.graph_subscription_id = None  # gone on the Graph side; recreate

            if not config.webhook_client_state:
                config.webhook_client_state = uuid.uuid4().hex
            result = client.create_subscription(
                mailbox=config.mailbox_email.strip().lower(),
                notification_url=notification_url,
                client_state=config.webhook_client_state,
                expiration=requested_expiration.isoformat(),
            )
            config.graph_subscription_id = result.get("id")
            config.graph_subscription_expires_at = _subscription_expiration(result, requested_expiration)
            config.save(
                update_fields=[
                    "graph_subscription_id",
                    "graph_subscription_expires_at",
                    "webhook_client_state",
                    "updated_at",
                ]
            )
        except Exception as e:
            log_exception(e)


@shared_task
def service_desk_send_reply(email_message_id):
    email_message = (
        IssueEmailMessage.objects.filter(pk=email_message_id, direction=EmailDirection.OUTBOUND)
        .select_related("thread")
        .first()
    )
    if email_message is None:
        return
    thread = email_message.thread
    try:
        tenant_id, client_id, client_secret = get_service_desk_configuration()
        if not (tenant_id and client_id and client_secret):
            raise MSGraphError("Service desk MS365 credentials are not configured")
        if not thread.last_inbound_graph_message_id:
            raise MSGraphError("Email thread has no inbound message to reply to")

        client = MSGraphMailClient(tenant_id, client_id, client_secret)
        client.reply_to_message(
            mailbox=thread.mailbox_email,
            message_id=thread.last_inbound_graph_message_id,
            body_html=email_message.body_html or convert_text_to_html(email_message.body_text),
            to_emails=email_message.to_emails,
            cc_emails=email_message.cc_emails,
        )
        email_message.status = EmailDeliveryStatus.SENT
        email_message.error = None
    except Exception as e:
        email_message.status = EmailDeliveryStatus.FAILED
        email_message.error = str(e)[:2000]
        log_exception(e)
    email_message.save(update_fields=["status", "error", "updated_at"])
