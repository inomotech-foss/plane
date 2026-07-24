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
        fake_client.create_reply_draft.return_value = {"id": "draft-1"}
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
        assert outbound_message.graph_message_id == "draft-1"

        fake_client.create_reply_draft.assert_called_once_with(MAILBOX, "msg-1")
        update_args = fake_client.update_message.call_args.args
        assert update_args[1] == "draft-1"
        payload = update_args[2]
        assert payload["body"]["content"] == "<p>We are on it.</p>"
        assert payload["toRecipients"] == [{"emailAddress": {"address": "customer@example.com"}}]
        assert payload["ccRecipients"] == [{"emailAddress": {"address": "colleague@example.com"}}]
        fake_client.send_draft.assert_called_once_with(MAILBOX, "draft-1")
        fake_client.add_attachment.assert_not_called()

    @pytest.mark.django_db
    def test_sends_inline_and_explicit_attachments(self, outbound_message):
        from plane.db.models import FileAsset

        thread = outbound_message.thread
        inline_asset = FileAsset.objects.create(
            attributes={"name": "shot.png", "type": "image/png", "size": 4},
            asset=f"{thread.workspace_id}/inline-shot.png",
            size=4,
            workspace_id=thread.workspace_id,
            project_id=thread.project_id,
            entity_type=FileAsset.EntityTypeContext.COMMENT_DESCRIPTION,
            is_uploaded=True,
        )
        explicit_asset = FileAsset.objects.create(
            attributes={"name": "log.pdf", "type": "application/pdf", "size": 4},
            asset=f"{thread.workspace_id}/log.pdf",
            size=4,
            workspace_id=thread.workspace_id,
            project_id=thread.project_id,
            issue_id=thread.issue_id,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            is_uploaded=True,
        )
        outbound_message.body_html = f'<p>see</p><image-component src="{inline_asset.id}"></image-component>'
        outbound_message.attachments = [{"asset_id": str(explicit_asset.id), "name": "log.pdf"}]
        outbound_message.save()

        fake_client = MagicMock()
        fake_client.create_reply_draft.return_value = {"id": "draft-1"}
        fake_storage = MagicMock()
        fake_storage.s3_client.get_object.return_value = {"Body": MagicMock(read=MagicMock(return_value=b"data"))}
        with (
            patch(
                "plane.bgtasks.service_desk_task.get_service_desk_configuration",
                return_value=("tenant", "client", "secret"),
            ),
            patch("plane.bgtasks.service_desk_task.MSGraphMailClient", return_value=fake_client),
            patch("plane.bgtasks.service_desk_task.S3Storage", return_value=fake_storage),
        ):
            service_desk_send_reply(str(outbound_message.id))

        outbound_message.refresh_from_db()
        assert outbound_message.status == EmailDeliveryStatus.SENT

        sent_body = fake_client.update_message.call_args.args[2]["body"]["content"]
        assert f'src="cid:{inline_asset.id}"' in sent_body
        assert "image-component" not in sent_body

        attachment_calls = {call.kwargs.get("name"): call.kwargs for call in fake_client.add_attachment.call_args_list}
        assert attachment_calls["shot.png"]["is_inline"] is True
        assert attachment_calls["shot.png"]["content_id"] == str(inline_asset.id)
        assert "is_inline" not in attachment_calls["log.pdf"] or not attachment_calls["log.pdf"].get("is_inline")
        fake_client.send_draft.assert_called_once_with(MAILBOX, "draft-1")

    @pytest.mark.django_db
    def test_failure_is_recorded(self, outbound_message):
        fake_client = MagicMock()
        fake_client.create_reply_draft.side_effect = Exception("Graph is down")
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


