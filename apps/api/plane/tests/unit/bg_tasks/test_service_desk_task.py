# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.test import override_settings
from django.utils import timezone

from plane.bgtasks.service_desk_task import (
    SERVICE_DESK_BOT_EMAIL,
    convert_text_to_html,
    get_service_desk_notification_url,
    service_desk_maintain_subscriptions,
    service_desk_poll,
    service_desk_send_reply,
)
from plane.utils.ms365_graph import MSGraphError
from plane.db.models import (
    IntakeIssue,
    Issue,
    IssueComment,
    IssueEmailMessage,
    IssueEmailThread,
    IssueSubscriber,
    ServiceDeskConfig,
    User,
)
from plane.db.models.service_desk import EmailDeliveryStatus, EmailDirection
from plane.tests.factories import ProjectFactory

MAILBOX = "support@example.com"


def _graph_message(
    msg_id="msg-1",
    conversation_id="conv-1",
    sender="customer@example.com",
    sender_name="Customer One",
    subject="Printer is broken",
    body="Hello,\n\nthe printer on floor 2 is broken.",
    to=(MAILBOX,),
    cc=(),
):
    return {
        "id": msg_id,
        "conversationId": conversation_id,
        "internetMessageId": f"<{msg_id}@example.com>",
        "subject": subject,
        "body": {"contentType": "text", "content": body},
        "from": {"emailAddress": {"address": sender, "name": sender_name}},
        "toRecipients": [{"emailAddress": {"address": address}} for address in to],
        "ccRecipients": [{"emailAddress": {"address": address}} for address in cc],
    }


@pytest.fixture
def service_desk_config(db):
    project = ProjectFactory()
    return ServiceDeskConfig.objects.create(project=project, mailbox_email=MAILBOX, is_enabled=True)


def _run_poll(messages):
    """Run service_desk_poll with a mocked Graph client returning the given messages."""
    fake_client = MagicMock()
    fake_client.list_unread_messages.return_value = messages
    with (
        patch("plane.bgtasks.service_desk_task.redis_instance") as mock_redis,
        patch(
            "plane.bgtasks.service_desk_task.get_service_desk_configuration",
            return_value=("tenant", "client", "secret"),
        ),
        patch("plane.bgtasks.service_desk_task.MSGraphMailClient", return_value=fake_client),
        patch("plane.bgtasks.service_desk_task.issue_activity") as mock_activity,
    ):
        mock_redis.return_value.set.return_value = True
        service_desk_poll()
    return fake_client, mock_activity


@pytest.mark.unit
class TestConvertTextToHtml:
    def test_escapes_html_and_preserves_paragraphs(self):
        html = convert_text_to_html("Hello <script>alert(1)</script>\n\nSecond line\nwrapped")
        assert "<script>" not in html
        assert "&lt;script&gt;" in html
        assert html.count("<p>") == 2
        assert "wrapped" in html
        assert "<br />" in html

    def test_empty_body(self):
        assert convert_text_to_html("") == "<p></p>"
        assert convert_text_to_html(None) == "<p></p>"


