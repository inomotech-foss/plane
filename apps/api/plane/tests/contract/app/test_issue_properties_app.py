# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from decimal import Decimal
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    Project,
    ProjectMember,
    PropertyTypeChoices,
    State,
    WorkspaceMember,
)


@pytest.fixture
def project(db, workspace, create_user):
    """Create a test project with the user as an admin member"""
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


@pytest.fixture
def state(db, project, create_user):
    """Create a test state for work items"""
    return State.objects.create(
        name="Todo",
        group="unstarted",
        color="#0000FF",
        project=project,
        workspace=project.workspace,
        created_by=create_user,
    )


@pytest.fixture
def issue(db, project, state, create_user):
    """Create a test work item"""
    return Issue.objects.create(
        name="Test Work Item",
        project=project,
        workspace=project.workspace,
        state=state,
        created_by=create_user,
    )


@pytest.fixture
def second_issue(db, project, state, create_user):
    """Create another test work item"""
    return Issue.objects.create(
        name="Second Work Item",
        project=project,
        workspace=project.workspace,
        state=state,
        created_by=create_user,
    )


@pytest.fixture
def number_property(db, project, create_user):
    """Create a NUMBER work item property"""
    return IssueProperty.objects.create(
        name="Total Amount",
        display_name="Total Amount",
        property_type=PropertyTypeChoices.NUMBER,
        project=project,
        workspace=project.workspace,
        created_by=create_user,
    )


@pytest.fixture
def option_property(db, project, create_user):
    """Create an OPTION work item property with options"""
    issue_property = IssueProperty.objects.create(
        name="Business Unit",
        display_name="Business Unit",
        property_type=PropertyTypeChoices.OPTION,
        project=project,
        workspace=project.workspace,
        created_by=create_user,
    )
    for name in ("CONNECT", "MOBILITY"):
        IssuePropertyOption.objects.create(
            name=name,
            property=issue_property,
            project=project,
            workspace=project.workspace,
            created_by=create_user,
        )
    return issue_property


@pytest.fixture
def multi_option_property(db, project, create_user):
    """Create a MULTI_OPTION work item property with options"""
    issue_property = IssueProperty.objects.create(
        name="Regions",
        display_name="Regions",
        property_type=PropertyTypeChoices.MULTI_OPTION,
        project=project,
        workspace=project.workspace,
        created_by=create_user,
    )
    for name in ("EU", "US", "APAC"):
        IssuePropertyOption.objects.create(
            name=name,
            property=issue_property,
            project=project,
            workspace=project.workspace,
            created_by=create_user,
        )
    return issue_property


class IssuePropertyAppUrls:
    def properties_url(self, slug, project_id, property_id=None):
        base = f"/api/workspaces/{slug}/projects/{project_id}/issue-properties/"
        return f"{base}{property_id}/" if property_id else base

    def options_url(self, slug, project_id, property_id, option_id=None):
        base = f"/api/workspaces/{slug}/projects/{project_id}/issue-properties/{property_id}/options/"
        return f"{base}{option_id}/" if option_id else base

    def values_url(self, slug, project_id, issue_id):
        return f"/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/property-values/"

    def bulk_values_url(self, slug, project_id):
        return f"/api/workspaces/{slug}/projects/{project_id}/issue-property-values/"

    def issues_url(self, slug, project_id):
        return f"/api/workspaces/{slug}/projects/{project_id}/issues/"


