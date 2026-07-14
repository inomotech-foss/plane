# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.db import IntegrityError, transaction

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseViewSet, BaseAPIView
from plane.app.permissions import ROLE, allow_permission, ProjectEntityPermission
from plane.app.serializers import (
    IssuePropertyOptionSerializer,
    IssuePropertySerializer,
)
from plane.db.models import (
    Issue,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    Project,
    ProjectMember,
)
from plane.utils.issue_property import (
    OPTION_PROPERTY_TYPES,
    build_bulk_value_map,
    build_value_maps,
    validate_value_payload,
)


class IssuePropertyViewSet(BaseViewSet):
    """CRUD for work item custom properties of a project."""

    serializer_class = IssuePropertySerializer
    model = IssueProperty
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("project")
            .select_related("workspace")
            .prefetch_related("options")
            .distinct()
            .order_by("sort_order")
        )

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        options = request.data.get("options", [])
        property_type = request.data.get("property_type")

        if options and property_type not in OPTION_PROPERTY_TYPES:
            return Response(
                {"error": "Options can only be provided for OPTION or MULTI_OPTION properties"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if options and (
            not isinstance(options, list)
            or any(not isinstance(option, dict) or not option.get("name") for option in options)
        ):
            return Response(
                {"error": "options must be a list of objects with a name"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            serializer = IssuePropertySerializer(data=request.data)
            if serializer.is_valid():
                with transaction.atomic():
                    issue_property = serializer.save(project_id=project_id)
                    for option in options:
                        option_serializer = IssuePropertyOptionSerializer(data=option)
                        option_serializer.is_valid(raise_exception=True)
                        option_serializer.save(property=issue_property, project_id=project_id)

                issue_property = self.get_queryset().get(pk=issue_property.id)
                return Response(
                    IssuePropertySerializer(issue_property).data,
                    status=status.HTTP_201_CREATED,
                )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Work item property with the same name already exists in the project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        issue_property = IssueProperty.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        serializer = IssuePropertySerializer(issue_property, data=request.data, partial=True)
        if serializer.is_valid():
            try:
                serializer.save()
            except IntegrityError:
                return Response(
                    {"error": "Work item property with the same name already exists in the project"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            issue_property = self.get_queryset().get(pk=pk)
            return Response(IssuePropertySerializer(issue_property).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        issue_property = IssueProperty.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)
        issue_property.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyOptionViewSet(BaseViewSet):
    """CRUD for the options of an OPTION / MULTI_OPTION work item property."""

    serializer_class = IssuePropertyOptionSerializer
    model = IssuePropertyOption
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(property_id=self.kwargs.get("property_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("project")
            .select_related("workspace")
            .distinct()
            .order_by("sort_order")
        )

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, property_id):
        issue_property = IssueProperty.objects.get(workspace__slug=slug, project_id=project_id, pk=property_id)
        if issue_property.property_type not in OPTION_PROPERTY_TYPES:
            return Response(
                {"error": "Options can only be created for OPTION or MULTI_OPTION properties"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            serializer = IssuePropertyOptionSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(property=issue_property, project_id=project_id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Work item property option with the same name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, property_id, pk):
        option = IssuePropertyOption.objects.get(
            workspace__slug=slug, project_id=project_id, property_id=property_id, pk=pk
        )
        serializer = IssuePropertyOptionSerializer(option, data=request.data, partial=True)
        if serializer.is_valid():
            try:
                serializer.save()
            except IntegrityError:
                return Response(
                    {"error": "Work item property option with the same name already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, property_id, pk):
        option = IssuePropertyOption.objects.get(
            workspace__slug=slug, project_id=project_id, property_id=property_id, pk=pk
        )
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyValueEndpoint(BaseAPIView):
    """Property values of a single work item.

    GET returns `{"values": {property_id: value(s)}, "display": {...}}`,
    PUT bulk-replaces the values of the listed properties (same semantics as
    the public v1 endpoint).
    """

    model = IssuePropertyValue
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        return (
            IssuePropertyValue.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("property", "value_option", "value_user")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        # Ensure the work item exists in the project
        Issue.objects.get(pk=issue_id, project_id=project_id, workspace__slug=slug)
        values, display = build_value_maps(self.get_queryset())
        return Response({"values": values, "display": display}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        issue = Issue.objects.get(pk=issue_id, project_id=project_id, workspace__slug=slug)
        properties, new_rows, error = validate_value_payload(issue, slug, project_id, request.data)
        if error is not None:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Replace semantics: drop existing values of the listed properties
            IssuePropertyValue.objects.filter(issue=issue, property_id__in=properties.keys()).delete(soft=False)
            IssuePropertyValue.objects.bulk_create(new_rows)

        values, display = build_value_maps(self.get_queryset())
        return Response({"values": values, "display": display}, status=status.HTTP_200_OK)


class BulkIssuePropertyValueEndpoint(BaseAPIView):
    """Property values of all work items of a project in a single call.

    Returns `{issue_id: {property_id: value(s)}}` so list / kanban /
    spreadsheet views can render custom fields without one request per work
    item. Supports narrowing with `?issue_ids=<comma separated ids>`.
    """

    model = IssuePropertyValue
    permission_classes = [ProjectEntityPermission]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        queryset = (
            IssuePropertyValue.objects.filter(workspace__slug=slug)
            .filter(project_id=project_id)
            .filter(
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(issue__archived_at__isnull=True, issue__is_draft=False)
            .select_related("property", "value_option", "value_user")
        )

        issue_ids_param = request.GET.get("issue_ids")
        if issue_ids_param:
            issue_ids = []
            for raw_id in issue_ids_param.split(","):
                raw_id = raw_id.strip()
                if not raw_id:
                    continue
                try:
                    issue_ids.append(str(uuid.UUID(raw_id)))
                except ValueError:
                    return Response(
                        {"error": f"Invalid work item id '{raw_id}'"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            queryset = queryset.filter(issue_id__in=issue_ids)

        # Guests without full project visibility only see their own work items
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            queryset = queryset.filter(issue__created_by=request.user)

        return Response(build_bulk_value_map(queryset), status=status.HTTP_200_OK)
