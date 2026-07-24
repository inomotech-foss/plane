# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.db.models import IssueEmailMessage, IssueEmailThread, ServiceDeskConfig

from .base import BaseSerializer


class ServiceDeskConfigSerializer(BaseSerializer):
    class Meta:
        model = ServiceDeskConfig
        fields = [
            "id",
            "workspace",
            "project",
            "mailbox_email",
            "is_enabled",
            "notify_mode",
            "notify_user_ids",
            "last_synced_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace", "project", "last_synced_at", "created_at", "updated_at"]


class IssueEmailMessageSerializer(BaseSerializer):
    class Meta:
        model = IssueEmailMessage
        fields = [
            "id",
            "thread",
            "direction",
            "status",
            "from_email",
            "to_emails",
            "cc_emails",
            "subject",
            "body_text",
            "comment",
            "attachments",
            "error",
            "created_at",
        ]
        read_only_fields = fields


class IssueEmailThreadSerializer(BaseSerializer):
    messages = IssueEmailMessageSerializer(many=True, read_only=True)

    class Meta:
        model = IssueEmailThread
        fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "mailbox_email",
            "creator_email",
            "creator_name",
            "subject",
            "to_emails",
            "cc_emails",
            "messages",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "issue",
            "mailbox_email",
            "creator_email",
            "creator_name",
            "subject",
            "messages",
            "created_at",
            "updated_at",
        ]
