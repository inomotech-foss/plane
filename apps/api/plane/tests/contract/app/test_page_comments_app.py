# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the internal app page-comment (document comment) endpoints."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    EmailNotificationLog,
    FileAsset,
    Notification,
    Page,
    PageComment,
    Project,
    ProjectMember,
    ProjectPage,
    User,
    UserNotificationPreference,
    WorkspaceMember,
)


def mention_html(user_id, label="@Mem"):
    return (
        f'<p>hey <mention-component entity_name="user_mention" '
        f'entity_identifier="{user_id}">{label}</mention-component></p>'
    )


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Test Project", identifier="TP", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def page(db, workspace, project, create_user):
    page = Page.objects.create(
        name="Test Page",
        description_html="<p>Body</p>",
        workspace=workspace,
        owned_by=create_user,
        created_by=create_user,
        access=Page.PUBLIC_ACCESS,
    )
    ProjectPage.objects.create(workspace=workspace, project=project, page=page, created_by=create_user)
    return page


@pytest.fixture
def non_member_client(db, workspace):
    """A session client for a user who is NOT a member of the project."""
    other = User.objects.create(email="outsider@plane.so", username="outsider", first_name="Out", last_name="Sider")
    other.set_password("x")
    other.save()
    client = APIClient()
    client.force_authenticate(user=other)
    return client


@pytest.fixture
def member_client(db, workspace, project):
    """A session client for a project MEMBER who is not the comment author."""
    member = User.objects.create(email="member@plane.so", username="member", first_name="Mem", last_name="Ber")
    member.set_password("x")
    member.save()
    ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)
    client = APIClient()
    client.force_authenticate(user=member)
    return client, member


