# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .base import BaseModel
from .project import Project, ProjectBaseModel


class RequirementRepository(BaseModel):
    """Per-project git repository that backs the requirements projection.

    Git is canonical; the sync worker clones this repo, parses the .sdoc files,
    and rebuilds the Requirement rows from it. One repository per project.
    """

    SYNC_STATUS_CHOICES = (
        ("pending", "Pending"),
        ("syncing", "Syncing"),
        ("success", "Success"),
        ("error", "Error"),
    )

    project = models.OneToOneField(
        Project, on_delete=models.CASCADE, related_name="requirement_repository"
    )
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_requirement_repositories",
    )
    provider = models.CharField(max_length=64, default="github")
    repo_url = models.CharField(max_length=1024)
    default_branch = models.CharField(max_length=255, default="main")
    # Optional co-author trailer added to every commit (e.g. a service account).
    co_author_name = models.CharField(max_length=255, blank=True, null=True)
    co_author_email = models.CharField(max_length=255, blank=True, null=True)
    # Access token for clone/push/PR. Write-only in the serializer; never returned.
    access_token = models.TextField(blank=True, null=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_sync_status = models.CharField(
        max_length=32, default="pending", choices=SYNC_STATUS_CHOICES
    )
    last_sync_error = models.TextField(blank=True, null=True)

    def save(self, *args, **kwargs):
        self.workspace = self.project.workspace
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = "Requirement Repository"
        verbose_name_plural = "Requirement Repositories"
        db_table = "requirement_repositories"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.repo_url} <{self.project.identifier}>"


class Requirement(ProjectBaseModel):
    """Projection of a strictdoc node from the git-backed requirements repo.

    Git is canonical: this table is rebuilt from the .sdoc files by the sync
    worker and is read-only from the app. Rows are keyed on
    (project, file_path, uid), which matches the repo's own convention of using
    the strictdoc UID as the stable identity.
    """

    uid = models.CharField(max_length=255, db_index=True)
    node_type = models.CharField(max_length=64, default="REQUIREMENT")
    file_path = models.CharField(max_length=1024)
    document_title = models.TextField(blank=True, null=True)
    title = models.TextField(blank=True, null=True)
    statement = models.TextField(blank=True, null=True)
    # Full grammar field map, e.g. {"STATUS": "DRAFT", "PRIORITY": "MUST", ...}.
    # Kept generic because grammars are project-defined and vary.
    field_values = models.JSONField(default=dict)
    # [{"type": "Parent", "value": "STK-OBD-001"}, ...]
    relations = models.JSONField(default=list)
    # Position within its document, for stable display ordering.
    sort_order = models.PositiveIntegerField(default=0)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        unique_together = ["project", "file_path", "uid", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "file_path", "uid"],
                condition=models.Q(deleted_at__isnull=True),
                name="requirement_unique_project_file_uid_when_deleted_at_null",
            )
        ]
        verbose_name = "Requirement"
        verbose_name_plural = "Requirements"
        db_table = "requirements"
        ordering = ("file_path", "sort_order")

    def __str__(self):
        return f"{self.uid} <{self.project.identifier}>"


class RequirementDocument(ProjectBaseModel):
    """Per-file cache of the strictdoc document: title and recent git commits."""

    file_path = models.CharField(max_length=1024)
    title = models.TextField(blank=True, null=True)
    commits = models.JSONField(default=list)

    class Meta:
        unique_together = ["project", "file_path", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "file_path"],
                condition=models.Q(deleted_at__isnull=True),
                name="requirement_document_unique_project_file_when_deleted_at_null",
            )
        ]
        verbose_name = "Requirement Document"
        verbose_name_plural = "Requirement Documents"
        db_table = "requirement_documents"
        ordering = ("file_path",)

    def __str__(self):
        return f"{self.file_path} <{self.project.identifier}>"
