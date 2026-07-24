/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TServiceDeskNotifyMode } from "@plane/types";
import { Avatar, CustomSelect, Input, Loader, ToggleSwitch } from "@plane/ui";
import { getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { ServiceDeskService } from "@/services/service-desk.service";
// local imports
import type { Route } from "./+types/page";
import { ServiceDeskProjectSettingsHeader } from "./header";

const serviceDeskService = new ServiceDeskService();

const NOTIFY_MODE_OPTIONS: { value: TServiceDeskNotifyMode; label: string }[] = [
  { value: "NONE", label: "Nobody" },
  { value: "ADMINS", label: "Project admins" },
  { value: "MEMBERS", label: "All members" },
  { value: "CUSTOM", label: "Specific members" },
];

function ServiceDeskSettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, projectId } = params;
  // states
  const [mailboxEmail, setMailboxEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [notifyMode, setNotifyMode] = useState<TServiceDeskNotifyMode>("NONE");
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  const { getUserDetails } = useMember();
  // derived values
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Service Desk` : undefined;

  // fetch the existing config. A 404 means the service desk is not configured
  // yet — surface the empty form instead of an error, hence no retries.
  const {
    data: config,
    error,
    isLoading,
    mutate,
  } = useSWR(
    workspaceSlug && projectId ? `SERVICE_DESK_CONFIG_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => serviceDeskService.getConfig(workspaceSlug, projectId) : null,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );

  // sync form state with the fetched config
  useEffect(() => {
    if (!config) return;
    setMailboxEmail(config.mailbox_email ?? "");
    setIsEnabled(!!config.is_enabled);
    setNotifyMode(config.notify_mode ?? "NONE");
    setNotifyUserIds(config.notify_user_ids ?? []);
  }, [config]);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const response = await serviceDeskService.updateConfig(workspaceSlug, projectId, {
        mailbox_email: mailboxEmail.trim(),
        is_enabled: isEnabled,
        notify_mode: notifyMode,
        notify_user_ids: notifyMode === "CUSTOM" ? notifyUserIds : [],
      });
      await mutate(response, { revalidate: false });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Service desk settings saved successfully.",
      });
    } catch (err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message:
          (err as { error?: string } | undefined)?.error ?? "Failed to save service desk settings. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<ServiceDeskProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title="Service Desk — Create tickets from a Microsoft 365 mailbox"
          description="Unread emails in this mailbox create work items in the project's Intake. The Microsoft 365 app credentials are configured at the instance level (SERVICE_DESK_MS365_TENANT_ID / _CLIENT_ID / _CLIENT_SECRET)."
        />
        {isLoading && !config && !error ? (
          <Loader className="mt-6 space-y-4">
            <Loader.Item height="40px" />
            <Loader.Item height="24px" width="60%" />
            <Loader.Item height="32px" width="120px" />
          </Loader>
        ) : (
          <div className="mt-6 flex w-full max-w-lg flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <h4 className="text-13 font-medium text-primary">Mailbox email</h4>
              <Input
                id="service-desk-mailbox-email"
                type="email"
                className="w-full"
                value={mailboxEmail}
                onChange={(e) => setMailboxEmail(e.target.value)}
                placeholder="support@yourcompany.com"
                autoComplete="off"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <h4 className="text-13 font-medium text-primary">Poll this mailbox and create intake work items</h4>
                <p className="text-body-xs-regular text-tertiary">
                  Enabling this also turns on the project&apos;s Intake feature.
                </p>
              </div>
              <ToggleSwitch value={isEnabled} onChange={() => setIsEnabled((prev) => !prev)} size="sm" />
            </div>
            <div className="flex flex-col gap-4 border-t border-subtle pt-6">
              <h4 className="text-h6-medium text-primary">Notifications</h4>
              <div className="flex flex-col gap-1.5">
                <h4 className="text-13 font-medium text-primary">Notify on new tickets</h4>
                <CustomSelect
                  value={notifyMode}
                  label={NOTIFY_MODE_OPTIONS.find((option) => option.value === notifyMode)?.label ?? "Nobody"}
                  onChange={(val: TServiceDeskNotifyMode) => setNotifyMode(val)}
                  className="w-full"
                  input
                >
                  {NOTIFY_MODE_OPTIONS.map((option) => (
                    <CustomSelect.Option key={option.value} value={option.value}>
                      <span className="text-13">{option.label}</span>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
              {notifyMode === "CUSTOM" && (
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-13 font-medium text-primary">Members to notify</h4>
                  <div className="h-8 w-fit">
                    <MemberDropdown
                      value={notifyUserIds}
                      onChange={(val) => setNotifyUserIds(val)}
                      projectId={projectId}
                      multiple
                      buttonVariant="border-with-text"
                      buttonClassName="px-2 py-1.5"
                      placeholder="Select members"
                      showUserDetails
                    />
                  </div>
                  {notifyUserIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {notifyUserIds.map((userId) => {
                        const memberDetails = getUserDetails(userId);
                        if (!memberDetails) return null;
                        return (
                          <span
                            key={userId}
                            className="flex items-center gap-1.5 rounded-full border border-subtle px-2 py-1 text-11 text-secondary"
                          >
                            <Avatar
                              name={memberDetails.display_name}
                              src={getFileURL(memberDetails.avatar_url ?? "")}
                              size="sm"
                              showTooltip={false}
                            />
                            {memberDetails.display_name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <p className="text-body-xs-regular text-tertiary">
                Selected members get an in-app notification for every new ticket and are subscribed to its updates.
              </p>
            </div>
            {config?.last_synced_at && (
              <p className="text-body-xs-regular text-tertiary">
                Last synced {renderFormattedDate(config.last_synced_at)} at {renderFormattedTime(config.last_synced_at)}
              </p>
            )}
            <div>
              <Button variant="primary" size="lg" onClick={handleSave} loading={isSubmitting} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(ServiceDeskSettingsPage);
