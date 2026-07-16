# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from plane.db.models import Requirement, RequirementDocument, RequirementRepository
from plane.requirements import adapter, git
from plane.utils.exception_logger import log_exception


@shared_task
def sync_requirements(repository_id):
    """Reconcile the requirement projection and per-document git history from the repo."""
    repository = RequirementRepository.objects.filter(id=repository_id).first()
    if repository is None:
        return

    repository.last_sync_status = "syncing"
    repository.save(update_fields=["last_sync_status"])

    try:
        with git.checkout(
            repository.repo_url, repository.default_branch, repository.access_token, depth=None
        ) as (repo_dir, repo):
            nodes = adapter.read_requirements(repo_dir)
            doc_commits = {
                file_path: git.commits_for_path(repo, repository.default_branch, file_path)
                for file_path in {n.file_path for n in nodes}
            }

        _project_nodes(repository.project, nodes)
        _project_documents(repository.project, nodes, doc_commits)

        repository.last_sync_status = "success"
        repository.last_sync_error = None
        repository.last_synced_at = timezone.now()
        repository.save(update_fields=["last_sync_status", "last_sync_error", "last_synced_at"])
    except Exception as e:
        repository.last_sync_status = "error"
        repository.last_sync_error = str(e)
        repository.save(update_fields=["last_sync_status", "last_sync_error"])
        log_exception(e)


def _project_nodes(project, nodes):
    with transaction.atomic():
        seen_ids = []
        for node in nodes:
            obj, _ = Requirement.objects.update_or_create(
                project=project,
                file_path=node.file_path,
                uid=node.uid,
                defaults={
                    "node_type": node.node_type,
                    "document_title": node.document_title,
                    "title": node.title,
                    "statement": node.statement,
                    "field_values": node.field_values,
                    "relations": node.relations,
                    "sort_order": node.sort_order,
                    "external_source": "strictdoc",
                    "external_id": node.uid,
                },
            )
            seen_ids.append(obj.id)
        Requirement.all_objects.filter(project=project).exclude(id__in=seen_ids).delete()


def _project_documents(project, nodes, doc_commits):
    titles = {}
    for node in nodes:
        titles.setdefault(node.file_path, node.document_title)
    with transaction.atomic():
        seen_ids = []
        for file_path, commits in doc_commits.items():
            obj, _ = RequirementDocument.objects.update_or_create(
                project=project,
                file_path=file_path,
                defaults={"title": titles.get(file_path), "commits": commits},
            )
            seen_ids.append(obj.id)
        RequirementDocument.all_objects.filter(project=project).exclude(id__in=seen_ids).delete()
