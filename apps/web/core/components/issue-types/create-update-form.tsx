/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueType, TLogoProps } from "@plane/types";
import { Input, TextArea, ToggleSwitch, Tooltip } from "@plane/ui";

const DEFAULT_LOGO_PROPS: TLogoProps = {
  in_use: "icon",
  icon: { name: "layers", color: "#6b7280" },
};

export type TIssueTypeOperationsCallbacks = {
  createIssueType: (data: Partial<TIssueType>) => Promise<TIssueType>;
  updateIssueType: (issueTypeId: string, data: Partial<TIssueType>) => Promise<TIssueType>;
};

type TCreateUpdateIssueTypeFormProps = {
  issueTypeToUpdate?: TIssueType;
  operationsCallbacks: TIssueTypeOperationsCallbacks;
  onClose: () => void;
};

export const CreateUpdateIssueTypeForm = observer(function CreateUpdateIssueTypeForm(
  props: TCreateUpdateIssueTypeFormProps
) {
  const { issueTypeToUpdate, operationsCallbacks, onClose } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [name, setName] = useState(issueTypeToUpdate?.name ?? "");
  const [description, setDescription] = useState(issueTypeToUpdate?.description ?? "");
  const [logoProps, setLogoProps] = useState<TLogoProps>(issueTypeToUpdate?.logo_props ?? DEFAULT_LOGO_PROPS);
  const [isDefault, setIsDefault] = useState(issueTypeToUpdate?.is_default ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);

  useEffect(() => {
    setName(issueTypeToUpdate?.name ?? "");
    setDescription(issueTypeToUpdate?.description ?? "");
    setLogoProps(issueTypeToUpdate?.logo_props ?? DEFAULT_LOGO_PROPS);
    setIsDefault(issueTypeToUpdate?.is_default ?? false);
  }, [issueTypeToUpdate]);

  const isUpdating = !!issueTypeToUpdate;

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setIsSubmitting(true);
    try {
      const payload: Partial<TIssueType> = {
        name: trimmedName,
        description: description.trim(),
        logo_props: logoProps,
        is_default: isDefault,
      };
      if (isUpdating) await operationsCallbacks.updateIssueType(issueTypeToUpdate.id, payload);
      else await operationsCallbacks.createIssueType(payload);
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message:
          (error as { error?: string })?.error ??
          t(
            isUpdating
              ? "work_item_types.update.toast.error.message.default"
              : "work_item_types.create.toast.error.message.default"
          ),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="flex w-full flex-col gap-3 rounded-sm border border-subtle bg-surface-1 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex w-full items-start gap-2">
        <EmojiPicker
          iconType="material"
          closeOnSelect={false}
          isOpen={isLogoPickerOpen}
          handleToggle={(val: boolean) => setIsLogoPickerOpen(val)}
          className="flex items-center justify-center"
          buttonClassName="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm border border-subtle bg-surface-2"
          label={<Logo logo={logoProps} size={18} />}
          // TODO: fix types
          onChange={(val: any) => {
            let logoValue = {};
            if (val?.type === "emoji") logoValue = { value: val.value };
            else if (val?.type === "icon") logoValue = val.value;
            setLogoProps({ in_use: val?.type, [val?.type]: logoValue } as TLogoProps);
            setIsLogoPickerOpen(false);
          }}
          defaultIconColor={logoProps?.in_use === "icon" ? logoProps?.icon?.color : undefined}
          defaultOpen={logoProps?.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
        />
        <div className="flex w-full flex-col gap-2">
          <Input
            type="text"
            className="w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("work_item_types.create_update.form.name.placeholder")}
            autoFocus
          />
          <TextArea
            className="w-full text-13"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("work_item_types.create_update.form.description.placeholder")}
            rows={2}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Tooltip tooltipContent={t("work_item_types.settings.set_as_default")}>
          <div className="flex items-center gap-2">
            <ToggleSwitch value={isDefault} onChange={setIsDefault} size="sm" />
            <span className="text-13 text-secondary">{t("work_item_types.settings.set_as_default")}</span>
          </div>
        </Tooltip>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose} size="sm">
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" size="sm" loading={isSubmitting} disabled={!name.trim()}>
            {isUpdating ? t("common.update") : t("common.create")}
          </Button>
        </div>
      </div>
    </form>
  );
});
