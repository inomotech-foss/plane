# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Web URL builders for the supported git hosts.

Hosts differ only in their commit and pull-request path shapes. Add a new host
by extending the two maps below.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

_COMMIT_PATH = {
    "github": "/commit/{sha}",
    "gitlab": "/-/commit/{sha}",
    "gitea": "/commit/{sha}",
    "forgejo": "/commit/{sha}",
    "codeberg": "/commit/{sha}",
}

_PR_PATH = {
    "github": "/pull/{number}",
    "gitlab": "/-/merge_requests/{number}",
    "gitea": "/pulls/{number}",
    "forgejo": "/pulls/{number}",
    "codeberg": "/pulls/{number}",
}

_COMPARE_PATH = {
    "github": "/compare/{base}...{head}?expand=1",
    "gitlab": "/-/merge_requests/new?merge_request%5Bsource_branch%5D={head}",
    "gitea": "/compare/{base}...{head}",
    "forgejo": "/compare/{base}...{head}",
    "codeberg": "/compare/{base}...{head}",
}


def _base(repo_url: str) -> str:
    return re.sub(r"\.git$", "", repo_url).rstrip("/")


def resolve_provider(repo_url: str, provider: str | None) -> str:
    if provider and provider in _COMMIT_PATH:
        return provider
    host = urlparse(repo_url).netloc.lower()
    if "gitlab" in host:
        return "gitlab"
    if "codeberg" in host:
        return "codeberg"
    return "github"


def commit_url(repo_url: str, sha: str, provider: str | None = None) -> str:
    p = resolve_provider(repo_url, provider)
    return _base(repo_url) + _COMMIT_PATH[p].format(sha=sha)


def pull_request_url(repo_url: str, number: str | int, provider: str | None = None) -> str:
    p = resolve_provider(repo_url, provider)
    return _base(repo_url) + _PR_PATH[p].format(number=number)


def compare_url(repo_url: str, base: str, head: str, provider: str | None = None) -> str:
    p = resolve_provider(repo_url, provider)
    return _base(repo_url) + _COMPARE_PATH[p].format(base=base, head=head)
