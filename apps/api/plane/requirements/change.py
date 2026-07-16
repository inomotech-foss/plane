# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Write path: turn an in-app edit into a git change set (branch + PR)."""

from __future__ import annotations

from pathlib import Path

from plane.requirements import adapter, git, hosts


def propose_change(
    repository,
    requirement,
    edits: dict[str, str],
    branch: str,
    message: str,
    pr_title: str,
    pr_body: str,
    author_name: str,
    author_email: str,
    co_author: dict | None = None,
    relations: list[dict] | None = None,
) -> dict:
    """Apply edits, commit as the author (with optional co-author trailer), push,
    and try to open a PR.

    Returns {committed, branch, compare_url, pull_request_url, pr_error}. If the
    push succeeds but PR creation fails, committed is True and pull_request_url is
    None (compare_url lets the user open the PR manually).
    """
    if co_author and co_author.get("email"):
        trailer = f"Co-authored-by: {co_author.get('name') or co_author['email']} <{co_author['email']}>"
        message = f"{message}\n\n{trailer}"

    with git.checkout(repository.repo_url, repository.default_branch, repository.access_token) as (repo_dir, repo):
        text = adapter.render_document(
            repo_dir,
            requirement.file_path,
            {requirement.uid: edits},
            relations={requirement.uid: relations} if relations is not None else None,
        )
        if text is None:
            raise ValueError("Requirement document not found in repository")
        Path(repo_dir, requirement.file_path).write_text(text)
        changed = git.commit_and_push(repo, branch, message, author_name, author_email)

    if not changed:
        return {"committed": False, "branch": branch, "compare_url": None, "pull_request_url": None, "pr_error": None}

    result = {
        "committed": True,
        "branch": branch,
        "compare_url": hosts.compare_url(repository.repo_url, repository.default_branch, branch, repository.provider),
        "pull_request_url": None,
        "pr_error": None,
    }
    try:
        result["pull_request_url"] = git.open_pull_request(
            repository.repo_url,
            repository.access_token,
            head=branch,
            base=repository.default_branch,
            title=pr_title,
            body=pr_body,
        )
    except Exception as e:
        result["pr_error"] = str(e)[:200]
    return result
