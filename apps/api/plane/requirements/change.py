# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Write path: turn an in-app edit into a git change set (branch + PR).

Every save clones the repo fresh, applies the edit to the .sdoc via the adapter,
commits to a new branch, pushes, and opens a pull request. Review and merge
happen on the git host for now; the in-app review UI comes later.
"""

from __future__ import annotations

from pathlib import Path

from plane.requirements import adapter, git


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
) -> str | None:
    """Apply `edits` to `requirement`, commit to `branch`, push, open a PR.

    Returns the PR URL, or None if the edit produced no change.
    """
    with git.checkout(
        repository.repo_url, repository.default_branch, repository.access_token
    ) as (repo_dir, repo):
        text = adapter.render_document(
            repo_dir, requirement.file_path, {requirement.uid: edits}
        )
        if text is None:
            raise ValueError("Requirement document not found in repository")
        Path(repo_dir, requirement.file_path).write_text(text)

        changed = git.commit_and_push(
            repo, branch, message, author_name, author_email
        )
        if not changed:
            return None

    return git.open_pull_request(
        repository.repo_url,
        repository.access_token,
        head=branch,
        base=repository.default_branch,
        title=pr_title,
        body=pr_body,
    )
