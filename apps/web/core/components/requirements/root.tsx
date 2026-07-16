/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { ChevronDown, ChevronRight, GitBranch, Pencil, Settings, X } from "lucide-react";
// plane imports
import { Badge } from "@plane/propel/badge";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TBadgeVariant } from "@plane/propel/badge";
import type { TRequirement, TRequirementCommit, TRequirementRepository } from "@plane/types";
import { ControlLink, Row } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { requirementService } from "@/services/requirement.service";

const STATUS_OPTIONS = ["DRAFT", "IN_REVIEW", "APPROVED", "OBSOLETE"];
const PRIORITY_OPTIONS = ["MUST", "SHOULD", "MAY"];
const PRIORITY_BADGE: Record<string, TBadgeVariant> = { MUST: "danger", SHOULD: "warning", MAY: "neutral" };

type Props = { workspaceSlug: string; projectId: string };

const errorMessage = (error: unknown, fallback: string): string => (error as { error?: string })?.error || fallback;

// Merge a set of field edits (keyed by strictdoc field name) into a row for optimistic UI.
const applyEdits = (row: TRequirement, edits: Record<string, string>): TRequirement => {
  const next: TRequirement = { ...row, field_values: { ...row.field_values } };
  for (const [key, value] of Object.entries(edits)) {
    if (key === "TITLE") next.title = value;
    else if (key === "STATEMENT") next.statement = value;
    else next.field_values[key] = value;
  }
  return next;
};

export const RequirementsRoot = ({ workspaceSlug, projectId }: Props) => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const selectedUid = searchParams.get("requirementId");

  const [loading, setLoading] = useState(true);
  const [repository, setRepository] = useState<TRequirementRepository | null>(null);
  const [requirements, setRequirements] = useState<TRequirement[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const repo = await requirementService.getRepository(workspaceSlug, projectId);
      const hasRepo = !!repo && "repo_url" in repo && !!repo.repo_url;
      setRepository(hasRepo ? (repo as TRequirementRepository) : null);
      if (hasRepo) setRequirements(await requirementService.list(workspaceSlug, projectId));
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: errorMessage(error, "Failed to load requirements.") });
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const setSelected = (uid: string | null) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (uid) params.set("requirementId", uid);
        else params.delete("requirementId");
        return params;
      },
      { replace: true }
    );
  };

  const proposeEdits = async (requirement: TRequirement, edits: Record<string, string>, message: string) => {
    setRequirements((prev) => prev.map((r) => (r.id === requirement.id ? applyEdits(r, edits) : r)));
    try {
      const res = await requirementService.proposeChange(workspaceSlug, projectId, requirement.id, { edits, message });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Change proposed", message: `Pull request opened: ${res.pull_request_url}` });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: errorMessage(error, "Could not propose the change.") });
      load();
    }
  };

  const requirementsByUid = useMemo(() => {
    const map = new Map<string, TRequirement>();
    for (const r of requirements) map.set(r.uid, r);
    return map;
  }, [requirements]);

  const filtered = useMemo(() => {
    if (!query) return requirements;
    return requirements.filter(
      (r) =>
        r.uid.toLowerCase().includes(query) ||
        (r.title || "").toLowerCase().includes(query) ||
        (r.statement || "").toLowerCase().includes(query)
    );
  }, [requirements, query]);

  const groups = useMemo(() => {
    const map = new Map<string, { title: string; items: TRequirement[] }>();
    for (const r of filtered) {
      const g = map.get(r.file_path) ?? { title: r.document_title || r.file_path, items: [] };
      g.items.push(r);
      map.set(r.file_path, g);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const selected = selectedUid ? (requirementsByUid.get(selectedUid) ?? null) : null;

  if (loading) return <div className="p-6 text-sm text-tertiary">Loading requirements...</div>;

  if (!repository) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
        <GitBranch className="h-8 w-8 text-tertiary" />
        <div>
          <h3 className="text-base font-medium text-primary">No requirements repository connected</h3>
          <p className="mt-1 text-sm text-tertiary">
            Connect a git repository of strictdoc files in the project settings to browse requirements here.
          </p>
        </div>
        <Button
          variant="primary"
          prependIcon={<Settings className="h-3.5 w-3.5" />}
          onClick={() => window.location.assign(`/${workspaceSlug}/settings/projects/${projectId}/features/requirements`)}
        >
          Open requirements settings
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="mt-16 text-center text-sm text-tertiary">
            {requirements.length === 0 ? "No requirements yet. Press Sync to pull them from git." : "No matches."}
          </div>
        ) : (
          groups.map(([filePath, group]) => {
            const isCollapsed = collapsed[filePath];
            return (
              <div key={filePath}>
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [filePath]: !c[filePath] }))}
                  className="sticky top-0 z-[5] flex w-full items-center gap-1.5 border-b border-subtle-1 bg-surface-2 px-page-x py-1.5 text-left"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-tertiary" /> : <ChevronDown className="h-4 w-4 text-tertiary" />}
                  <span className="truncate text-sm font-medium text-primary">{group.title}</span>
                  <span className="text-xs text-tertiary">{group.items.length}</span>
                </button>
                {!isCollapsed &&
                  group.items.map((r) => (
                    <RequirementRow
                      key={r.id}
                      requirement={r}
                      active={selectedUid === r.uid}
                      href={`${location.pathname}?requirementId=${r.uid}`}
                      onOpen={() => setSelected(r.uid)}
                      onProposeEdits={proposeEdits}
                    />
                  ))}
              </div>
            );
          })
        )}
      </div>

      {selected && (
        <RequirementDetailPanel
          key={selected.uid}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          requirement={selected}
          requirementsByUid={requirementsByUid}
          onClose={() => setSelected(null)}
          onOpenUid={(uid) => setSelected(uid)}
          onProposeEdits={proposeEdits}
        />
      )}
    </div>
  );
};

