/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueType } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type TDeleteIssueTypeModalProps = {
  isOpen: boolean;
  issueType: TIssueType | null;
  onClose: () => void;
};

export const DeleteIssueTypeModal = observer(function DeleteIssueTypeModal(props: TDeleteIssueTypeModalProps) {
  const { isOpen, issueType, onClose } = props;
  // router
  const { workspaceSlug, projectId } = useParams();
  // states
  const [isSubmitting, setIsSubmitting] = useState(false);
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { deleteIssueType } = useIssueTypes();

  const handleDelete = async () => {
    if (!issueType || !workspaceSlug || !projectId) return;
    setIsSubmitting(true);
    try {
      await deleteIssueType(workspaceSlug.toString(), projectId.toString(), issueType.id);
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("work_item_types.settings.item_delete_confirmation.toast.error.title"),
        message:
          (error as { error?: string })?.error ??
          t("work_item_types.settings.item_delete_confirmation.toast.error.message"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={isOpen}
      handleClose={onClose}
      handleSubmit={() => void handleDelete()}
      isSubmitting={isSubmitting}
      title={t("work_item_types.settings.item_delete_confirmation.title")}
      content={t("work_item_types.settings.item_delete_confirmation.description")}
    />
  );
});