@pytest.mark.contract
@pytest.mark.django_db
class TestIssuePropertyAppCrud(IssuePropertyAppUrls):
    def test_create_property(self, session_client, workspace, project):
        url = self.properties_url(workspace.slug, project.id)
        response = session_client.post(
            url,
            {"name": "Total Amount", "property_type": "NUMBER"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Total Amount"
        # display_name defaults to name
        assert response.data["display_name"] == "Total Amount"
        assert response.data["property_type"] == "NUMBER"
        assert IssueProperty.objects.filter(project=project).count() == 1

    def test_create_property_with_inline_options(self, session_client, workspace, project):
        url = self.properties_url(workspace.slug, project.id)
        response = session_client.post(
            url,
            {
                "name": "Probability",
                "property_type": "OPTION",
                "options": [{"name": "Low"}, {"name": "High"}],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert {option["name"] for option in response.data["options"]} == {"Low", "High"}

    def test_create_property_rejects_options_for_non_option_types(self, session_client, workspace, project):
        url = self.properties_url(workspace.slug, project.id)
        response = session_client.post(
            url,
            {"name": "Amount", "property_type": "NUMBER", "options": [{"name": "Low"}]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_property_duplicate_name(self, session_client, workspace, project, number_property):
        url = self.properties_url(workspace.slug, project.id)
        response = session_client.post(
            url,
            {"name": number_property.name, "property_type": "NUMBER"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_properties_includes_options_inline(
        self, session_client, workspace, project, number_property, option_property
    ):
        url = self.properties_url(workspace.slug, project.id)
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        by_name = {prop["name"]: prop for prop in response.data}
        assert {option["name"] for option in by_name["Business Unit"]["options"]} == {"CONNECT", "MOBILITY"}
        assert by_name["Total Amount"]["options"] == []

    def test_update_property(self, session_client, workspace, project, number_property):
        url = self.properties_url(workspace.slug, project.id, number_property.id)
        response = session_client.patch(
            url,
            {"display_name": "Deal Size", "is_active": False},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        number_property.refresh_from_db()
        assert number_property.display_name == "Deal Size"
        assert number_property.is_active is False

    def test_property_type_is_immutable(self, session_client, workspace, project, number_property):
        url = self.properties_url(workspace.slug, project.id, number_property.id)
        response = session_client.patch(url, {"property_type": "TEXT"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        number_property.refresh_from_db()
        assert number_property.property_type == PropertyTypeChoices.NUMBER

    def test_delete_property(self, session_client, workspace, project, number_property):
        url = self.properties_url(workspace.slug, project.id, number_property.id)
        response = session_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueProperty.objects.filter(pk=number_property.id).exists()

    def test_member_cannot_create_property(self, session_client, workspace, project, create_user):
        # Downgrade both project and workspace role — workspace admins bypass project roles
        ProjectMember.objects.filter(project=project, member=create_user).update(role=15)
        WorkspaceMember.objects.filter(workspace=workspace, member=create_user).update(role=15)
        url = self.properties_url(workspace.slug, project.id)
        response = session_client.post(
            url,
            {"name": "Amount", "property_type": "NUMBER"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestIssuePropertyOptionApp(IssuePropertyAppUrls):
    def test_create_option(self, session_client, workspace, project, option_property):
        url = self.options_url(workspace.slug, project.id, option_property.id)
        response = session_client.post(url, {"name": "ENERGY"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert IssuePropertyOption.objects.filter(property=option_property).count() == 3

    def test_create_option_rejected_for_non_option_property(
        self, session_client, workspace, project, number_property
    ):
        url = self.options_url(workspace.slug, project.id, number_property.id)
        response = session_client.post(url, {"name": "ENERGY"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_options(self, session_client, workspace, project, option_property):
        url = self.options_url(workspace.slug, project.id, option_property.id)
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert {option["name"] for option in response.data} == {"CONNECT", "MOBILITY"}

    def test_update_option(self, session_client, workspace, project, option_property):
        option = option_property.options.get(name="CONNECT")
        url = self.options_url(workspace.slug, project.id, option_property.id, option.id)
        response = session_client.patch(url, {"name": "CONNECTIVITY", "sort_order": 1}, format="json")
        assert response.status_code == status.HTTP_200_OK
        option.refresh_from_db()
        assert option.name == "CONNECTIVITY"
        assert option.sort_order == 1

    def test_delete_option(self, session_client, workspace, project, option_property):
        option = option_property.options.get(name="CONNECT")
        url = self.options_url(workspace.slug, project.id, option_property.id, option.id)
        response = session_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssuePropertyOption.objects.filter(pk=option.id).exists()


@pytest.mark.contract
@pytest.mark.django_db
class TestIssuePropertyValuesApp(IssuePropertyAppUrls):
    def test_put_and_get_values(
        self, session_client, workspace, project, issue, number_property, option_property, multi_option_property
    ):
        option = option_property.options.get(name="CONNECT")
        multi_options = list(multi_option_property.options.filter(name__in=["EU", "US"]))
        url = self.values_url(workspace.slug, project.id, issue.id)
        response = session_client.put(
            url,
            {
                str(number_property.id): 500000,
                str(option_property.id): str(option.id),
                str(multi_option_property.id): [str(opt.id) for opt in multi_options],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["values"][str(number_property.id)] == 500000
        assert response.data["values"][str(option_property.id)] == str(option.id)
        assert set(response.data["values"][str(multi_option_property.id)]) == {str(opt.id) for opt in multi_options}
        assert response.data["display"][str(option_property.id)] == "CONNECT"
        assert set(response.data["display"][str(multi_option_property.id)]) == {"EU", "US"}

        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["values"][str(number_property.id)] == 500000

    def test_put_replaces_and_clears_values(self, session_client, workspace, project, issue, number_property):
        url = self.values_url(workspace.slug, project.id, issue.id)
        session_client.put(url, {str(number_property.id): 100}, format="json")
        response = session_client.put(url, {str(number_property.id): 250.5}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["values"][str(number_property.id)] == 250.5
        assert IssuePropertyValue.objects.filter(issue=issue).count() == 1

        response = session_client.put(url, {str(number_property.id): None}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["values"] == {}
        assert IssuePropertyValue.objects.filter(issue=issue).count() == 0

    def test_put_rejects_invalid_values(self, session_client, workspace, project, issue, number_property):
        url = self.values_url(workspace.slug, project.id, issue.id)
        response = session_client.put(url, {str(number_property.id): "not-a-number"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert str(number_property.id) in response.data["errors"]

    def test_put_rejects_unknown_property(self, session_client, workspace, project, issue):
        url = self.values_url(workspace.slug, project.id, issue.id)
        response = session_client.put(url, {"00000000-0000-0000-0000-000000000000": 1}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_guest_cannot_put_values(self, session_client, workspace, project, issue, number_property, create_user):
        ProjectMember.objects.filter(project=project, member=create_user).update(role=5)
        url = self.values_url(workspace.slug, project.id, issue.id)
        response = session_client.put(url, {str(number_property.id): 1}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
@pytest.mark.django_db
class TestBulkIssuePropertyValuesApp(IssuePropertyAppUrls):
    def _set_values(self, project, issue, number_property, multi_option_property, amount, option_names):
        IssuePropertyValue.objects.create(
            issue=issue,
            property=number_property,
            value_number=Decimal(amount),
            project=project,
            workspace=project.workspace,
        )
        for name in option_names:
            IssuePropertyValue.objects.create(
                issue=issue,
                property=multi_option_property,
                value_option=multi_option_property.options.get(name=name),
                project=project,
                workspace=project.workspace,
            )

    def test_bulk_values_shape(
        self,
        session_client,
        workspace,
        project,
        issue,
        second_issue,
        number_property,
        multi_option_property,
    ):
        self._set_values(project, issue, number_property, multi_option_property, 100, ["EU", "US"])
        self._set_values(project, second_issue, number_property, multi_option_property, 200, ["APAC"])

        url = self.bulk_values_url(workspace.slug, project.id)
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK

        # Shape: {issue_id: {property_id: value(s)}}
        assert set(response.data.keys()) == {str(issue.id), str(second_issue.id)}
        first = response.data[str(issue.id)]
        assert first[str(number_property.id)] == 100
        assert set(first[str(multi_option_property.id)]) == {
            str(multi_option_property.options.get(name="EU").id),
            str(multi_option_property.options.get(name="US").id),
        }
        second = response.data[str(second_issue.id)]
        assert second[str(number_property.id)] == 200
        assert second[str(multi_option_property.id)] == [str(multi_option_property.options.get(name="APAC").id)]

    def test_bulk_values_issue_ids_filter(
        self,
        session_client,
        workspace,
        project,
        issue,
        second_issue,
        number_property,
        multi_option_property,
    ):
        self._set_values(project, issue, number_property, multi_option_property, 100, [])
        self._set_values(project, second_issue, number_property, multi_option_property, 200, [])

        url = self.bulk_values_url(workspace.slug, project.id)
        response = session_client.get(f"{url}?issue_ids={issue.id}")
        assert response.status_code == status.HTTP_200_OK
        assert set(response.data.keys()) == {str(issue.id)}

    def test_bulk_values_invalid_issue_id(self, session_client, workspace, project):
        url = self.bulk_values_url(workspace.slug, project.id)
        response = session_client.get(f"{url}?issue_ids=not-a-uuid")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_bulk_values_empty_project(self, session_client, workspace, project):
        url = self.bulk_values_url(workspace.slug, project.id)
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {}


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueListPropertyFiltersApp(IssuePropertyAppUrls):
    def _issue_ids(self, response):
        return {str(result["id"]) for result in response.data["results"]}

    def test_filter_by_number_gt(
        self, session_client, workspace, project, issue, second_issue, number_property
    ):
        IssuePropertyValue.objects.create(
            issue=issue,
            property=number_property,
            value_number=Decimal(100),
            project=project,
            workspace=project.workspace,
        )
        IssuePropertyValue.objects.create(
            issue=second_issue,
            property=number_property,
            value_number=Decimal(900),
            project=project,
            workspace=project.workspace,
        )
        url = self.issues_url(workspace.slug, project.id)
        response = session_client.get(f"{url}?property__{number_property.id}__gt=500")
        assert response.status_code == status.HTTP_200_OK
        assert self._issue_ids(response) == {str(second_issue.id)}

    def test_filter_by_option(self, session_client, workspace, project, issue, second_issue, option_property):
        connect = option_property.options.get(name="CONNECT")
        mobility = option_property.options.get(name="MOBILITY")
        IssuePropertyValue.objects.create(
            issue=issue,
            property=option_property,
            value_option=connect,
            project=project,
            workspace=project.workspace,
        )
        IssuePropertyValue.objects.create(
            issue=second_issue,
            property=option_property,
            value_option=mobility,
            project=project,
            workspace=project.workspace,
        )
        url = self.issues_url(workspace.slug, project.id)
        response = session_client.get(f"{url}?property__{option_property.id}={connect.id}")
        assert response.status_code == status.HTTP_200_OK
        assert self._issue_ids(response) == {str(issue.id)}

    def test_filter_invalid_property_id(self, session_client, workspace, project, issue):
        url = self.issues_url(workspace.slug, project.id)
        response = session_client.get(f"{url}?property__not-a-uuid=1")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
@pytest.mark.django_db
class TestIssueListRichCustomPropertyFiltersApp(IssuePropertyAppUrls):
    """Rich (complex JSON) filters with `customproperty_<id>` condition keys."""

    def _issue_ids(self, response):
        return {str(result["id"]) for result in response.data["results"]}

    def test_rich_filter_by_option_in(self, session_client, workspace, project, issue, second_issue, option_property):
        import json

        connect = option_property.options.get(name="CONNECT")
        mobility = option_property.options.get(name="MOBILITY")
        IssuePropertyValue.objects.create(
            issue=issue,
            property=option_property,
            value_option=connect,
            project=project,
            workspace=project.workspace,
        )
        IssuePropertyValue.objects.create(
            issue=second_issue,
            property=option_property,
            value_option=mobility,
            project=project,
            workspace=project.workspace,
        )
        url = self.issues_url(workspace.slug, project.id)
        filters = json.dumps({f"customproperty_{option_property.id}__in": [str(connect.id)]})
        response = session_client.get(url, {"filters": filters})
        assert response.status_code == status.HTTP_200_OK
        assert self._issue_ids(response) == {str(issue.id)}

    def test_rich_filter_by_number_gt(self, session_client, workspace, project, issue, second_issue, number_property):
        import json

        IssuePropertyValue.objects.create(
            issue=issue,
            property=number_property,
            value_number=Decimal(100),
            project=project,
            workspace=project.workspace,
        )
        IssuePropertyValue.objects.create(
            issue=second_issue,
            property=number_property,
            value_number=Decimal(900),
            project=project,
            workspace=project.workspace,
        )
        url = self.issues_url(workspace.slug, project.id)
        filters = json.dumps({f"customproperty_{number_property.id}__gt": 500})
        response = session_client.get(url, {"filters": filters})
        assert response.status_code == status.HTTP_200_OK
        assert self._issue_ids(response) == {str(second_issue.id)}

    def test_rich_filter_unknown_property_rejected(self, session_client, workspace, project, issue):
        import json

        url = self.issues_url(workspace.slug, project.id)
        filters = json.dumps({"customproperty_00000000-0000-0000-0000-000000000000__in": ["x"]})
        response = session_client.get(url, {"filters": filters})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rich_filter_invalid_value_rejected(self, session_client, workspace, project, issue, number_property):
        import json

        url = self.issues_url(workspace.slug, project.id)
        filters = json.dumps({f"customproperty_{number_property.id}__gt": "not-a-number"})
        response = session_client.get(url, {"filters": filters})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