@pytest.mark.unit
class TestServiceDeskPoll:
    @pytest.mark.django_db
    def test_creates_ticket_from_new_email(self, service_desk_config):
        message = _graph_message(cc=("colleague@example.com",))
        fake_client, mock_activity = _run_poll([message])

        issue = Issue.objects.filter(project=service_desk_config.project).first()
        assert issue is not None
        assert issue.name == "Printer is broken"
        assert "printer on floor 2" in issue.description_html
        assert issue.state.group == "triage"

        bot = User.objects.get(email=SERVICE_DESK_BOT_EMAIL)
        assert bot.is_bot is True
        assert issue.created_by_id == bot.id

        intake_issue = IntakeIssue.objects.get(issue=issue)
        assert intake_issue.source == "EMAIL"
        assert intake_issue.source_email == "customer@example.com"

        thread = IssueEmailThread.objects.get(issue=issue)
        assert thread.creator_email == "customer@example.com"
        assert thread.mailbox_email == MAILBOX
        assert thread.conversation_id == "conv-1"
        assert thread.to_emails == []  # mailbox and sender are excluded
        assert thread.cc_emails == ["colleague@example.com"]
        assert thread.last_inbound_graph_message_id == "msg-1"

        email_message = IssueEmailMessage.objects.get(thread=thread)
        assert email_message.direction == EmailDirection.INBOUND
        assert email_message.status == EmailDeliveryStatus.RECEIVED
        assert email_message.graph_message_id == "msg-1"

        fake_client.mark_message_read.assert_called_once_with(MAILBOX, "msg-1")
        service_desk_config.refresh_from_db()
        assert service_desk_config.last_synced_at is not None

        activity_kwargs = mock_activity.delay.call_args.kwargs
        assert activity_kwargs["type"] == "issue.activity.created"
        assert activity_kwargs["intake"] == str(intake_issue.id)

    @pytest.mark.django_db
    def test_threads_reply_into_existing_ticket(self, service_desk_config):
        _run_poll([_graph_message()])
        issue = Issue.objects.get(project=service_desk_config.project)

        reply = _graph_message(
            msg_id="msg-2",
            sender="colleague@example.com",
            sender_name="Colleague",
            subject="RE: Printer is broken",
            body="Adding myself to this ticket.",
        )
        _, mock_activity = _run_poll([reply])

        # No second ticket; the reply landed as an EXTERNAL comment.
        assert Issue.objects.filter(project=service_desk_config.project).count() == 1
        comment = IssueComment.objects.get(issue=issue)
        assert comment.access == "EXTERNAL"
        assert "Adding myself to this ticket." in comment.comment_html
        assert "colleague@example.com" in comment.comment_html

        thread = IssueEmailThread.objects.get(issue=issue)
        assert "colleague@example.com" in thread.to_emails
        assert thread.last_inbound_graph_message_id == "msg-2"

        activity_kwargs = mock_activity.delay.call_args.kwargs
        assert activity_kwargs["type"] == "comment.activity.created"
        assert activity_kwargs["notification"] is True

    @pytest.mark.django_db
    def test_skips_duplicates_and_own_messages(self, service_desk_config):
        _run_poll([_graph_message()])
        assert IssueEmailMessage.objects.count() == 1

        duplicate = _graph_message()  # same graph message id
        own_message = _graph_message(msg_id="msg-3", sender=MAILBOX)
        fake_client, _ = _run_poll([duplicate, own_message])

        assert Issue.objects.count() == 1
        assert IssueEmailMessage.objects.count() == 1
        # Both skipped messages are still marked read.
        assert fake_client.mark_message_read.call_count == 2

    @pytest.mark.django_db
    def test_disabled_config_is_not_polled(self, service_desk_config):
        service_desk_config.is_enabled = False
        service_desk_config.save()
        fake_client, _ = _run_poll([_graph_message()])
        fake_client.list_unread_messages.assert_not_called()
        assert Issue.objects.count() == 0


@pytest.mark.unit
class TestServiceDeskSendReply:
    @pytest.fixture
    def outbound_message(self, service_desk_config):
        _run_poll([_graph_message()])
        thread = IssueEmailThread.objects.get()
        return IssueEmailMessage.objects.create(
            project_id=thread.project_id,
            thread=thread,
            direction=EmailDirection.OUTBOUND,
            status=EmailDeliveryStatus.PENDING,
            from_email=MAILBOX,
            to_emails=["customer@example.com"],
            cc_emails=["colleague@example.com"],
            subject="RE: Printer is broken",
            body_text="We are on it.",
            body_html="<p>We are on it.</p>",
        )

    @pytest.mark.django_db
    def test_sends_reply_and_marks_sent(self, outbound_message):
        fake_client = MagicMock()
        with (
            patch(
                "plane.bgtasks.service_desk_task.get_service_desk_configuration",
                return_value=("tenant", "client", "secret"),
            ),
            patch("plane.bgtasks.service_desk_task.MSGraphMailClient", return_value=fake_client),
        ):
            service_desk_send_reply(str(outbound_message.id))

        outbound_message.refresh_from_db()
        assert outbound_message.status == EmailDeliveryStatus.SENT
        assert outbound_message.error is None
        fake_client.reply_to_message.assert_called_once_with(
            mailbox=MAILBOX,
            message_id="msg-1",
            body_html="<p>We are on it.</p>",
            to_emails=["customer@example.com"],
            cc_emails=["colleague@example.com"],
        )

    @pytest.mark.django_db
    def test_failure_is_recorded(self, outbound_message):
        fake_client = MagicMock()
        fake_client.reply_to_message.side_effect = Exception("Graph is down")
        with (
            patch(
                "plane.bgtasks.service_desk_task.get_service_desk_configuration",
                return_value=("tenant", "client", "secret"),
            ),
            patch("plane.bgtasks.service_desk_task.MSGraphMailClient", return_value=fake_client),
        ):
            service_desk_send_reply(str(outbound_message.id))

        outbound_message.refresh_from_db()
        assert outbound_message.status == EmailDeliveryStatus.FAILED
        assert "Graph is down" in outbound_message.error

    @pytest.mark.django_db
    def test_missing_credentials_marks_failed(self, outbound_message):
        with patch(
            "plane.bgtasks.service_desk_task.get_service_desk_configuration",
            return_value=(None, None, None),
        ):
            service_desk_send_reply(str(outbound_message.id))
        outbound_message.refresh_from_db()
        assert outbound_message.status == EmailDeliveryStatus.FAILED


