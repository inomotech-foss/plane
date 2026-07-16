# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""strictdoc <-> Plane adapter.

Isolated bridge over strictdoc's library API. Two jobs:
  - read_requirements(repo_dir): parse a checkout into flat projection nodes.
  - render_document(repo_dir, ...): edit fields of requirements and return the
    .sdoc text with a minimal diff (not written to disk here).

strictdoc is imported lazily inside the functions so importing this module does
not pull the (heavy) dependency at Django startup; only the sync worker touches
it.

MID handling: the requirements repos declare ENABLE_MID: True but persist no
MID: lines and key everything on UID. strictdoc auto-generates a random MID per
node on read, which would churn every write. We strip those auto-generated MID
lines on write so the round-trip stays byte-clean and the files keep their
authored form.
"""

from __future__ import annotations

import dataclasses
import os
import re
import shutil
import tempfile

# MID: <32 hex> lines that strictdoc injects for un-persisted nodes.
_MID_LINE = re.compile(r"^MID: [0-9a-f]{32}\n", re.MULTILINE)

_DENORMALIZED = {"UID", "TITLE", "STATEMENT"}


@dataclasses.dataclass(frozen=True, kw_only=True, slots=True)
class RequirementNode:
    uid: str
    node_type: str
    file_path: str
    title: str | None
    statement: str | None
    field_values: dict
    relations: list
    sort_order: int
    document_title: str | None


def _load(repo_dir: str):
    from strictdoc.core.project_config import ProjectConfigLoader
    from strictdoc.core.traceability_index_builder import TraceabilityIndexBuilder
    from strictdoc.helpers.parallelizer import Parallelizer

    cfg = ProjectConfigLoader.load_from_path_or_get_default(path_to_config=repo_dir)
    cfg.input_paths = [repo_dir]
    # strictdoc writes a parse cache to output/_cache relative to the process
    # CWD by default. Redirect it to a throwaway dir so we never pollute the
    # working tree; the cache is only used while the index is being built.
    cache_dir = tempfile.mkdtemp(prefix="plane-sdoc-cache-")
    cfg.dir_for_sdoc_cache = os.path.join(cache_dir, "_cache")
    par = Parallelizer.create(False)
    try:
        index = TraceabilityIndexBuilder.create(
            project_config=cfg, parallelizer=par, skip_source_files=True
        )
    finally:
        par.shutdown()
        shutil.rmtree(cache_dir, ignore_errors=True)
    return cfg, index


def _rel_path(doc) -> str:
    return doc.meta.input_doc_rel_path.relative_path


def _field_value(field) -> str:
    if not field.parts:
        return ""
    return "".join(p if isinstance(p, str) else str(p) for p in field.parts)


def read_requirements(repo_dir: str) -> list[RequirementNode]:
    """Parse every .sdoc under repo_dir into flat requirement projection nodes."""
    _cfg, index = _load(repo_dir)
    out: list[RequirementNode] = []
    for doc in index.document_tree.document_list:
        rel = _rel_path(doc)
        order = 0
        for node in doc.iterate_nodes():
            if node.node_type != "REQUIREMENT":
                continue
            fields = {f.field_name: _field_value(f) for f in node.fields}
            out.append(
                RequirementNode(
                    uid=fields.get("UID", ""),
                    node_type=node.node_type,
                    file_path=rel,
                    title=fields.get("TITLE"),
                    statement=fields.get("STATEMENT"),
                    field_values={
                        k: v for k, v in fields.items() if k not in _DENORMALIZED
                    },
                    relations=[
                        {"type": r.ref_type, "value": r.ref_uid} for r in node.relations
                    ],
                    sort_order=order,
                    document_title=doc.title,
                )
            )
            order += 1
    return out


def render_document(
    repo_dir: str, file_path: str, edits: dict[str, dict[str, str]]
) -> str | None:
    """Return the .sdoc text for file_path with edits applied.

    edits maps {uid: {field_name: new_value}}. Only existing fields are updated.
    Returns None if the document is not found. Does not write to disk.
    """
    from strictdoc.backend.sdoc.writer import SDWriter

    cfg, index = _load(repo_dir)
    target = next(
        (d for d in index.document_tree.document_list if _rel_path(d) == file_path),
        None,
    )
    if target is None:
        return None

    for node in target.iterate_nodes():
        if node.node_type != "REQUIREMENT":
            continue
        uid = next(
            (_field_value(f) for f in node.fields if f.field_name == "UID"), None
        )
        if uid not in edits:
            continue
        for field in node.fields:
            if field.field_name in edits[uid] and field.parts:
                field.parts[0] = edits[uid][field.field_name]

    text = SDWriter(cfg).write(target)
    return _MID_LINE.sub("", text)
