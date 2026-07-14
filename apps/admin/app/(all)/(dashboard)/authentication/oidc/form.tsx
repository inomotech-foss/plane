/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { isEmpty } from "lodash-es";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
// plane internal packages
import { API_BASE_URL } from "@plane/constants";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFormattedInstanceConfiguration, TInstanceOidcAuthenticationConfigurationKeys } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
// components
import { ConfirmDiscardModal } from "@/components/common/confirm-discard-modal";
import type { TControllerInputFormField } from "@/components/common/controller-input";
import { ControllerInput } from "@/components/common/controller-input";
import type { TControllerSwitchFormField } from "@/components/common/controller-switch";
import { ControllerSwitch } from "@/components/common/controller-switch";
import type { TCopyField } from "@/components/common/copy-field";
import { CopyField } from "@/components/common/copy-field";
// hooks
import { useInstance } from "@/hooks/store";

type Props = {
  config: IFormattedInstanceConfiguration;
};

type OidcConfigFormValues = Record<TInstanceOidcAuthenticationConfigurationKeys, string>;

const OIDC_FORM_SWITCH_FIELD: TControllerSwitchFormField<OidcConfigFormValues> = {
  name: "ENABLE_OIDC_SYNC",
  label: "OIDC",
};

export function InstanceOIDCConfigForm(props: Props) {
  const { config } = props;
  // states
  const [isDiscardChangesModalOpen, setIsDiscardChangesModalOpen] = useState(false);
  // store hooks
  const { updateInstanceConfigurations, managedConfigurationKeys } = useInstance();
  // Keys reconciled by the Helm chart are owned by the deploy and shown read-only.
  const isManaged = (key: string) => managedConfigurationKeys.has(key);
  const hasManagedFields = managedConfigurationKeys.size > 0;
  // form data
  const {
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OidcConfigFormValues>({
    defaultValues: {
      OIDC_ISSUER: config["OIDC_ISSUER"],
      OIDC_CLIENT_ID: config["OIDC_CLIENT_ID"],
      OIDC_CLIENT_SECRET: config["OIDC_CLIENT_SECRET"],
      OIDC_PROVIDER_NAME: config["OIDC_PROVIDER_NAME"] || "SSO",
      OIDC_SCOPES: config["OIDC_SCOPES"] || "openid email profile",
      OIDC_TRUST_EMAIL: config["OIDC_TRUST_EMAIL"] || "0",
      OIDC_AUTHORIZE_URL: config["OIDC_AUTHORIZE_URL"],
      OIDC_TOKEN_URL: config["OIDC_TOKEN_URL"],
      OIDC_USERINFO_URL: config["OIDC_USERINFO_URL"],
      OIDC_JWKS_URL: config["OIDC_JWKS_URL"],
      ENABLE_OIDC_SYNC: config["ENABLE_OIDC_SYNC"] || "0",
    },
  });

  const originURL = !isEmpty(API_BASE_URL) ? API_BASE_URL : typeof window !== "undefined" ? window.location.origin : "";

  const OIDC_FORM_FIELDS: TControllerInputFormField[] = [
    {
      key: "OIDC_ISSUER",
      type: "text",
      label: "Issuer URL",
      description: (
        <>
          Your provider&apos;s issuer URL. The endpoints are discovered from{" "}
          <code>{`{issuer}/.well-known/openid-configuration`}</code>. For Microsoft Entra use{" "}
          <code>https://login.microsoftonline.com/&lt;tenant-id&gt;/v2.0</code>.
        </>
      ),
      placeholder: "https://login.microsoftonline.com/<tenant-id>/v2.0",
      error: Boolean(errors.OIDC_ISSUER),
      required: true,
    },
    {
      key: "OIDC_CLIENT_ID",
      type: "text",
      label: "Client ID",
      description: <>The application (client) ID registered with your provider.</>,
      placeholder: "70a44354520df8bd9bcd",
      error: Boolean(errors.OIDC_CLIENT_ID),
      required: true,
    },
    {
      key: "OIDC_CLIENT_SECRET",
      type: "password",
      label: "Client secret",
      description: <>The client secret issued by your provider.</>,
      placeholder: "9b0050f94ec1b744e32ce79ea4ffacd40d4119cb",
      error: Boolean(errors.OIDC_CLIENT_SECRET),
      required: true,
    },
    {
      key: "OIDC_PROVIDER_NAME",
      type: "text",
      label: "Display name",
      description: <>Shown on the sign-in button, for example &quot;Continue with Microsoft&quot;.</>,
      placeholder: "SSO",
      error: Boolean(errors.OIDC_PROVIDER_NAME),
      required: true,
    },
  ];

  // Optional: discovery covers these for most providers; set them only to override
  // a discovery document or for a provider that does not publish one.
  const OIDC_ADVANCED_FIELDS: TControllerInputFormField[] = [
    {
      key: "OIDC_SCOPES",
      type: "text",
      label: "Scopes",
      description: <>Space-separated scopes. &quot;openid&quot; is always requested.</>,
      placeholder: "openid email profile",
      error: Boolean(errors.OIDC_SCOPES),
      required: false,
    },
    {
      key: "OIDC_AUTHORIZE_URL",
      type: "text",
      label: "Authorization endpoint",
      description: <>Override the discovered authorization endpoint.</>,
      placeholder: "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize",
      error: Boolean(errors.OIDC_AUTHORIZE_URL),
      required: false,
    },
    {
      key: "OIDC_TOKEN_URL",
      type: "text",
      label: "Token endpoint",
      description: <>Override the discovered token endpoint.</>,
      placeholder: "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token",
      error: Boolean(errors.OIDC_TOKEN_URL),
      required: false,
    },
    {
      key: "OIDC_USERINFO_URL",
      type: "text",
      label: "Userinfo endpoint",
      description: <>Override the discovered userinfo endpoint.</>,
      placeholder: "https://graph.microsoft.com/oidc/userinfo",
      error: Boolean(errors.OIDC_USERINFO_URL),
      required: false,
    },
    {
      key: "OIDC_JWKS_URL",
      type: "text",
      label: "JWKS endpoint",
      description: <>Override the discovered JWKS (signing keys) endpoint.</>,
      placeholder: "https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys",
      error: Boolean(errors.OIDC_JWKS_URL),
      required: false,
    },
  ];

  const OIDC_SERVICE_FIELD: TCopyField[] = [
    {
      key: "Callback_URI",
      label: "Callback URI",
      url: `${originURL}/auth/oidc/callback/`,
      description: <>Register this as an allowed redirect URI with your provider.</>,
    },
  ];

  const onSubmit = async (formData: OidcConfigFormValues) => {
    const payload: Partial<OidcConfigFormValues> = { ...formData };

    try {
      const response = await updateInstanceConfigurations(payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Done!",
        message: "Your OIDC authentication is configured. You should test it now.",
      });
      reset(
        (Object.keys(formData) as TInstanceOidcAuthenticationConfigurationKeys[]).reduce((acc, key) => {
          acc[key] = response.find((item) => item.key === key)?.value ?? "";
          return acc;
        }, {} as OidcConfigFormValues)
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleGoBack = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (isDirty) {
      e.preventDefault();
      setIsDiscardChangesModalOpen(true);
    }
  };

  return (
    <>
      <ConfirmDiscardModal
        isOpen={isDiscardChangesModalOpen}
        onDiscardHref="/authentication"
        handleClose={() => setIsDiscardChangesModalOpen(false)}
      />
      <div className="flex flex-col gap-8">
        <div className="grid w-full grid-cols-2 gap-x-12 gap-y-8">
          <div className="col-span-2 flex flex-col gap-y-4 pt-1 md:col-span-1">
            {hasManagedFields && (
              <div className="border-custom-border-200 text-custom-text-300 rounded-md border bg-layer-1 px-3 py-2 text-13">
                Some fields are managed by the Helm chart and are read-only here. Edit them in your chart values.
              </div>
            )}
            <div className="pt-2.5 text-18 font-medium">Provider-provided details for Plane</div>
            {OIDC_FORM_FIELDS.map((field) => (
              <ControllerInput
                key={field.key}
                control={control}
                type={field.type}
                name={field.key}
                label={field.label}
                description={field.description}
                placeholder={field.placeholder}
                error={field.error}
                required={field.required}
                disabled={isManaged(field.key)}
              />
            ))}
            <div className="flex items-center justify-between gap-1">
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-medium">Trust provider email addresses</h4>
                <p className="text-xs text-custom-text-300">
                  Skip the email_verified check. Enable this only for a single trusted tenant (for example single-tenant
                  Entra, which often omits the claim).
                </p>
              </div>
              <div className="relative shrink-0">
                <Controller
                  control={control}
                  name="OIDC_TRUST_EMAIL"
                  render={({ field: { value, onChange } }) => (
                    <ToggleSwitch
                      value={value === "1"}
                      onChange={() => onChange(value === "1" ? "0" : "1")}
                      size="sm"
                      disabled={isManaged("OIDC_TRUST_EMAIL")}
                    />
                  )}
                />
              </div>
            </div>
            <ControllerSwitch
              control={control}
              field={OIDC_FORM_SWITCH_FIELD}
              disabled={isManaged("ENABLE_OIDC_SYNC")}
            />
            <div className="pt-2.5 text-18 font-medium">Advanced (optional)</div>
            <p className="text-xs text-custom-text-300 -mt-2">
              Discovery from the issuer URL covers these for most providers. Set them only to override the discovery
              document or for a provider that does not publish one.
            </p>
            {OIDC_ADVANCED_FIELDS.map((field) => (
              <ControllerInput
                key={field.key}
                control={control}
                type={field.type}
                name={field.key}
                label={field.label}
                description={field.description}
                placeholder={field.placeholder}
                error={field.error}
                required={field.required}
                disabled={isManaged(field.key)}
              />
            ))}
            <div className="flex flex-col gap-1 pt-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={(e) => void handleSubmit(onSubmit)(e)}
                  loading={isSubmitting}
                  disabled={!isDirty}
                >
                  {isSubmitting ? "Saving" : "Save changes"}
                </Button>
                <Link href="/authentication" className={getButtonStyling("secondary", "lg")} onClick={handleGoBack}>
                  Go back
                </Link>
              </div>
            </div>
          </div>
          <div className="col-span-2 md:col-span-1">
            <div className="flex flex-col gap-y-4 rounded-lg bg-layer-1 px-6 pt-1.5 pb-4">
              <div className="pt-2 text-18 font-medium">Plane-provided details for your provider</div>
              {OIDC_SERVICE_FIELD.map((field) => (
                <CopyField key={field.key} label={field.label} url={field.url} description={field.description} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
