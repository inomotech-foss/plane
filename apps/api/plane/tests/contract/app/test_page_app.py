# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Regression tests for the internal app pages endpoints.

PageViewSet.get_queryset used to filter ``parent__isnull=True``, which
excluded every sub-page from the project pages list and made sub-pages
unretrievable by id. With a hierarchy imported from Confluence (~all pages
have ``parent`` set) the pages list appeared flat/empty and no page tree
could be rendered by the web app.
"""

import pytest
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, ProjectPage


@pytest.fixture
def project(db, workspace, create_user):
    """Create a test project with the user as a member"""
    project = Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(
        project=project,
        member=create_user,
        role=20,  # Admin role
        is_active=True,
    )
    return project


def make_page(workspace, project, user, name, parent=None):
    page = Page.objects.create(
        name=name,
        description_html="<p></p>",
        workspace=workspace,
        owned_by=user,
        created_by=user,
        parent=parent,
        access=Page.PUBLIC_ACCESS,
    )
    ProjectPage.objects.create(
        workspace=workspace,
        project=project,
        page=page,
        created_by=user,
    )
    return page


@pytest.fixture
def page_tree(db, workspace, project, create_user):
    """root -> child -> grandchild hierarchy in the project"""
    root = make_page(workspace, project, create_user, "Root Page")
    child = make_page(workspace, project, create_user, "Child Page", parent=root)
    grandchild = make_page(workspace, project, create_user, "Grandchild Page", parent=child)
    return root, child, grandchild


@pytest.mark.contract
class TestProjectPagesAppEndpoint:
    """Test the internal app project pages list/retrieve endpoints"""

    def get_pages_url(self, workspace_slug, project_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/"

    @pytest.mark.django_db
    def test_list_includes_sub_pages_with_parent(self, session_client, workspace, project, page_tree):
        """The pages list must return sub-pages and expose their parent id"""
        root, child, grandchild = page_tree

        response = session_client.get(self.get_pages_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        pages_by_id = {page["id"]: page for page in response.data}
        assert set(pages_by_id.keys()) == {root.id, child.id, grandchild.id}
        assert pages_by_id[root.id]["parent"] is None
        assert pages_by_id[child.id]["parent"] == root.id
        assert pages_by_id[grandchild.id]["parent"] == child.id

    @pytest.mark.django_db
    def test_retrieve_sub_page_by_id(self, session_client, workspace, project, page_tree):
        """A sub-page must be retrievable by id"""
        _root, child, _grandchild = page_tree

        response = session_client.get(f"{self.get_pages_url(workspace.slug, project.id)}{child.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == child.id
