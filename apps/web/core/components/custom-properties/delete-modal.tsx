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
import type { TIssueCustomProperty } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
// hooks
import { useIssueCustomProperties } from "@/hooks/store/use-issue-custom-properties";

type TDeleteCustomPropertyModalProps = {
  isOpen: boolean;
  property: TIssueCustomProperty | null;
  onClose: () => void;
};

export const DeleteCustomPropertyModal = observer(function DeleteCustomPropertyModal(
  props: TDeleteCustomPropertyModalProps
) {
  const { isOpen, property, onClose } = props;
  // router
  const { workspaceSlug, projectId } = useParams();
  // states
  const [isSubmitting, setIsSubmitting] = useState(false);
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { deleteProperty } = useIssueCustomProperties();

  const handleDelete = async () => {
    if (!property || !workspaceSlug || !projectId) return;
    setIsSubmitting(true);
    try {
      await deleteProperty(workspaceSlug.toString(), projectId.toString(), property.id);
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("work_item_custom_properties.settings.delete_error"),
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
      title={t("work_item_custom_properties.settings.delete_title")}
      content={t("work_item_custom_properties.settings.delete_description", {
        name: property?.display_name ?? "",
      })}
    />
  );
});
