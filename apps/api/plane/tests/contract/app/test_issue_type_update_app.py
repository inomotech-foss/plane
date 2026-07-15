# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Regression tests: the app API must accept `type_id` on create/update
(the web app sends `type_id`, not `type`) and return `type_id` in issue
payloads. Previously the key was silently dropped, so changing a work
item's type in the frontend was never saved."""

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueType, Project, ProjectIssueType, ProjectMember, State


@pytest.fixture
def project_a(db, workspace, create_user):
    project = Project.objects.create(
        name="Project A",
        identifier="PA",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.create(name="Todo", group="backlog", project=project, workspace=workspace, default=True)
    return project


@pytest.fixture
def project_b(db, workspace, create_user):
    project = Project.objects.create(
        name="Project B",
        identifier="PB",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def type_a(db, workspace, project_a):
    """A work item type enabled only for project A."""
    issue_type = IssueType.objects.create(workspace=workspace, name="Bug", is_epic=False)
    ProjectIssueType.objects.create(project=project_a, issue_type=issue_type, workspace=workspace)
    return issue_type


@pytest.fixture
def type_b(db, workspace, project_b):
    """A work item type enabled only for project B."""
    issue_type = IssueType.objects.create(workspace=workspace, name="Story", is_epic=False)
    ProjectIssueType.objects.create(project=project_b, issue_type=issue_type, workspace=workspace)
    return issue_type


def issues_url(slug, project_id, issue_id=None):
    base = f"/api/workspaces/{slug}/projects/{project_id}/issues/"
    return f"{base}{issue_id}/" if issue_id else base


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkItemTypeIdRoundTripApp:
    def test_create_work_item_with_type_id(self, session_client, workspace, project_a, type_a):
        response = session_client.post(
            issues_url(workspace.slug, project_a.id),
            {"name": "Typed issue", "type_id": str(type_a.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert Issue.objects.get(pk=response.data["id"]).type_id == type_a.id

    def test_patch_type_id_updates_type(self, session_client, workspace, project_a, type_a):
        create_response = session_client.post(
            issues_url(workspace.slug, project_a.id),
            {"name": "Untyped issue"},
            format="json",
        )
        issue_id = create_response.data["id"]

        response = session_client.patch(
            issues_url(workspace.slug, project_a.id, issue_id),
            {"type_id": str(type_a.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert Issue.objects.get(pk=issue_id).type_id == type_a.id

    def test_patch_type_id_from_foreign_project_rejected(self, session_client, workspace, project_a, type_b):
        create_response = session_client.post(
            issues_url(workspace.slug, project_a.id),
            {"name": "Untyped issue"},
            format="json",
        )
        issue_id = create_response.data["id"]

        response = session_client.patch(
            issues_url(workspace.slug, project_a.id, issue_id),
            {"type_id": str(type_b.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert Issue.objects.get(pk=issue_id).type_id is None

    def test_list_returns_type_id(self, session_client, workspace, project_a, type_a):
        session_client.post(
            issues_url(workspace.slug, project_a.id),
            {"name": "Typed issue", "type_id": str(type_a.id)},
            format="json",
        )

        response = session_client.get(issues_url(workspace.slug, project_a.id))

        assert response.status_code == status.HTTP_200_OK
        issues = response.data if isinstance(response.data, list) else response.data.get("results", [])
        assert any(str(issue.get("type_id")) == str(type_a.id) for issue in issues)

    def test_retrieve_returns_type_id(self, session_client, workspace, project_a, type_a):
        create_response = session_client.post(
            issues_url(workspace.slug, project_a.id),
            {"name": "Typed issue", "type_id": str(type_a.id)},
            format="json",
        )
        issue_id = create_response.data["id"]

        response = session_client.get(issues_url(workspace.slug, project_a.id, issue_id))

        assert response.status_code == status.HTTP_200_OK
        assert str(response.data["type_id"]) == str(type_a.id)
