# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueProperty, IssuePropertyOption


class IssuePropertyOptionSerializer(BaseSerializer):
    """
    Serializer for issue property options.

    Options are the selectable values for OPTION and MULTI_OPTION issue
    properties. Uniqueness of the option name is enforced per property.
    """

    class Meta:
        model = IssuePropertyOption
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "property",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]


class IssuePropertySerializer(BaseSerializer):
    """
    Serializer for issue properties (work item custom fields).

    Includes the nested read-only list of options. On create, options for
    OPTION / MULTI_OPTION properties can be supplied inline through the
    `options` field handled by the view.
    """

    options = IssuePropertyOptionSerializer(many=True, read_only=True)

    def validate(self, data):
        property_type = data.get("property_type")
        if self.instance is None and not property_type:
            raise serializers.ValidationError("property_type is required")
        if self.instance is not None and property_type and property_type != self.instance.property_type:
            raise serializers.ValidationError("property_type cannot be changed once created")
        return data

    def create(self, validated_data):
        if not validated_data.get("display_name"):
            validated_data["display_name"] = validated_data.get("name")
        return super().create(validated_data)

    class Meta:
        model = IssueProperty
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        extra_kwargs = {"display_name": {"required": False}}
