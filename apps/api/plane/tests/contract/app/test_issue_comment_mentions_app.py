# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""End-to-end contract tests for @-mention notifications on issue comments.

Runs the issue_activity -> notifications Celery chain eagerly to cover the whole
path from POST to a persisted Notification row.
"""

import pytest
from rest_framework import status

from plane.celery import app as celery_app
from plane.db.models import (
    EmailNotificationLog,
    Issue,
    Notification,
    Project,
    ProjectMember,
    State,
    User,
    UserNotificationPreference,
)


def mention_html(user_id, label="@Mem"):
    return (
        f'<p>hey <mention-component entity_name="user_mention" '
        f'entity_identifier="{user_id}">{label}</mention-component></p>'
    )


@pytest.fixture
def eager_celery():
    """Run dispatched Celery tasks synchronously for the duration of a test."""
    prev_eager = celery_app.conf.task_always_eager
    prev_propagate = celery_app.conf.task_eager_propagates
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    yield
    celery_app.conf.task_always_eager = prev_eager
    celery_app.conf.task_eager_propagates = prev_propagate


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Test Project", identifier="TP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.create(
        name="Backlog", color="#000", group="backlog", default=True, project=project, workspace=workspace
    )
    return project


@pytest.fixture
def issue(db, workspace, project, create_user):
    return Issue.objects.create(name="Existing Issue", project=project, workspace=workspace, created_by=create_user)


@pytest.fixture
def member(db, workspace, project):
    """A project member who is not the comment author."""
    user = User.objects.create(email="member@plane.so", username="member", first_name="Mem", last_name="Ber")
    user.set_password("x")
    user.save()
    ProjectMember.objects.create(project=project, member=user, role=15, is_active=True)
    return user


@pytest.fixture
def outsider(db, workspace):
    """A user who is not a member of the project."""
    user = User.objects.create(email="outsider@plane.so", username="outsider", first_name="Out", last_name="Sider")
    user.set_password("x")
    user.save()
    return user


def comments_url(slug, project_id, issue_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/comments/"


@pytest.mark.contract
class TestIssueCommentMentions:
    @pytest.mark.django_db
    def test_mention_creates_notification(self, eager_celery, session_client, workspace, project, issue, member):
        url = comments_url(workspace.slug, project.id, issue.id)
        response = session_client.post(url, {"comment_html": mention_html(member.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        notifications = Notification.objects.filter(
            receiver=member,
            entity_name="issue",
            entity_identifier=issue.id,
            sender="in_app:issue_activities:mentioned",
        )
        assert notifications.count() == 1

    @pytest.mark.django_db
    def test_self_mention_creates_no_notification(self, eager_celery, session_client, workspace, project, issue):
        url = comments_url(workspace.slug, project.id, issue.id)
        author = User.objects.get(email="test@plane.so")
        response = session_client.post(url, {"comment_html": mention_html(author.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert not Notification.objects.filter(receiver=author, sender="in_app:issue_activities:mentioned").exists()

    @pytest.mark.django_db
    def test_mention_of_non_member_creates_no_notification(
        self, eager_celery, session_client, workspace, project, issue, outsider
    ):
        url = comments_url(workspace.slug, project.id, issue.id)
        response = session_client.post(url, {"comment_html": mention_html(outsider.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert not Notification.objects.filter(receiver=outsider).exists()

    @pytest.mark.django_db
    def test_edit_only_notifies_new_mentions(self, eager_celery, session_client, workspace, project, issue, member):
        url = comments_url(workspace.slug, project.id, issue.id)
        response = session_client.post(url, {"comment_html": mention_html(member.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        comment_id = response.data["id"]

        edit = session_client.patch(
            f"{url}{comment_id}/", {"comment_html": mention_html(member.id) + "<p>more</p>"}, format="json"
        )
        assert edit.status_code == status.HTTP_200_OK
        assert (
            Notification.objects.filter(
                receiver=member, entity_name="issue", sender="in_app:issue_activities:mentioned"
            ).count()
            == 1
        )

    @pytest.mark.django_db
    def test_mention_queues_email_when_enabled(self, eager_celery, session_client, workspace, project, issue, member):
        UserNotificationPreference.objects.filter(user=member).update(mention=True)
        url = comments_url(workspace.slug, project.id, issue.id)
        response = session_client.post(url, {"comment_html": mention_html(member.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert EmailNotificationLog.objects.filter(receiver=member, entity_name="issue").exists()