@pytest.mark.unit
class TestPrepareOutgoingHtml:
    def test_rewrites_image_components_to_cid(self):
        from plane.bgtasks.service_desk_task import _prepare_outgoing_html

        asset_id = "0b0b7a48-9a72-4a3c-9f78-8f1a4f3f3a11"
        html_body, ids = _prepare_outgoing_html(f'<p>hi</p><image-component src="{asset_id}"></image-component>')
        assert ids == [asset_id]
        assert f'<img src="cid:{asset_id}"' in html_body
        assert "image-component" not in html_body

    def test_drops_invalid_srcs_and_keeps_external_urls(self):
        from plane.bgtasks.service_desk_task import _prepare_outgoing_html

        html_body, ids = _prepare_outgoing_html(
            '<image-component src="not-a-uuid"></image-component><img src="https://x.example/y.png"/>'
        )
        assert ids == []
        assert "image-component" not in html_body
        assert 'src="https://x.example/y.png"' in html_body


@pytest.mark.unit
class TestInboundAttachmentIngestion:
    def _attachment(
        self,
        att_id="att-1",
        name="IMG_7550.HEIC",
        content_type="image/heic",
        size=1024,
        kind="#microsoft.graph.fileAttachment",
    ):
        return {"@odata.type": kind, "id": att_id, "name": name, "contentType": content_type, "size": size}

    def _run_poll_with_attachments(self, attachments):
        message = _graph_message()
        message["hasAttachments"] = True
        fake_client = MagicMock()
        fake_client.list_unread_messages.return_value = [message]
        fake_client.list_message_attachments.return_value = attachments
        fake_client.download_attachment.return_value = b"filedata"
        fake_storage = MagicMock()
        fake_storage.get_object_metadata.return_value = {"ContentType": "x"}
        with (
            patch("plane.bgtasks.service_desk_task.redis_instance") as mock_redis,
            patch(
                "plane.bgtasks.service_desk_task.get_service_desk_configuration",
                return_value=("tenant", "client", "secret"),
            ),
            patch("plane.bgtasks.service_desk_task.MSGraphMailClient", return_value=fake_client),
            patch("plane.bgtasks.service_desk_task.S3Storage", return_value=fake_storage),
            patch("plane.bgtasks.service_desk_task.issue_activity") as mock_activity,
        ):
            mock_redis.return_value.set.return_value = True
            service_desk_poll()
        return fake_client, fake_storage, mock_activity

    @pytest.mark.django_db
    def test_heic_attachment_becomes_issue_attachment(self, service_desk_config):
        from plane.db.models import FileAsset

        _, fake_storage, mock_activity = self._run_poll_with_attachments([self._attachment()])

        issue = Issue.objects.get()
        asset = FileAsset.objects.get(entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT)
        assert asset.issue_id == issue.id
        assert asset.is_uploaded is True
        assert asset.attributes["name"] == "IMG_7550.HEIC"
        assert asset.attributes["type"] == "image/heic"
        fake_storage.upload_file.assert_called_once()

        email_message = IssueEmailMessage.objects.get()
        assert email_message.attachments[0]["asset_id"] == str(asset.id)
        assert "skipped" not in email_message.attachments[0]

        activity_types = [call.kwargs["type"] for call in mock_activity.delay.call_args_list]
        assert "attachment.activity.created" in activity_types

    @pytest.mark.django_db
    def test_skips_oversized_disallowed_and_non_file_attachments(self, service_desk_config):
        from django.conf import settings as django_settings

        from plane.db.models import FileAsset

        attachments = [
            self._attachment(att_id="a1", name="huge.png", size=django_settings.FILE_SIZE_LIMIT + 1),
            self._attachment(att_id="a2", name="run.exe", content_type="application/x-msdownload"),
            self._attachment(att_id="a3", name="mail.eml", kind="#microsoft.graph.itemAttachment"),
        ]
        fake_client, _, _ = self._run_poll_with_attachments(attachments)

        assert FileAsset.objects.count() == 0
        fake_client.download_attachment.assert_not_called()
        email_message = IssueEmailMessage.objects.get()
        reasons = {record["name"]: record["skipped"] for record in email_message.attachments}
        assert reasons == {
            "huge.png": "exceeds file size limit",
            "run.exe": "file type not allowed",
            "mail.eml": "unsupported attachment kind",
        }
