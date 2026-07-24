/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Mail, Paperclip, Pencil } from "lucide-react";
import type { KeyedMutator } from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueEmailMessage, TIssueEmailThread } from "@plane/types";
import { Input } from "@plane/ui";
import { checkEmailValidity, cn } from "@plane/utils";
// services
import { ServiceDeskService } from "@/services/service-desk.service";

type TEmailThreadPanel = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  emailThread: TIssueEmailThread;
  mutateEmailThread: KeyedMutator<TIssueEmailThread | null>;
};

// services
const serviceDeskService = new ServiceDeskService();

const parseEmailList = (value: string): string[] =>
  value
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

// messages are sorted oldest → newest, so search from the end
const findLastOutboundMessage = (messages: TIssueEmailMessage[]): TIssueEmailMessage | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === "OUTBOUND") return messages[i];
  }
  return undefined;
};

function OutboundStatusBadge({ message }: { message: TIssueEmailMessage }) {
  if (message.status === "PENDING")
    return (
      <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-11 font-medium text-warning-primary">
        Sending…
      </span>
    );
  if (message.status === "SENT")
    return (
      <span className="rounded-full bg-success-subtle px-2 py-0.5 text-11 font-medium text-success-primary">Sent</span>
    );
  if (message.status === "FAILED")
    return (
      <Tooltip tooltipContent={message.error || "Email delivery failed."}>
        <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-11 font-medium text-danger-primary">
          Failed
        </span>
      </Tooltip>
    );
  return null;
}

export function EmailThreadPanel(props: TEmailThreadPanel) {
  const { workspaceSlug, projectId, issueId, emailThread, mutateEmailThread } = props;
  // states
  const [isOpen, setIsOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  // derived values
  const lastOutboundMessage = findLastOutboundMessage(emailThread.messages);
  const latestMessage =
    emailThread.messages.length > 0 ? emailThread.messages[emailThread.messages.length - 1] : undefined;
  // attachment records carry no id of their own (skipped ones have no asset), so
  // derive a stable key upfront; the list never changes within a message
  const latestMessageAttachments = (latestMessage?.attachments ?? []).map((attachment, index) => ({
    key: `${attachment.asset_id ?? attachment.name}-${index}`,
    record: attachment,
  }));

  const handleStartEditing = () => {
    setToInput(emailThread.to_emails.join(", "));
    setCcInput(emailThread.cc_emails.join(", "));
    setValidationError(null);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setValidationError(null);
  };

  const handleSaveRecipients = async () => {
    const toEmails = parseEmailList(toInput);
    const ccEmails = parseEmailList(ccInput);
    const invalidEmails = [...toEmails, ...ccEmails].filter((email) => !checkEmailValidity(email));
    if (invalidEmails.length > 0) {
      setValidationError(`Invalid email address${invalidEmails.length > 1 ? "es" : ""}: ${invalidEmails.join(", ")}`);
      return;
    }
    setValidationError(null);
    setIsSaving(true);
    try {
      const updatedThread = await serviceDeskService.updateEmailThread(workspaceSlug, projectId, issueId, {
        to_emails: toEmails,
        cc_emails: ccEmails,
      });
      await mutateEmailThread(updatedThread, { revalidate: false });
      setIsEditing(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Email recipients updated successfully.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: (error as { error?: string })?.error ?? "Failed to update email recipients. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-subtle bg-surface-1">
      {/* header */}
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex min-w-0 flex-grow items-center gap-2 text-left"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-tertiary" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-tertiary" />
          )}
          <Mail className="h-4 w-4 flex-shrink-0 text-accent-primary" />
          <span className="text-13 font-medium text-primary">Email conversation</span>
          <span className="truncate text-11 text-tertiary">via {emailThread.mailbox_email}</span>
        </button>
        {lastOutboundMessage && <OutboundStatusBadge message={lastOutboundMessage} />}
      </div>

      {/* latest message attachments */}
      {latestMessageAttachments.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 pb-2.5">
          <Paperclip className="h-3 w-3 flex-shrink-0 text-tertiary" />
          {latestMessageAttachments.map(({ key, record }) =>
            record.skipped ? (
              <Tooltip key={key} tooltipContent={`Not attached: ${record.skipped}`}>
                <span className="text-11 break-all text-placeholder line-through">{record.name}</span>
              </Tooltip>
            ) : (
              <span key={key} className="text-11 break-all text-tertiary">
                {record.name}
              </span>
            )
          )}
        </div>
      )}

      {/* body */}
      {isOpen && (
        <div className="space-y-2 border-t border-subtle p-3">
          {/* requester */}
          <div className="flex items-start gap-2">
            <span className="w-20 flex-shrink-0 pt-0.5 text-11 text-tertiary">Requester</span>
            <span className="text-13 break-all text-secondary">
              {emailThread.creator_name ? `${emailThread.creator_name} ` : ""}
              <span className="text-tertiary">&lt;{emailThread.creator_email}&gt;</span>
            </span>
          </div>

          {/* recipients */}
          {isEditing ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-20 flex-shrink-0 text-11 text-tertiary">To</span>
                <Input
                  inputSize="xs"
                  className="w-full"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  placeholder="email@example.com, another@example.com"
                  disabled={isSaving}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 flex-shrink-0 text-11 text-tertiary">Cc</span>
                <Input
                  inputSize="xs"
                  className="w-full"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  placeholder="email@example.com, another@example.com"
                  disabled={isSaving}
                />
              </div>
              {validationError && <p className="pl-[88px] text-11 text-danger-primary">{validationError}</p>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={handleCancelEditing} disabled={isSaving}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSaveRecipients} loading={isSaving}>
                  {isSaving ? "Saving" : "Save"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <span className="w-20 flex-shrink-0 pt-0.5 text-11 text-tertiary">To</span>
                <span
                  className={cn(
                    "text-13 break-all text-secondary",
                    !emailThread.to_emails.length && "text-placeholder"
                  )}
                >
                  {emailThread.to_emails.length > 0 ? emailThread.to_emails.join(", ") : "No recipients"}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-20 flex-shrink-0 pt-0.5 text-11 text-tertiary">Cc</span>
                <span
                  className={cn(
                    "text-13 break-all text-secondary",
                    !emailThread.cc_emails.length && "text-placeholder"
                  )}
                >
                  {emailThread.cc_emails.length > 0 ? emailThread.cc_emails.join(", ") : "No recipients"}
                </span>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleStartEditing}
                  className="flex items-center gap-1 text-11 font-medium text-tertiary hover:text-secondary"
                >
                  <Pencil className="h-3 w-3" />
                  Edit recipients
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
