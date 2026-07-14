/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueType } from "@plane/types";
import { ToggleSwitch, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import type { TIssueTypeOperationsCallbacks } from "./create-update-form";
import { CreateUpdateIssueTypeForm } from "./create-update-form";

type TIssueTypeItemProps = {
  issueType: TIssueType;
  operationsCallbacks: TIssueTypeOperationsCallbacks;
  onDelete: () => void;
  isEditable: boolean;
};

export const IssueTypeItem = observer(function IssueTypeItem(props: TIssueTypeItemProps) {
  const { issueType, operationsCallbacks, onDelete, isEditable } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [isEditing, setIsEditing] = useState(false);

  const showError = (message?: string) =>
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("common.error.label"),
      message: message ?? t("work_item_types.update.toast.error.message.default"),
    });

  const handleToggleActive = async (isActive: boolean) => {
    try {
      await operationsCallbacks.updateIssueType(issueType.id, { is_active: isActive });
    } catch (error) {
      showError((error as { error?: string })?.error);
    }
  };

  const handleSetDefault = async () => {
    if (!issueType.is_active) {
      showError(t("work_item_types.settings.cant_set_default_inactive_message"));
      return;
    }
    try {
      await operationsCallbacks.updateIssueType(issueType.id, { is_default: true });
    } catch (error) {
      showError((error as { error?: string })?.error);
    }
  };

  if (isEditing)
    return (
      <CreateUpdateIssueTypeForm
        issueTypeToUpdate={issueType}
        operationsCallbacks={operationsCallbacks}
        onClose={() => setIsEditing(false)}
      />
    );

  return (
    <div className="rounded-sm border border-subtle bg-surface-1">
      <div className="group flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-5 shrink-0 place-items-center">
            <Logo logo={issueType.logo_props} size={16} />
          </span>
          <span className={cn("truncate text-13", { "text-placeholder line-through": !issueType.is_active })}>
            {issueType.name}
          </span>
          {issueType.is_default && (
            <span className="shrink-0 rounded-sm bg-layer-1 px-1.5 py-0.5 text-10 text-tertiary uppercase">
              {t("common.default")}
            </span>
          )}
          {issueType.is_epic && (
            <span className="shrink-0 rounded-sm bg-layer-1 px-1.5 py-0.5 text-10 text-tertiary uppercase">Epic</span>
          )}
          {issueType.description && <span className="truncate text-11 text-placeholder">{issueType.description}</span>}
        </div>
        {isEditable && (
          <div className="flex shrink-0 items-center gap-2">
            {!issueType.is_default && (
              <Tooltip tooltipContent={t("work_item_types.settings.set_as_default")}>
                <button
                  type="button"
                  className="grid place-items-center rounded-sm p-1 text-tertiary opacity-0 group-hover:opacity-100 hover:bg-layer-transparent-hover hover:text-secondary"
                  onClick={() => void handleSetDefault()}
                  aria-label={t("work_item_types.settings.set_as_default")}
                >
                  <CheckCircle2 className="size-3.5" />
                </button>
              </Tooltip>
            )}
            <Tooltip tooltipContent={t("work_item_types.settings.properties.enable_disable.label")}>
              <div>
                <ToggleSwitch
                  value={issueType.is_active}
                  onChange={handleToggleActive}
                  size="sm"
                  disabled={issueType.is_default}
                />
              </div>
            </Tooltip>
            <button
              type="button"
              className="grid place-items-center rounded-sm p-1 text-tertiary opacity-0 group-hover:opacity-100 hover:bg-layer-transparent-hover hover:text-secondary"
              onClick={() => setIsEditing(true)}
              aria-label={t("common.edit")}
            >
              <Pencil className="size-3.5" />
            </button>
            <Tooltip
              tooltipContent={
                issueType.is_epic || issueType.is_default
                  ? t("work_item_types.settings.cant_delete_default_message")
                  : t("common.delete")
              }
            >
              <button
                type="button"
                className="hover:text-red-500 grid place-items-center rounded-sm p-1 text-tertiary opacity-0 group-hover:opacity-100 hover:bg-layer-transparent-hover disabled:opacity-40"
                onClick={onDelete}
                disabled={issueType.is_epic || issueType.is_default}
                aria-label={t("common.delete")}
              >
                <Trash2 className="size-3.5" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
});
