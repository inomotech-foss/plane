# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime, timezone as dt_timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    RequirementSerializer,
    RequirementRepositorySerializer,
)
from plane.bgtasks.requirement_sync_task import sync_requirements
from plane.db.models import Requirement, RequirementRepository
from plane.requirements import git
from plane.requirements.change import propose_change

from ..base import BaseAPIView, BaseViewSet


class RequirementRepositoryEndpoint(BaseAPIView):
    """Manage the per-project git repository config and trigger sync."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        repository = RequirementRepository.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).first()
        if repository is None:
            return Response({}, status=status.HTTP_200_OK)
        return Response(
            RequirementRepositorySerializer(repository).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        """Create or update the repository config (one per project)."""
        repository = RequirementRepository.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).first()
        serializer = RequirementRepositorySerializer(
            repository, data=request.data, partial=repository is not None
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(project_id=project_id)
        return Response(
            RequirementRepositorySerializer(serializer.instance).data,
            status=status.HTTP_200_OK,
        )


class RequirementRepositorySyncEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        repository = RequirementRepository.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).first()
        if repository is None:
            return Response(
                {"error": "No requirements repository is configured for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sync_requirements.delay(str(repository.id))
        return Response(
            {"message": "Sync started"}, status=status.HTTP_200_OK
        )


class RequirementViewSet(BaseViewSet):
    """Read-only projection of the git-backed strictdoc requirements.

    Requirements are authored in git. Browsing reads the projected rows; edits
    go through `propose_change`, which writes back to git as a pull request.
    """

    model = Requirement
    serializer_class = RequirementSerializer

    def get_queryset(self):
        return Requirement.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        requirements = self.get_queryset()
        return Response(
            RequirementSerializer(requirements, many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        requirement = self.get_queryset().filter(pk=pk).first()
        if requirement is None:
            return Response(
                {"error": "Requirement not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            RequirementSerializer(requirement).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def history(self, request, slug, project_id, pk):
        """Return the git commit history for this requirement's document."""
        requirement = self.get_queryset().filter(pk=pk).first()
        if requirement is None:
            return Response(
                {"error": "Requirement not found"}, status=status.HTTP_404_NOT_FOUND
            )
        repository = RequirementRepository.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).first()
        if repository is None:
            return Response(
                {"error": "No requirements repository is configured for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            commits = git.file_history(
                repository.repo_url,
                repository.default_branch,
                repository.access_token,
                requirement.file_path,
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(commits, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def propose_change(self, request, slug, project_id, pk):
        """Apply field edits to this requirement and open a git pull request."""
        requirement = self.get_queryset().filter(pk=pk).first()
        if requirement is None:
            return Response(
                {"error": "Requirement not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        repository = RequirementRepository.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).first()
        if repository is None:
            return Response(
                {"error": "No requirements repository is configured for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        edits = request.data.get("edits") or {}
        if not isinstance(edits, dict) or not edits:
            return Response(
                {"error": "No edits provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stamp = datetime.now(dt_timezone.utc).strftime("%Y%m%d%H%M%S")
        branch = request.data.get("branch") or f"plane/{requirement.uid.lower()}-{stamp}"
        message = request.data.get("message") or f"Update {requirement.uid}"
        pr_title = request.data.get("title") or message
        pr_body = request.data.get("body") or f"Change to {requirement.uid} proposed from Plane."

        try:
            pr_url = propose_change(
                repository=repository,
                requirement=requirement,
                edits=edits,
                branch=branch,
                message=message,
                pr_title=pr_title,
                pr_body=pr_body,
                author_name=request.user.display_name or request.user.email,
                author_email=request.user.email,
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_400_BAD_REQUEST
            )

        if pr_url is None:
            return Response(
                {"error": "The edit produced no change"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"pull_request_url": pr_url}, status=status.HTTP_200_OK)
