# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the public v1 (API-key) page-comment endpoints."""

import pytest
from rest_framework import status

from plane.db.models import Page, PageComment, Project, ProjectMember, ProjectPage


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Test Project", identifier="TP", workspace=workspace, created_by=create_user
    )
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
    ProjectPage.objects.create(
        workspace=workspace, project=project, page=page, created_by=create_user
    )
    return page


def base_url(slug, project_id, page_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/pages/{page_id}/comments/"


@pytest.mark.contract
class TestPageCommentsV1Endpoint:
    @pytest.mark.django_db
    def test_create_and_list(self, api_key_client, workspace, project, page):
        url = base_url(workspace.slug, project.id, page.id)
        response = api_key_client.post(
            url, {"comment_html": "<p>hi</p>", "anchor_id": "t1"}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["anchor_id"] == "t1"

        response = api_key_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    @pytest.mark.django_db
    def test_reply(self, api_key_client, workspace, project, page, create_user):
        parent = PageComment.objects.create(
            page=page, comment_html="<p>p</p>", anchor_id="t1", actor=create_user
        )
        url = base_url(workspace.slug, project.id, page.id)
        response = api_key_client.post(
            url, {"comment_html": "<p>r</p>", "parent": str(parent.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["parent"] == parent.id

    @pytest.mark.django_db
    def test_update_and_delete(self, api_key_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(
            page=page, comment_html="<p>p</p>", anchor_id="t1", actor=create_user
        )
        detail = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/"
        response = api_key_client.patch(detail, {"comment_html": "<p>edited</p>"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["comment_stripped"] == "edited"
        response = api_key_client.delete(detail)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_resolve_unresolve(self, api_key_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(
            page=page, comment_html="<p>p</p>", anchor_id="t1", actor=create_user
        )
        url = f"{base_url(workspace.slug, project.id, page.id)}{comment.id}/resolve/"
        response = api_key_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_resolved"] is True
        response = api_key_client.delete(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_resolved"] is False

    @pytest.mark.django_db
    def test_external_id_conflict(self, api_key_client, workspace, project, page):
        url = base_url(workspace.slug, project.id, page.id)
        data = {"comment_html": "<p>x</p>", "external_id": "ext-1", "external_source": "src"}
        first = api_key_client.post(url, data, format="json")
        assert first.status_code == status.HTTP_201_CREATED
        second = api_key_client.post(url, data, format="json")
        assert second.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_unauthenticated_rejected(self, api_client, workspace, project, page):
        response = api_client.get(base_url(workspace.slug, project.id, page.id))
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