WEBHOOK_URL = "https://plane.example.com/api/service-desk/webhook/"


def _run_maintain(fake_client, notification_url=WEBHOOK_URL):
    with (
        patch(
            "plane.bgtasks.service_desk_task.get_service_desk_configuration",
            return_value=("tenant", "client", "secret"),
        ),
        patch("plane.bgtasks.service_desk_task.MSGraphMailClient", return_value=fake_client),
        patch(
            "plane.bgtasks.service_desk_task.get_service_desk_notification_url",
            return_value=notification_url,
        ),
    ):
        service_desk_maintain_subscriptions()


@pytest.mark.unit
class TestMaintainSubscriptions:
    @pytest.mark.django_db
    def test_creates_subscription_when_missing(self, service_desk_config):
        fake_client = MagicMock()
        fake_client.create_subscription.return_value = {
            "id": "sub-1",
            "expirationDateTime": "2026-07-24T20:00:00Z",
        }
        _run_maintain(fake_client)

        service_desk_config.refresh_from_db()
        assert service_desk_config.graph_subscription_id == "sub-1"
        assert service_desk_config.graph_subscription_expires_at is not None
        assert service_desk_config.webhook_client_state != ""

        call_kwargs = fake_client.create_subscription.call_args.kwargs
        assert call_kwargs["mailbox"] == MAILBOX
        assert call_kwargs["notification_url"] == WEBHOOK_URL
        assert call_kwargs["client_state"] == service_desk_config.webhook_client_state
        fake_client.renew_subscription.assert_not_called()

    @pytest.mark.django_db
    def test_skips_fresh_subscription(self, service_desk_config):
        service_desk_config.graph_subscription_id = "sub-1"
        service_desk_config.graph_subscription_expires_at = timezone.now() + timedelta(hours=40)
        service_desk_config.save()
        fake_client = MagicMock()
        _run_maintain(fake_client)
        fake_client.create_subscription.assert_not_called()
        fake_client.renew_subscription.assert_not_called()

    @pytest.mark.django_db
    def test_renews_expiring_subscription(self, service_desk_config):
        service_desk_config.graph_subscription_id = "sub-1"
        service_desk_config.graph_subscription_expires_at = timezone.now() + timedelta(hours=1)
        service_desk_config.save()
        fake_client = MagicMock()
        renewed_until = (timezone.now() + timedelta(minutes=2880)).isoformat()
        fake_client.renew_subscription.return_value = {"expirationDateTime": renewed_until}
        _run_maintain(fake_client)

        fake_client.renew_subscription.assert_called_once()
        fake_client.create_subscription.assert_not_called()
        service_desk_config.refresh_from_db()
        assert service_desk_config.graph_subscription_expires_at > timezone.now() + timedelta(hours=12)

    @pytest.mark.django_db
    def test_recreates_when_renew_returns_404(self, service_desk_config):
        service_desk_config.graph_subscription_id = "sub-gone"
        service_desk_config.graph_subscription_expires_at = timezone.now() + timedelta(hours=1)
        service_desk_config.webhook_client_state = "state-1"
        service_desk_config.save()
        fake_client = MagicMock()
        fake_client.renew_subscription.side_effect = MSGraphError("gone", 404, "not found")
        fake_client.create_subscription.return_value = {"id": "sub-2"}
        _run_maintain(fake_client)

        service_desk_config.refresh_from_db()
        assert service_desk_config.graph_subscription_id == "sub-2"

    @pytest.mark.django_db
    def test_deletes_subscription_for_disabled_config(self, service_desk_config):
        service_desk_config.is_enabled = False
        service_desk_config.graph_subscription_id = "sub-1"
        service_desk_config.graph_subscription_expires_at = timezone.now() + timedelta(hours=40)
        service_desk_config.save()
        fake_client = MagicMock()
        _run_maintain(fake_client)

        fake_client.delete_subscription.assert_called_once_with("sub-1")
        service_desk_config.refresh_from_db()
        assert service_desk_config.graph_subscription_id is None
        assert service_desk_config.graph_subscription_expires_at is None

    @pytest.mark.django_db
    def test_no_notification_url_stays_polling_only(self, service_desk_config):
        fake_client = MagicMock()
        _run_maintain(fake_client, notification_url=None)
        fake_client.create_subscription.assert_not_called()


