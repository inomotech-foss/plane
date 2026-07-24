# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import patch
from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueComment,
    IssueEmailMessage,
    IssueEmailThread,
    Project,
    ServiceDeskConfig,
    State,
)
from plane.db.models.service_desk import EmailDeliveryStatus, EmailDirection
from plane.tests.factories import ProjectFactory, ProjectMemberFactory, UserFactory, WorkspaceMemberFactory

MAILBOX = "support@example.com"


@pytest.fixture
def project(db, workspace, create_user):
    project = ProjectFactory(workspace=workspace)
    ProjectMemberFactory(project=project, member=create_user, role=20)
    return project


@pytest.fixture
def member_client(db, workspace, project):
    """Session client for a project member with MEMBER (15) role."""
    user = UserFactory(username=uuid4().hex)
    WorkspaceMemberFactory(workspace=workspace, member=user, role=15)
    ProjectMemberFactory(project=project, member=user, role=15)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def email_issue(db, project):
    state = State.objects.create(
        name="Triage",
        group="triage",
        project_id=project.id,
        workspace_id=project.workspace_id,
        color="#4E5355",
        sequence=65000,
    )
    issue = Issue.objects.create(project_id=project.id, name="Printer is broken", state_id=state.id)
    thread = IssueEmailThread.objects.create(
        project_id=project.id,
        issue=issue,
        mailbox_email=MAILBOX,
        conversation_id="conv-1",
        creator_email="customer@example.com",
        creator_name="Customer One",
        subject="Printer is broken",
        to_emails=[],
        cc_emails=[],
        last_inbound_graph_message_id="msg-1",
    )
    return issue, thread


def config_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/service-desk/"


def thread_url(workspace, project, issue):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/email-thread/"


def reply_url(workspace, project, issue):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/email-replies/"