type RowProps = {
  requirement: TRequirement;
  active: boolean;
  href: string;
  onOpen: () => void;
  onProposeEdits: (requirement: TRequirement, edits: Record<string, string>, message: string) => void;
};

const RequirementRow = ({ requirement, active, href, onOpen, onProposeEdits }: RowProps) => {
  const status = requirement.field_values?.STATUS ?? "";
  const priority = requirement.field_values?.PRIORITY ?? "";
  return (
    <ControlLink href={href} onClick={onOpen} className="w-full cursor-pointer">
      <Row
        className={cn(
          "group flex min-h-11 items-center gap-3 border-b border-subtle-1 py-2.5 text-13 transition-colors hover:bg-layer-transparent-hover",
          active && "bg-accent-primary/5"
        )}
      >
        <span className="w-24 flex-shrink-0 truncate font-mono text-xs text-tertiary">{requirement.uid}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-primary">{requirement.title}</span>
        {priority && (
          <span className="flex-shrink-0">
            <Badge variant={PRIORITY_BADGE[priority] ?? "neutral"} size="sm">
              {priority}
            </Badge>
          </span>
        )}
        <select
          className={cn(
            "flex-shrink-0 rounded-md border border-subtle-1 bg-surface-1 px-2 py-1 text-xs outline-none focus:border-strong",
            status === "APPROVED" && "text-success-primary",
            status === "IN_REVIEW" && "text-warning-primary"
          )}
          value={status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onProposeEdits(requirement, { STATUS: e.target.value }, `Update ${requirement.uid} status to ${e.target.value}`)}
        >
          {!STATUS_OPTIONS.includes(status) && status && <option value={status}>{status}</option>}
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Row>
    </ControlLink>
  );
};

type DetailProps = {
  workspaceSlug: string;
  projectId: string;
  requirement: TRequirement;
  requirementsByUid: Map<string, TRequirement>;
  onClose: () => void;
  onOpenUid: (uid: string) => void;
  onProposeEdits: (requirement: TRequirement, edits: Record<string, string>, message: string) => void;
};

