# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


class ServiceDeskNotifyMode(models.TextChoices):
    NONE = "NONE"
    ADMINS = "ADMINS"
    MEMBERS = "MEMBERS"
    CUSTOM = "CUSTOM"


class ServiceDeskConfig(ProjectBaseModel):
    """Per-project service desk mailbox configuration.

    The MS365 application credentials (tenant, client id, client secret) are
    instance-level configuration; this model only holds the mailbox that feeds
    a project's intake and whether polling is enabled for it.
    """

    mailbox_email = models.CharField(max_length=255)
    is_enabled = models.BooleanField(default=False)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    # Who gets notified (and auto-subscribed) when a new ticket arrives.
    notify_mode = models.CharField(
        max_length=20,
        choices=ServiceDeskNotifyMode.choices,
        default=ServiceDeskNotifyMode.NONE,
    )
    # User ids; only used when notify_mode is CUSTOM.
    notify_user_ids = models.JSONField(default=list)
    # Graph change-notification (push) subscription state; null when running polling-only.
    graph_subscription_id = models.CharField(max_length=255, null=True, blank=True)
    graph_subscription_expires_at = models.DateTimeField(null=True, blank=True)
    webhook_client_state = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ["project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(deleted_at__isnull=True),
                name="service_desk_config_unique_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Service Desk Config"
        verbose_name_plural = "Service Desk Configs"
        db_table = "service_desk_configs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.mailbox_email} <{self.project.name}>"


class EmailDirection(models.TextChoices):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"


class EmailDeliveryStatus(models.TextChoices):
    RECEIVED = "RECEIVED"
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class IssueEmailThread(ProjectBaseModel):
    """Links an issue created from an inbound email to its mail conversation."""

    issue = models.OneToOneField("db.Issue", related_name="email_thread", on_delete=models.CASCADE)
    mailbox_email = models.CharField(max_length=255)
    conversation_id = models.CharField(max_length=512, db_index=True)
    creator_email = models.CharField(max_length=255)
    creator_name = models.CharField(max_length=255, blank=True)
    subject = models.TextField(blank=True)
    # Additional recipients beyond the creator; the creator always receives replies.
    to_emails = models.JSONField(default=list)
    cc_emails = models.JSONField(default=list)
    last_inbound_graph_message_id = models.CharField(max_length=512, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Email Thread"
        verbose_name_plural = "Issue Email Threads"
        db_table = "issue_email_threads"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.creator_email} <{self.issue_id}>"


class IssueEmailMessage(ProjectBaseModel):
    thread = models.ForeignKey("db.IssueEmailThread", related_name="messages", on_delete=models.CASCADE)
    direction = models.CharField(max_length=20, choices=EmailDirection.choices)
    status = models.CharField(
        max_length=20,
        choices=EmailDeliveryStatus.choices,
        default=EmailDeliveryStatus.RECEIVED,
    )
    graph_message_id = models.CharField(max_length=512, null=True, blank=True, db_index=True)
    internet_message_id = models.CharField(max_length=998, null=True, blank=True)
    from_email = models.CharField(max_length=255, blank=True)
    to_emails = models.JSONField(default=list)
    cc_emails = models.JSONField(default=list)
    subject = models.TextField(blank=True)
    body_text = models.TextField(blank=True)
    body_html = models.TextField(blank=True)
    comment = models.ForeignKey(
        "db.IssueComment",
        related_name="email_messages",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    # [{name, content_type, size, asset_id, skipped?}] — inbound ingests,
    # outbound files to send with the reply.
    attachments = models.JSONField(default=list)
    error = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Issue Email Message"
        verbose_name_plural = "Issue Email Messages"
        db_table = "issue_email_messages"
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.direction} <{self.thread_id}>"