def base_url(slug, project_id, page_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/comments/"


def reactions_url(slug, project_id, page_id, comment_id):
    return f"{base_url(slug, project_id, page_id)}{comment_id}/reactions/"


@pytest.mark.contract
class TestPageCommentsAppEndpoint:
    @pytest.mark.django_db
    def test_create_thread(self, session_client, workspace, project, page):
        url = base_url(workspace.slug, project.id, page.id)
        payload = {"comment_html": "<p>First thread</p>", "anchor_id": "thread-1"}
        response = session_client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["anchor_id"] == "thread-1"
        assert response.data["comment_stripped"] == "First thread"
        assert response.data["is_resolved"] is False
        assert response.data["actor"] is not None

    @pytest.mark.django_db
    def test_list_threads(self, session_client, workspace, project, page, create_user):
        PageComment.objects.create(page=page, comment_html="<p>a</p>", anchor_id="t1", actor=create_user)
        PageComment.objects.create(page=page, comment_html="<p>b</p>", anchor_id="t2", actor=create_user)
        response = session_client.get(base_url(workspace.slug, project.id, page.id))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2

    @pytest.mark.django_db
    def test_reply_to_thread(self, session_client, workspace, project, page, create_user):
        parent = PageComment.objects.create(page=page, comment_html="<p>parent</p>", anchor_id="t1", actor=create_user)
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": "<p>a reply</p>", "parent": str(parent.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["parent"] == parent.id
        assert PageComment.objects.filter(parent=parent).count() == 1

    @pytest.mark.django_db
    def test_update_comment_sets_edited_at(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(page=page, comment_html="<p>old</p>", anchor_id="t1", actor=create_user)
        url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/"
        response = session_client.patch(url, {"comment_html": "<p>new</p>"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["comment_stripped"] == "new"
        assert response.data["edited_at"] is not None

    @pytest.mark.django_db
    def test_delete_comment(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(page=page, comment_html="<p>x</p>", anchor_id="t1", actor=create_user)
        url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/"
        response = session_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not PageComment.all_objects.filter(pk=comment.id, deleted_at__isnull=True).exists()

    @pytest.mark.django_db
    def test_resolve_and_unresolve(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(page=page, comment_html="<p>x</p>", anchor_id="t1", actor=create_user)
        resolve_url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/resolve/"
        response = session_client.post(resolve_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_resolved"] is True
        assert response.data["resolved_by"] is not None
        assert response.data["resolved_at"] is not None
        # unresolve
        response = session_client.delete(resolve_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_resolved"] is False
        assert response.data["resolved_by"] is None

    @pytest.mark.django_db
    def test_non_member_cannot_access(self, non_member_client, workspace, project, page):
        url = base_url(workspace.slug, project.id, page.id)
        response = non_member_client.get(url)
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED)
        response = non_member_client.post(url, {"comment_html": "<p>x</p>"}, format="json")
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED)

    @pytest.mark.django_db
    def test_hard_deleting_page_cascades_comments(self, workspace, project, page, create_user):
        PageComment.objects.create(page=page, comment_html="<p>x</p>", anchor_id="t1", actor=create_user)
        page_id = page.id
        # A hard delete must cascade at the DB level (page FK on_delete=CASCADE).
        page.delete(soft=False)
        assert not PageComment.all_objects.filter(page_id=page_id).exists()

    @pytest.mark.django_db
    def test_hard_deleting_thread_cascades_replies(self, workspace, project, page, create_user):
        parent = PageComment.objects.create(page=page, comment_html="<p>p</p>", anchor_id="t1", actor=create_user)
        PageComment.objects.create(page=page, comment_html="<p>r</p>", parent=parent, actor=create_user)
        parent.delete(soft=False)
        # parent FK on_delete=CASCADE removes replies too.
        assert not PageComment.all_objects.filter(parent_id=parent.id).exists()

    @pytest.mark.django_db
    def test_create_document_level_thread(self, session_client, workspace, project, page):
        """A top-level comment with no anchor_id is an end-of-document thread."""
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": "<p>page comment</p>"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["anchor_id"] is None
        assert response.data["parent"] is None
        # document-level threads are resolvable like inline ones
        resolve_url = f"{base_url(workspace.slug, project.id, page.id)}{response.data['id']}/resolve/"
        resolve_response = session_client.post(resolve_url)
        assert resolve_response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_non_author_member_cannot_edit(self, member_client, workspace, project, page, create_user):
        client, _ = member_client
        comment = PageComment.objects.create(page=page, comment_html="<p>owner</p>", anchor_id="t1", actor=create_user)
        url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/"
        response = client.patch(url, {"comment_html": "<p>hijack</p>"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_non_author_member_cannot_delete(self, member_client, workspace, project, page, create_user):
        client, _ = member_client
        comment = PageComment.objects.create(page=page, comment_html="<p>owner</p>", anchor_id="t1", actor=create_user)
        url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/"
        response = client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_author_can_delete_own(self, member_client, workspace, project, page):
        client, member = member_client
        comment = PageComment.objects.create(page=page, comment_html="<p>mine</p>", anchor_id="t1", actor=member)
        url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/"
        response = client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_admin_can_edit_others(self, session_client, member_client, workspace, project, page):
        # session_client is the project admin/owner; edit a member's comment.
        _, member = member_client
        comment = PageComment.objects.create(page=page, comment_html="<p>member</p>", anchor_id="t1", actor=member)
        url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/"
        response = session_client.patch(url, {"comment_html": "<p>edited</p>"}, format="json")
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_add_reaction(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(page=page, comment_html="<p>x</p>", anchor_id="t1", actor=create_user)
        url = reactions_url(workspace.slug, project.id, page.id, comment.id)
        response = session_client.post(url, {"reaction": "1f44d"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["reaction"] == "1f44d"
        # duplicate reaction is rejected
        duplicate = session_client.post(url, {"reaction": "1f44d"}, format="json")
        assert duplicate.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_reaction_nested_in_comment(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(page=page, comment_html="<p>x</p>", anchor_id="t1", actor=create_user)
        session_client.post(
            reactions_url(workspace.slug, project.id, page.id, comment.id),
            {"reaction": "1f44d"},
            format="json",
        )
        response = session_client.get(base_url(workspace.slug, project.id, page.id))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data[0]["comment_reactions"]) == 1

    @pytest.mark.django_db
    def test_delete_reaction(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(page=page, comment_html="<p>x</p>", anchor_id="t1", actor=create_user)
        url = reactions_url(workspace.slug, project.id, page.id, comment.id)
        session_client.post(url, {"reaction": "1f44d"}, format="json")
        response = session_client.delete(f"{url}1f44d/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_mention_creates_notification(self, session_client, workspace, project, page, member_client):
        _client, member = member_client
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": mention_html(member.id), "anchor_id": "t1"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        notifications = Notification.objects.filter(receiver=member, entity_name="page", entity_identifier=page.id)
        assert notifications.count() == 1
        assert notifications.first().sender == "in_app:page_comment:mentioned"

    @pytest.mark.django_db
    def test_mention_notification_surfaces_in_mentions_list(
        self, session_client, workspace, project, page, member_client
    ):
        """A page-comment mention must appear in the (issue-oriented) Mentions inbox."""
        client, member = member_client
        # The notifications endpoint is workspace-scoped; the member must be a
        # workspace member to read their own inbox.
        WorkspaceMember.objects.get_or_create(workspace=workspace, member=member, defaults={"role": 15})
        session_client.post(
            base_url(workspace.slug, project.id, page.id),
            {"comment_html": mention_html(member.id), "anchor_id": "t1"},
            format="json",
        )
        response = client.get(f"/api/workspaces/{workspace.slug}/users/notifications/?mentioned=true")
        assert response.status_code == status.HTTP_200_OK
        page_notifications = [n for n in response.data if n["entity_name"] == "page"]
        assert len(page_notifications) == 1
        assert page_notifications[0]["entity_identifier"] == str(page.id)

    @pytest.mark.django_db
    def test_self_mention_creates_no_notification(self, session_client, workspace, project, page, create_user):
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": mention_html(create_user.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert not Notification.objects.filter(receiver=create_user).exists()

    @pytest.mark.django_db
    def test_mention_of_non_member_creates_no_notification(
        self, session_client, workspace, project, page, non_member_client
    ):
        # non_member_client authenticates an outsider; mention them and expect nothing.
        outsider = User.objects.get(email="outsider@plane.so")
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": mention_html(outsider.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert not Notification.objects.filter(receiver=outsider).exists()

    @pytest.mark.django_db
    def test_edit_only_notifies_new_mentions(self, session_client, workspace, project, page, member_client):
        _client, member = member_client
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": mention_html(member.id), "anchor_id": "t1"}, format="json")
        comment_id = response.data["id"]
        # Re-mention the same user on edit; no additional notification.
        edit = session_client.patch(
            f"{url}{comment_id}/", {"comment_html": mention_html(member.id) + "<p>more</p>"}, format="json"
        )
        assert edit.status_code == status.HTTP_200_OK
        assert Notification.objects.filter(receiver=member, entity_name="page").count() == 1

    @pytest.mark.django_db
    def test_mention_queues_email_when_enabled(self, session_client, workspace, project, page, member_client):
        _client, member = member_client
        # A default preference (mention=True) is auto-created for every user; keep it on.
        UserNotificationPreference.objects.filter(user=member).update(mention=True)
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": mention_html(member.id), "anchor_id": "t1"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        logs = EmailNotificationLog.objects.filter(receiver=member, entity_name="page", entity_identifier=page.id)
        assert logs.count() == 1
        assert logs.first().data["page"]["name"] == page.name

    @pytest.mark.django_db
    def test_mention_no_email_when_disabled(self, session_client, workspace, project, page, member_client):
        _client, member = member_client
        UserNotificationPreference.objects.filter(user=member).update(mention=False)
        url = base_url(workspace.slug, project.id, page.id)
        response = session_client.post(url, {"comment_html": mention_html(member.id)}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert not EmailNotificationLog.objects.filter(receiver=member).exists()

    @pytest.mark.django_db
    def test_comment_asset_bulk_association(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(page=page, comment_html="<p>x</p>", anchor_id="t1", actor=create_user)
        asset = FileAsset.objects.create(
            attributes={"name": "img.png", "type": "image/png", "size": 10},
            asset="img.png",
            size=10,
            workspace=workspace,
            project=project,
            entity_type=FileAsset.EntityTypeContext.PAGE_COMMENT_DESCRIPTION,
            entity_identifier=str(comment.id),
            created_by=create_user,
            is_uploaded=True,
        )
        url = f"/api/assets/v2/workspaces/{workspace.slug}/projects/{project.id}/{comment.id}/bulk/"
        response = session_client.post(url, {"asset_ids": [str(asset.id)]}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        asset.refresh_from_db()
        assert str(asset.page_comment_id) == str(comment.id)
