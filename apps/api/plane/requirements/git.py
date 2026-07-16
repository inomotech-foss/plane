# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Stateless git operations for the requirements repositories.

Every operation clones into a fresh temp dir and cleans up afterwards, so no
persistent working tree is assumed (works across multiple worker replicas).
GitPython and PyGithub are imported lazily so importing this module stays cheap.
"""

from __future__ import annotations

import contextlib
import re
import shutil
import tempfile
from urllib.parse import urlparse, urlunparse


def _authed_url(repo_url: str, token: str | None) -> str:
    """Embed a token into an https clone URL (GitHub-style x-access-token)."""
    if not token:
        return repo_url
    parsed = urlparse(repo_url)
    if parsed.scheme != "https":
        return repo_url
    return urlunparse(parsed._replace(netloc=f"x-access-token:{token}@{parsed.netloc}"))


def repo_slug(repo_url: str) -> str:
    """Extract owner/repo from a GitHub URL."""
    path = urlparse(repo_url).path.strip("/")
    return re.sub(r"\.git$", "", path)


@contextlib.contextmanager
def checkout(repo_url: str, branch: str, token: str | None, depth: int | None = 1):
    """Clone `branch` into a temp dir; yield (dir, repo); always clean up.

    depth=1 (default) is a fast shallow clone for read/edit. Pass depth=None for
    a full clone when commit history is needed.
    """
    from git import Repo

    tmp = tempfile.mkdtemp(prefix="plane-req-")
    try:
        kwargs = {"branch": branch}
        if depth:
            kwargs["depth"] = depth
        repo = Repo.clone_from(_authed_url(repo_url, token), tmp, **kwargs)
        yield tmp, repo
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def commits_for_path(repo, rev: str, file_path: str, limit: int = 20) -> list[dict]:
    """Recent commits touching `file_path` (newest first), from an open repo."""
    commits = []
    for commit in repo.iter_commits(rev=rev, paths=file_path, max_count=limit):
        message = (commit.message or "").strip().splitlines()
        commits.append(
            {
                "sha": commit.hexsha[:8],
                "full_sha": commit.hexsha,
                "author": commit.author.name,
                "email": commit.author.email,
                "date": commit.committed_datetime.isoformat(),
                "message": message[0] if message else "",
            }
        )
    return commits


def file_history(repo_url: str, branch: str, token: str | None, file_path: str, limit: int = 20) -> list[dict]:
    with checkout(repo_url, branch, token, depth=None) as (_repo_dir, repo):
        return commits_for_path(repo, branch, file_path, limit)


def commit_and_push(
    repo,
    branch: str,
    message: str,
    author_name: str,
    author_email: str,
) -> bool:
    """Create/switch to `branch`, commit all changes, push. False if nothing changed."""
    from git import Actor

    repo.git.checkout("-B", branch)
    repo.git.add(all=True)
    if not repo.is_dirty(untracked_files=True):
        return False
    actor = Actor(author_name, author_email)
    repo.index.commit(message, author=actor, committer=actor)
    repo.git.push("--set-upstream", "origin", branch)
    return True


def open_pull_request(
    repo_url: str,
    token: str,
    head: str,
    base: str,
    title: str,
    body: str,
) -> str:
    """Open a PR head->base and return its URL."""
    from github import Github

    gh = Github(token)
    grepo = gh.get_repo(repo_slug(repo_url))
    pr = grepo.create_pull(title=title, body=body, head=head, base=base)
    return pr.html_url
