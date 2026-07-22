/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { Mail } from "lucide-react";
import { observer } from "mobx-react";
import { useForm, Controller } from "react-hook-form";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TCommentsOperations, TIssueEmailThread } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { FileService } from "@/services/file.service";
import { ServiceDeskService } from "@/services/service-desk.service";

type TEmailReplyCreate = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  emailThread: TIssueEmailThread;
  activityOperations: TCommentsOperations;
  onReplySent?: () => void;
  showToolbarInitially?: boolean;
};

type TEmailReplyFormData = {
  comment_html: string;
};

// services
const fileService = new FileService();
const serviceDeskService = new ServiceDeskService();

export const EmailReplyCreate = observer(function EmailReplyCreate(props: TEmailReplyCreate) {
  const {
    workspaceSlug,
    projectId,
    issueId,
    emailThread,
    activityOperations,
    onReplySent,
    showToolbarInitially = false,
  } = props;
  // states
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // store hooks
  const workspaceStore = useWorkspace();
  const { fetchComments } = useIssueDetail();
  // derived values
  const workspaceId = workspaceStore.getWorkspaceBySlug(workspaceSlug)?.id as string;
  const recipients = new Set<string>();
  for (const email of [emailThread.creator_email, ...emailThread.to_emails, ...emailThread.cc_emails]) {
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 0) recipients.add(normalized);
  }
  const recipientCount = recipients.size;
  // form info
  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting },
    reset,
  } = useForm<TEmailReplyFormData>({
    defaultValues: {
      comment_html: "<p></p>",
    },
  });

  const onSubmit = async (formData: TEmailReplyFormData) => {
    try {
      await serviceDeskService.sendEmailReply(workspaceSlug, projectId, issueId, {
        comment_html: formData.comment_html,
      });
      // refetch comments so the customer-visible comment created by the backend shows up
      await fetchComments(workspaceSlug, projectId, issueId, "mutate");
      if (uploadedAssetIds.length > 0) {
        await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId, issueId, {
          asset_ids: uploadedAssetIds,
        });
        setUploadedAssetIds([]);
      }
      // refresh the email thread so the outbound delivery status is visible
      onReplySent?.();
      reset({
        comment_html: "<p></p>",
      });
      editorRef.current?.clearEditor();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Reply sent",
        message: `Reply sent to ${emailThread.creator_email}`,
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: (error as { error?: string })?.error ?? "Failed to send the email reply. Please try again.",
      });
    }
  };

  const commentHTML = watch("comment_html");
  const isEmpty = isCommentEmpty(commentHTML ?? undefined);

  return (
    <div
      className={cn("sticky bottom-0 z-[4] bg-surface-1 sm:static")}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !isEmpty &&
          !isSubmitting &&
          editorRef.current?.isEditorReadyToDiscard()
        )
          handleSubmit(onSubmit)(e);
      }}
    >
      <Controller
        name="comment_html"
        control={control}
        render={({ field: { value, onChange } }) => (
          <LiteTextEditor
            editable
            workspaceId={workspaceId}
            id={"email_reply_" + issueId}
            value={"<p></p>"}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            placeholder="Write a reply to the customer…"
            onEnterKeyPress={(e) => {
              if (!isEmpty && !isSubmitting) {
                handleSubmit(onSubmit)(e);
              }
            }}
            ref={editorRef}
            initialValue={value ?? "<p></p>"}
            containerClassName="min-h-min"
            onChange={(_comment_json, comment_html) => onChange(comment_html)}
            isSubmitting={isSubmitting}
            showSubmitButton={false}
            uploadFile={async (blockId, file) => {
              const { asset_id } = await activityOperations.uploadCommentAsset(blockId, file);
              setUploadedAssetIds((prev) => [...prev, asset_id]);
              return asset_id;
            }}
            duplicateFile={async (assetId: string) => {
              const { asset_id } = await activityOperations.duplicateCommentAsset(assetId);
              setUploadedAssetIds((prev) => [...prev, asset_id]);
              return asset_id;
            }}
            showToolbarInitially={showToolbarInitially}
            parentClassName="p-2 border-accent-subtle"
            displayConfig={{
              fontSize: "small-font",
            }}
          />
        )}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-11 text-accent-secondary">
          <Mail className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            Will be emailed to {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
          </span>
        </p>
        <Button
          type="button"
          variant="primary"
          size="base"
          onClick={(e) => handleSubmit(onSubmit)(e)}
          disabled={isEmpty || isSubmitting}
          loading={isSubmitting}
        >
          Send reply
        </Button>
      </div>
    </div>
  );
});