@pytest.mark.contract
class TestServiceDeskConfigEndpoint:
    @pytest.mark.django_db
    def test_get_returns_404_when_unconfigured(self, session_client, workspace, project):
        response = session_client.get(config_url(workspace, project))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_admin_can_create_and_read_config(self, session_client, workspace, project):
        response = session_client.post(
            config_url(workspace, project),
            {"mailbox_email": "Support@Example.com", "is_enabled": True},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["mailbox_email"] == MAILBOX
        assert response.data["is_enabled"] is True

        # Enabling the service desk switches the project's intake on.
        assert Project.objects.get(pk=project.id).intake_view is True

        response = session_client.get(config_url(workspace, project))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["mailbox_email"] == MAILBOX

        # Second POST updates in place instead of creating a duplicate.
        response = session_client.post(
            config_url(workspace, project),
            {"mailbox_email": MAILBOX, "is_enabled": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert ServiceDeskConfig.objects.filter(project=project).count() == 1

    @pytest.mark.django_db
    def test_invalid_mailbox_email_rejected(self, session_client, workspace, project):
        response = session_client.post(
            config_url(workspace, project),
            {"mailbox_email": "not-an-email", "is_enabled": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_enabling_without_mailbox_rejected(self, session_client, workspace, project):
        response = session_client.post(config_url(workspace, project), {"is_enabled": True}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_member_cannot_write_config(self, member_client, workspace, project):
        response = member_client.post(
            config_url(workspace, project),
            {"mailbox_email": MAILBOX, "is_enabled": True},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_member_can_read_config(self, member_client, workspace, project):
        ServiceDeskConfig.objects.create(project_id=project.id, mailbox_email=MAILBOX, is_enabled=True)
        response = member_client.get(config_url(workspace, project))
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.contract
class TestIssueEmailThreadEndpoint:
    @pytest.mark.django_db
    def test_get_returns_404_without_thread(self, session_client, workspace, project):
        state = State.objects.create(
            name="Backlog",
            group="backlog",
            project_id=project.id,
            workspace_id=project.workspace_id,
            color="#000000",
            sequence=10000,
        )
        issue = Issue.objects.create(project_id=project.id, name="Plain issue", state_id=state.id)
        response = session_client.get(thread_url(workspace, project, issue))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_get_returns_thread_with_messages(self, session_client, workspace, project, email_issue):
        issue, thread = email_issue
        IssueEmailMessage.objects.create(
            project_id=project.id,
            thread=thread,
            direction=EmailDirection.INBOUND,
            status=EmailDeliveryStatus.RECEIVED,
            from_email=thread.creator_email,
            subject=thread.subject,
            body_text="the printer is broken",
        )
        response = session_client.get(thread_url(workspace, project, issue))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["creator_email"] == "customer@example.com"
        assert len(response.data["messages"]) == 1

    @pytest.mark.django_db
    def test_patch_updates_recipients(self, session_client, workspace, project, email_issue):
        issue, thread = email_issue
        response = session_client.patch(
            thread_url(workspace, project, issue),
            {
                # creator + mailbox are filtered out, duplicates collapse, case is normalized
                "to_emails": ["Colleague@Example.com", "colleague@example.com", "customer@example.com", MAILBOX],
                "cc_emails": ["boss@example.com"],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        thread.refresh_from_db()
        assert thread.to_emails == ["colleague@example.com"]
        assert thread.cc_emails == ["boss@example.com"]

    @pytest.mark.django_db
    def test_patch_rejects_invalid_email(self, session_client, workspace, project, email_issue):
        issue, thread = email_issue
        response = session_client.patch(
            thread_url(workspace, project, issue),
            {"to_emails": ["not-an-email"]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        thread.refresh_from_db()
        assert thread.to_emails == []


@pytest.mark.contract
class TestIssueEmailReplyEndpoint:
    @pytest.mark.django_db
    def test_reply_requires_thread(self, session_client, workspace, project):
        state = State.objects.create(
            name="Backlog",
            group="backlog",
            project_id=project.id,
            workspace_id=project.workspace_id,
            color="#000000",
            sequence=10000,
        )
        issue = Issue.objects.create(project_id=project.id, name="Plain issue", state_id=state.id)
        response = session_client.post(
            reply_url(workspace, project, issue),
            {"comment_html": "<p>hello</p>"},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_reply_requires_body(self, session_client, workspace, project, email_issue):
        issue, _ = email_issue
        response = session_client.post(reply_url(workspace, project, issue), {"comment_html": ""}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_reply_creates_external_comment_and_queues_email(
        self, session_client, workspace, project, email_issue, create_user
    ):
        issue, thread = email_issue
        thread.to_emails = ["colleague@example.com"]
        thread.cc_emails = ["boss@example.com"]
        thread.save()

        with (
            patch("plane.app.views.service_desk.base.issue_activity") as mock_activity,
            patch("plane.app.views.service_desk.base.service_desk_send_reply") as mock_send,
        ):
            response = session_client.post(
                reply_url(workspace, project, issue),
                {"comment_html": "<p>We are on it!</p>"},
                format="json",
            )

        assert response.status_code == status.HTTP_201_CREATED

        comment = IssueComment.objects.get(issue=issue)
        assert comment.access == "EXTERNAL"
        assert comment.actor_id == create_user.id
        assert "We are on it!" in comment.comment_html

        email_message = IssueEmailMessage.objects.get(thread=thread, direction=EmailDirection.OUTBOUND)
        assert email_message.status == EmailDeliveryStatus.PENDING
        assert email_message.to_emails == ["customer@example.com", "colleague@example.com"]
        assert email_message.cc_emails == ["boss@example.com"]
        assert email_message.comment_id == comment.id
        assert email_message.from_email == MAILBOX

        mock_send.delay.assert_called_once_with(str(email_message.id))
        assert mock_activity.delay.call_args.kwargs["notification"] is True


@pytest.mark.contract
class TestServiceDeskWebhookEndpoint:
    url = "/api/service-desk/webhook/"

    @pytest.mark.django_db
    def test_validation_handshake_echoes_token(self, api_client):
        response = api_client.post(f"{self.url}?validationToken=abc123")
        assert response.status_code == status.HTTP_200_OK
        assert response.content == b"abc123"
        assert response["Content-Type"].startswith("text/plain")

    @pytest.mark.django_db
    def test_valid_notification_schedules_sync(self, api_client, project):
        config = ServiceDeskConfig.objects.create(
            project_id=project.id,
            mailbox_email=MAILBOX,
            is_enabled=True,
            graph_subscription_id="sub-1",
            webhook_client_state="topsecret",
        )
        with patch("plane.app.views.service_desk.base.service_desk_sync_mailbox") as mock_sync:
            response = api_client.post(
                self.url,
                {"value": [{"subscriptionId": "sub-1", "clientState": "topsecret"}]},
                format="json",
            )
        assert response.status_code == status.HTTP_202_ACCEPTED
        mock_sync.delay.assert_called_once_with(str(config.id))

    @pytest.mark.django_db
    def test_wrong_client_state_is_ignored(self, api_client, project):
        ServiceDeskConfig.objects.create(
            project_id=project.id,
            mailbox_email=MAILBOX,
            is_enabled=True,
            graph_subscription_id="sub-1",
            webhook_client_state="topsecret",
        )
        with patch("plane.app.views.service_desk.base.service_desk_sync_mailbox") as mock_sync:
            response = api_client.post(
                self.url,
                {"value": [{"subscriptionId": "sub-1", "clientState": "wrong"}]},
                format="json",
            )
        # Still 202 so Graph does not retry, but nothing is scheduled.
        assert response.status_code == status.HTTP_202_ACCEPTED
        mock_sync.delay.assert_not_called()

    @pytest.mark.django_db
    def test_unknown_subscription_is_ignored(self, api_client):
        with patch("plane.app.views.service_desk.base.service_desk_sync_mailbox") as mock_sync:
            response = api_client.post(
                self.url,
                {"value": [{"subscriptionId": "sub-unknown", "clientState": "x"}]},
                format="json",
            )
        assert response.status_code == status.HTTP_202_ACCEPTED
        mock_sync.delay.assert_not_called()


@pytest.mark.contract
class TestServiceDeskConfigSubscriptionTrigger:
    @pytest.mark.django_db
    def test_config_save_triggers_subscription_maintenance(self, session_client, workspace, project):
        with patch("plane.app.views.service_desk.base.service_desk_maintain_subscriptions") as mock_maintain:
            response = session_client.post(
                config_url(workspace, project),
                {"mailbox_email": MAILBOX, "is_enabled": True},
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED
        mock_maintain.delay.assert_called_once()


@pytest.mark.contract
class TestServiceDeskNotifySettings:
    @pytest.mark.django_db
    def test_notify_settings_persist(self, session_client, workspace, project, create_user):
        response = session_client.post(
            config_url(workspace, project),
            {
                "mailbox_email": MAILBOX,
                "is_enabled": True,
                "notify_mode": "CUSTOM",
                "notify_user_ids": [str(create_user.id), "not-a-uuid", str(uuid4())],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["notify_mode"] == "CUSTOM"
        # Invalid and non-member ids are dropped; the admin is a project member.
        assert response.data["notify_user_ids"] == [str(create_user.id)]

    @pytest.mark.django_db
    def test_invalid_notify_mode_rejected(self, session_client, workspace, project):
        response = session_client.post(
            config_url(workspace, project),
            {"mailbox_email": MAILBOX, "is_enabled": False, "notify_mode": "EVERYONE"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_omitting_notify_fields_keeps_stored_values(self, session_client, workspace, project, create_user):
        ServiceDeskConfig.objects.create(
            project_id=project.id,
            mailbox_email=MAILBOX,
            is_enabled=True,
            notify_mode="CUSTOM",
            notify_user_ids=[str(create_user.id)],
        )
        with patch("plane.app.views.service_desk.base.service_desk_maintain_subscriptions"):
            response = session_client.post(
                config_url(workspace, project),
                {"mailbox_email": MAILBOX, "is_enabled": True},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["notify_mode"] == "CUSTOM"
        assert response.data["notify_user_ids"] == [str(create_user.id)]
