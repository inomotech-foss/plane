/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { Mail, Paperclip, X } from "lucide-react";
import { observer } from "mobx-react";
import { useForm, Controller } from "react-hook-form";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setPromiseToast, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TCommentsOperations, TIssueEmailThread } from "@plane/types";
import { cn, convertBytesToSize, isCommentEmpty } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useFileSize } from "@/hooks/use-file-size";
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

type TReplyAttachment = {
  assetId: string;
  name: string;
  size: number;
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
  const [replyAttachments, setReplyAttachments] = useState<TReplyAttachment[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // store hooks
  const workspaceStore = useWorkspace();
  const {
    fetchComments,
    attachment: { createAttachment },
  } = useIssueDetail();
  // file size
  const { maxFileSize } = useFileSize();
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
        comment_html: formData.comment_html || "<p></p>",
        ...(replyAttachments.length > 0
          ? { attachment_asset_ids: replyAttachments.map((attachment) => attachment.assetId) }
          : {}),
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
      setReplyAttachments([]);
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

  // uploads run through the same store operation as the work item's Attachments
  // section, so uploaded files also show up there
  const handleAttachmentFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const oversizedFileNames: string[] = [];
    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > maxFileSize) oversizedFileNames.push(file.name);
      else validFiles.push(file);
    }
    if (oversizedFileNames.length > 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "File size limit exceeded",
        message: `Files must be ${maxFileSize / 1024 / 1024} MB or smaller. Skipped: ${oversizedFileNames.join(", ")}`,
      });
    }
    if (validFiles.length === 0) return;
    setIsUploadingAttachments(true);
    const isPlural = validFiles.length > 1;
    const uploadPromise = Promise.all(
      validFiles.map((file) => createAttachment(workspaceSlug, projectId, issueId, file))
    );
    setPromiseToast(uploadPromise, {
      loading: `Uploading ${isPlural ? "attachments" : "attachment"}...`,
      success: {
        title: `${isPlural ? "Attachments" : "Attachment"} uploaded`,
        message: () => `The ${isPlural ? "attachments have" : "attachment has"} been successfully uploaded`,
      },
      error: {
        title: `${isPlural ? "Attachments" : "Attachment"} not uploaded`,
        message: () => `The ${isPlural ? "attachments" : "attachment"} could not be uploaded`,
      },
    });
    try {
      const uploadedAttachments = await uploadPromise;
      setReplyAttachments((prev) => [
        ...prev,
        ...uploadedAttachments.map((attachment) => ({
          assetId: attachment.id,
          name: attachment.attributes.name,
          size: attachment.attributes.size,
        })),
      ]);
    } catch {
      // the failure toast is handled by the promise toast above
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const handleRemoveReplyAttachment = (assetId: string) => {
    setReplyAttachments((prev) => prev.filter((attachment) => attachment.assetId !== assetId));
  };

  const commentHTML = watch("comment_html");
  const isEmpty = isCommentEmpty(commentHTML ?? undefined);
  const hasReplyAttachments = replyAttachments.length > 0;
  const canSubmit = (!isEmpty || hasReplyAttachments) && !isSubmitting && !isUploadingAttachments;

  return (
    <div
      className={cn("sticky bottom-0 z-[4] bg-surface-1 sm:static")}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          canSubmit &&
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
              if (canSubmit) {
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
      {hasReplyAttachments && (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {replyAttachments.map((attachment) => (
              <span
                key={attachment.assetId}
                className="flex max-w-60 items-center gap-1 rounded-sm border border-subtle bg-layer-1 py-0.5 pr-0.5 pl-1.5 text-11 text-secondary"
              >
                <Paperclip className="h-3 w-3 flex-shrink-0 text-tertiary" />
                <span className="truncate">{attachment.name}</span>
                <span className="flex-shrink-0 text-placeholder">{convertBytesToSize(attachment.size)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveReplyAttachment(attachment.assetId)}
                  className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-3 hover:text-secondary"
                  aria-label={`Remove ${attachment.name} from this reply`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <p className="text-11 text-tertiary">
            Attached files are also added to the work item&apos;s attachments. Removing a file here only removes it from
            this reply.
          </p>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-11 text-accent-secondary">
          <Mail className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            Will be emailed to {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
            {hasReplyAttachments &&
              ` with ${replyAttachments.length} attachment${replyAttachments.length === 1 ? "" : "s"}`}
          </span>
        </p>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              // reset so picking the same file again re-triggers onChange
              e.target.value = "";
              void handleAttachmentFiles(files);
            }}
          />
          <Tooltip tooltipContent="Attach files. They are also added to the work item's attachments.">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting || isUploadingAttachments}
              className="grid h-7 w-7 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Attach files to the reply"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Button
            type="button"
            variant="primary"
            size="base"
            onClick={(e) => handleSubmit(onSubmit)(e)}
            disabled={!canSubmit}
            loading={isSubmitting}
          >
            Send reply
          </Button>
        </div>
      </div>
    </div>
  );
});
