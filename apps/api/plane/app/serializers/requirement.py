# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import Requirement, RequirementRepository


class RequirementRepositorySerializer(BaseSerializer):
    # Never expose the token; accept it only on write.
    access_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = RequirementRepository
        fields = [
            "id",
            "project",
            "workspace",
            "provider",
            "repo_url",
            "default_branch",
            "access_token",
            "co_author_name",
            "co_author_email",
            "last_synced_at",
            "last_sync_status",
            "last_sync_error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "project",
            "workspace",
            "last_synced_at",
            "last_sync_status",
            "last_sync_error",
            "created_at",
            "updated_at",
        ]


class RequirementSerializer(BaseSerializer):
    class Meta:
        model = Requirement
        fields = [
            "id",
            "uid",
            "node_type",
            "file_path",
            "document_title",
            "title",
            "statement",
            "field_values",
            "relations",
            "sort_order",
            "project",
            "workspace",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
        ]
        # The projection is rebuilt from git; the app never writes it.
        read_only_fields = fields