@pytest.mark.unit
class TestNotificationUrl:
    @pytest.mark.django_db
    @override_settings(WEB_URL="https://plane.example.com")
    def test_derives_from_web_url(self):
        assert get_service_desk_notification_url() == WEBHOOK_URL

    @pytest.mark.django_db
    @override_settings(WEB_URL="http://plane.internal")
    def test_requires_https(self):
        assert get_service_desk_notification_url() is None

    @override_settings(WEB_URL="https://plane.example.com")
    def test_override_wins(self):
        with patch(
            "plane.bgtasks.service_desk_task.get_configuration_value",
            return_value=("https://edge.example.com/hook",),
        ):
            assert get_service_desk_notification_url() == "https://edge.example.com/hook"


@pytest.mark.unit
class TestNewTicketNotifications:
    @pytest.fixture
    def members(self, service_desk_config):
        from uuid import uuid4

        from plane.db.models import ProjectMember, WorkspaceMember

        project = service_desk_config.project
        users = {}
        for key, role in (("admin", 20), ("member", 15), ("guest", 5)):
            user = User.objects.create(email=f"{key}@example.com", username=uuid4().hex)
            WorkspaceMember.objects.create(workspace=project.workspace, member=user, role=role)
            ProjectMember.objects.create(project=project, member=user, role=role)
            users[key] = user
        return users

    def _poll_with_mode(self, config, mode, user_ids=None):
        config.notify_mode = mode
        config.notify_user_ids = user_ids or []
        config.save()
        return _run_poll([_graph_message()])

    @pytest.mark.django_db
    def test_none_mode_creates_no_subscribers(self, service_desk_config, members):
        _, mock_activity = self._poll_with_mode(service_desk_config, "NONE")
        assert IssueSubscriber.objects.count() == 0
        assert mock_activity.delay.call_args.kwargs["notification"] is False

    @pytest.mark.django_db
    def test_admins_mode_subscribes_admins_only(self, service_desk_config, members):
        _, mock_activity = self._poll_with_mode(service_desk_config, "ADMINS")
        subscriber_ids = set(IssueSubscriber.objects.values_list("subscriber_id", flat=True))
        assert subscriber_ids == {members["admin"].id}
        assert mock_activity.delay.call_args.kwargs["notification"] is True
        assert mock_activity.delay.call_args.kwargs["subscriber"] is False

    @pytest.mark.django_db
    def test_members_mode_excludes_guests(self, service_desk_config, members):
        self._poll_with_mode(service_desk_config, "MEMBERS")
        subscriber_ids = set(IssueSubscriber.objects.values_list("subscriber_id", flat=True))
        assert subscriber_ids == {members["admin"].id, members["member"].id}

    @pytest.mark.django_db
    def test_custom_mode_filters_to_project_members(self, service_desk_config, members):
        from uuid import uuid4

        outsider = User.objects.create(email="outsider@example.com", username=uuid4().hex)
        self._poll_with_mode(
            service_desk_config,
            "CUSTOM",
            user_ids=[str(members["guest"].id), str(outsider.id)],
        )
        subscriber_ids = set(IssueSubscriber.objects.values_list("subscriber_id", flat=True))
        assert subscriber_ids == {members["guest"].id}