const RequirementDetailPanel = ({
  workspaceSlug,
  projectId,
  requirement,
  requirementsByUid,
  onClose,
  onOpenUid,
  onProposeEdits,
}: DetailProps) => {
  const [history, setHistory] = useState<TRequirementCommit[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ title: string; statement: string; fields: Record<string, string> }>({
    title: "",
    statement: "",
    fields: {},
  });

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setHistoryLoading(true);
    requirementService
      .history(workspaceSlug, projectId, requirement.id)
      .then((res) => !cancelled && setHistory(res))
      .catch(() => !cancelled && setHistory([]))
      .finally(() => !cancelled && setHistoryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, requirement.id]);

  const startEdit = () => {
    setDraft({
      title: requirement.title ?? "",
      statement: requirement.statement ?? "",
      fields: { ...requirement.field_values },
    });
    setEditing(true);
  };

  const saveEdit = () => {
    const edits: Record<string, string> = {};
    if (draft.title !== (requirement.title ?? "")) edits.TITLE = draft.title;
    if (draft.statement !== (requirement.statement ?? "")) edits.STATEMENT = draft.statement;
    for (const [k, v] of Object.entries(draft.fields)) {
      if (v !== (requirement.field_values?.[k] ?? "")) edits[k] = v;
    }
    if (Object.keys(edits).length === 0) {
      setEditing(false);
      return;
    }
    onProposeEdits(requirement, edits, `Update ${requirement.uid}`);
    setEditing(false);
  };

  const author = history && history.length > 0 ? history[0].author : null;

  return (
    <div className="flex w-[440px] flex-shrink-0 flex-col overflow-y-auto border-l border-subtle-1 bg-surface-1">
      <div className="flex items-start justify-between gap-2 border-b border-subtle-1 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-tertiary">{requirement.uid}</div>
          {editing ? (
            <input
              className="mt-1 w-full rounded border border-subtle-1 bg-surface-1 px-2 py-1 text-base font-medium outline-none focus:border-strong"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          ) : (
            <h2 className="mt-0.5 text-base font-medium text-primary">{requirement.title}</h2>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button variant="primary" size="sm" onClick={saveEdit}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <button type="button" onClick={startEdit} className="rounded p-1 text-tertiary hover:bg-surface-2 hover:text-primary" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded p-1 text-tertiary hover:bg-surface-2 hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-5 px-4 py-4">
        <Section title="Statement">
          {editing ? (
            <textarea
              className="min-h-24 w-full rounded border border-subtle-1 bg-surface-1 px-2 py-1.5 text-sm outline-none focus:border-strong"
              value={draft.statement}
              onChange={(e) => setDraft({ ...draft, statement: e.target.value })}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-secondary">{requirement.statement || "-"}</p>
          )}
        </Section>

        <Section title="Fields">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-xs">
            {Object.entries(editing ? draft.fields : requirement.field_values || {}).map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-tertiary">{k}</span>
                {editing ? (
                  <FieldEditor
                    fieldName={k}
                    value={v}
                    onChange={(val) => setDraft((d) => ({ ...d, fields: { ...d.fields, [k]: val } }))}
                  />
                ) : k === "PRIORITY" ? (
                  <span><Badge variant={PRIORITY_BADGE[v] ?? "neutral"} size="sm">{v}</Badge></span>
                ) : (
                  <span className="text-secondary">{v}</span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {requirement.relations?.length > 0 && (
          <Section title="Relations">
            <div className="flex flex-col gap-1.5">
              {requirement.relations.map((rel, i) => {
                const target = requirementsByUid.get(rel.value);
                return (
                  <button
                    key={`${rel.type}-${rel.value}-${i}`}
                    type="button"
                    disabled={!target}
                    onClick={() => target && onOpenUid(rel.value)}
                    className={cn(
                      "flex items-center gap-2 rounded border border-subtle-1 px-2 py-1.5 text-left text-xs",
                      target ? "hover:bg-surface-2" : "cursor-default opacity-70"
                    )}
                  >
                    <Badge variant="neutral" size="sm">{rel.type}</Badge>
                    <span className="font-mono text-tertiary">{rel.value}</span>
                    <span className="min-w-0 flex-1 truncate text-secondary">{target?.title ?? "(not in this project)"}</span>
                    {target?.field_values?.STATUS && (
                      <span className="flex-shrink-0 text-[11px] text-tertiary">{target.field_values.STATUS}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section title={author ? `History · last edited by ${author}` : "History"}>
          {historyLoading ? (
            <div className="text-xs text-tertiary">Loading history from git...</div>
          ) : history && history.length > 0 ? (
            <div className="space-y-2.5">
              {history.map((c) => (
                <div key={c.sha} className="border-l-2 border-subtle-1 pl-3">
                  <div className="text-xs text-secondary">{c.message}</div>
                  <div className="mt-0.5 text-[11px] text-tertiary">
                    {c.author} · {new Date(c.date).toLocaleDateString()} · <span className="font-mono">{c.sha}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-tertiary">No history available.</div>
          )}
        </Section>
      </div>
    </div>
  );
};

const FieldEditor = ({ fieldName, value, onChange }: { fieldName: string; value: string; onChange: (v: string) => void }) => {
  const options = fieldName === "STATUS" ? STATUS_OPTIONS : fieldName === "PRIORITY" ? PRIORITY_OPTIONS : null;
  if (options) {
    return (
      <select
        className="w-full rounded border border-subtle-1 bg-surface-1 px-2 py-1 text-xs outline-none focus:border-strong"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!options.includes(value) && value && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="w-full rounded border border-subtle-1 bg-surface-1 px-2 py-1 text-xs outline-none focus:border-strong"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-tertiary">{title}</div>
    {children}
  </div>
);
