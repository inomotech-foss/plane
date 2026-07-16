/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementRepository } from "@plane/types";
// services
import { requirementService } from "@/services/requirement.service";

type Props = { workspaceSlug: string; projectId: string };

const errorMessage = (error: unknown, fallback: string): string =>
  (error as { error?: string })?.error || fallback;

export const RequirementRepositorySettings = ({ workspaceSlug, projectId }: Props) => {
  const { t } = useTranslation();
  const [repository, setRepository] = useState<TRequirementRepository | null>(null);
  const [form, setForm] = useState({ repo_url: "", default_branch: "main", provider: "github", access_token: "" });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const repo = await requirementService.getRepository(workspaceSlug, projectId);
      if (repo && "repo_url" in repo && repo.repo_url) {
        setRepository(repo as TRequirementRepository);
        setForm((f) => ({
          ...f,
          repo_url: (repo as TRequirementRepository).repo_url,
          default_branch: (repo as TRequirementRepository).default_branch,
          provider: (repo as TRequirementRepository).provider,
        }));
      }
    } catch {
      /* no repo configured yet */
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!form.repo_url) return;
    setSaving(true);
    try {
      await requirementService.updateRepository(workspaceSlug, projectId, form);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Saved", message: "Repository configured." });
      setForm((f) => ({ ...f, access_token: "" }));
      await load();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: errorMessage(error, "Could not save the repository.") });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await requirementService.sync(workspaceSlug, projectId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Sync started", message: "Refreshing requirements from git." });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: errorMessage(error, "Sync failed.") });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-md border border-subtle-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-primary">{t("project_settings.features.requirements.repository.title")}</h4>
          <p className="mt-0.5 text-xs text-tertiary">{t("project_settings.features.requirements.repository.description")}</p>
        </div>
        {repository && (
          <Button variant="secondary" size="lg" prependIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={handleSync} loading={syncing}>
            Sync now
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:max-w-xl">
        <label className="text-sm text-secondary">
          Repository URL
          <input
            className="mt-1 w-full rounded border border-subtle-1 bg-surface-1 px-3 py-2 text-sm outline-none focus:border-strong"
            placeholder="https://github.com/org/requirements.git"
            value={form.repo_url}
            onChange={(e) => setForm({ ...form, repo_url: e.target.value })}
          />
        </label>
        <label className="text-sm text-secondary">
          Default branch
          <input
            className="mt-1 w-full rounded border border-subtle-1 bg-surface-1 px-3 py-2 text-sm outline-none focus:border-strong"
            value={form.default_branch}
            onChange={(e) => setForm({ ...form, default_branch: e.target.value })}
          />
        </label>
        <label className="text-sm text-secondary">
          Access token {repository && <span className="text-tertiary">(leave blank to keep current)</span>}
          <input
            type="password"
            className="mt-1 w-full rounded border border-subtle-1 bg-surface-1 px-3 py-2 text-sm outline-none focus:border-strong"
            placeholder="Personal access token with repo scope"
            value={form.access_token}
            onChange={(e) => setForm({ ...form, access_token: e.target.value })}
          />
        </label>
      </div>

      {repository && (
        <p className="mt-3 text-xs text-tertiary">
          Last sync:{" "}
          <span className={repository.last_sync_status === "error" ? "text-danger-primary" : "text-success-primary"}>
            {repository.last_sync_status}
          </span>
          {repository.last_synced_at && ` · ${new Date(repository.last_synced_at).toLocaleString()}`}
          {repository.last_sync_error && ` · ${repository.last_sync_error}`}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!form.repo_url}>
          {repository ? "Update repository" : "Connect repository"}
        </Button>
      </div>
    </div>
  );
};
