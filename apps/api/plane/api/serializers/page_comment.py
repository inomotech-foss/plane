# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import PageComment
from plane.utils.content_validator import validate_html_content


class PageCommentSerializer(BaseSerializer):
    class Meta:
        model = PageComment
        fields = [
            "id",
            "page",
            "parent",
            "anchor_id",
            "comment_html",
            "comment_json",
            "comment_stripped",
            "actor",
            "is_resolved",
            "resolved_at",
            "resolved_by",
            "edited_at",
            "external_id",
            "external_source",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "workspace",
            "page",
            "actor",
            "comment_stripped",
            "is_resolved",
            "resolved_at",
            "resolved_by",
            "edited_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate(self, data):
        # Validate comment content for security
        if "comment_html" in data and data["comment_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(data["comment_html"])
            if not is_valid:
                raise serializers.ValidationError({"error": "html content is not valid"})
            if sanitized_html is not None:
                data["comment_html"] = sanitized_html
        return data
