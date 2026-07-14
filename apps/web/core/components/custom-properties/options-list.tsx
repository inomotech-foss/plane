/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { observer } from "mobx-react";
import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueCustomPropertyOption } from "@plane/types";
import { Input } from "@plane/ui";

export type TCustomPropertyOptionOperationsCallbacks = {
  createOption: (propertyId: string, data: Partial<TIssueCustomPropertyOption>) => Promise<TIssueCustomPropertyOption>;
  updateOption: (
    propertyId: string,
    optionId: string,
    data: Partial<TIssueCustomPropertyOption>
  ) => Promise<TIssueCustomPropertyOption>;
  deleteOption: (propertyId: string, optionId: string) => Promise<void>;
};

type TCustomPropertyOptionsListProps = {
  propertyId: string;
  // options sorted by sort order
  options: TIssueCustomPropertyOption[];
  optionOperationsCallbacks: TCustomPropertyOptionOperationsCallbacks;
  isEditable: boolean;
};

export const CustomPropertyOptionsList = observer(function CustomPropertyOptionsList(
  props: TCustomPropertyOptionsListProps
) {
  const { propertyId, options, optionOperationsCallbacks, isEditable } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [newOptionName, setNewOptionName] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionName, setEditingOptionName] = useState("");

  const showError = (error: unknown) => {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t("common.error.label"),
      message: (error as { error?: string })?.error ?? t("work_item_custom_properties.settings.update_error"),
    });
  };

  const handleCreate = async () => {
    const name = newOptionName.trim();
    if (!name) return;
    try {
      await optionOperationsCallbacks.createOption(propertyId, { name });
      setNewOptionName("");
    } catch (error) {
      showError(error);
    }
  };

  const handleRename = async (option: TIssueCustomPropertyOption) => {
    const name = editingOptionName.trim();
    if (!name || name === option.name) {
      setEditingOptionId(null);
      return;
    }
    try {
      await optionOperationsCallbacks.updateOption(option.property, option.id, { name });
      setEditingOptionId(null);
    } catch (error) {
      showError(error);
    }
  };

  const handleMove = async (option: TIssueCustomPropertyOption, direction: "up" | "down") => {
    const index = options.findIndex((candidate) => candidate.id === option.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= options.length) return;
    // Compute a sort order placing the option just beyond its neighbor
    const neighbor = options[targetIndex];
    const beyondNeighbor = direction === "up" ? options[targetIndex - 1] : options[targetIndex + 1];
    const sortOrder = beyondNeighbor
      ? (neighbor.sort_order + beyondNeighbor.sort_order) / 2
      : direction === "up"
        ? neighbor.sort_order - 10000
        : neighbor.sort_order + 10000;
    try {
      await optionOperationsCallbacks.updateOption(option.property, option.id, { sort_order: sortOrder });
    } catch (error) {
      showError(error);
    }
  };

  const handleDelete = async (option: TIssueCustomPropertyOption) => {
    try {
      await optionOperationsCallbacks.deleteOption(option.property, option.id);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="border-t border-subtle px-3 py-2">
      <div className="max-h-72 space-y-0.5 overflow-y-auto">
        {options.map((option, index) => (
          <div key={option.id} className="group/option flex items-center justify-between gap-2 rounded-sm px-2 py-1">
            {editingOptionId === option.id ? (
              <>
                <Input
                  type="text"
                  className="h-6 w-full py-0.5 text-12"
                  value={editingOptionName}
                  onChange={(e) => setEditingOptionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleRename(option);
                    if (e.key === "Escape") setEditingOptionId(null);
                  }}
                  autoFocus
                />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="grid place-items-center rounded-sm p-1 text-tertiary hover:text-secondary"
                    onClick={() => void handleRename(option)}
                    aria-label={t("common.confirm")}
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="grid place-items-center rounded-sm p-1 text-tertiary hover:text-secondary"
                    onClick={() => setEditingOptionId(null)}
                    aria-label={t("common.cancel")}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="truncate text-12">{option.name}</span>
                {isEditable && (
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover/option:opacity-100">
                    <button
                      type="button"
                      className="grid place-items-center rounded-sm p-1 text-tertiary hover:text-secondary disabled:opacity-40"
                      onClick={() => void handleMove(option, "up")}
                      disabled={index === 0}
                      aria-label={t("work_item_custom_properties.settings.move_option_up")}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid place-items-center rounded-sm p-1 text-tertiary hover:text-secondary disabled:opacity-40"
                      onClick={() => void handleMove(option, "down")}
                      disabled={index === options.length - 1}
                      aria-label={t("work_item_custom_properties.settings.move_option_down")}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid place-items-center rounded-sm p-1 text-tertiary hover:text-secondary"
                      onClick={() => {
                        setEditingOptionId(option.id);
                        setEditingOptionName(option.name);
                      }}
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="hover:text-red-500 grid place-items-center rounded-sm p-1 text-tertiary"
                      onClick={() => void handleDelete(option)}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {options.length === 0 && (
          <p className="px-2 py-1 text-12 text-placeholder italic">
            {t("work_item_custom_properties.settings.no_options")}
          </p>
        )}
      </div>
      {isEditable && (
        <div className="mt-1 flex items-center gap-2 px-2">
          <Plus className="size-3.5 shrink-0 text-tertiary" />
          <Input
            type="text"
            className="h-7 w-full py-0.5 text-12"
            value={newOptionName}
            onChange={(e) => setNewOptionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder={t("work_item_custom_properties.settings.add_option_placeholder")}
          />
        </div>
      )}
    </div>
  );
});
