/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { getFallbackAvatarColors, getFallbackAvatarInitials } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

type Props = {
  logo: string | null | undefined;
  name: string | undefined;
  classNames?: string;
};

export const WorkspaceLogo = observer(function WorkspaceLogo(props: Props) {
  // translation
  const { t } = useTranslation();
  const hasLogo = Boolean(props.logo && props.logo !== "");
  const fallbackColors = getFallbackAvatarColors(props.name ?? "");

  return (
    <div
      className={cn(
        "relative grid h-6 w-6 flex-shrink-0 place-items-center uppercase",
        !hasLogo && "rounded-md",
        props.classNames
      )}
      style={!hasLogo ? { backgroundColor: fallbackColors.backgroundColor, color: fallbackColors.color } : undefined}
    >
      {hasLogo ? (
        <img
          src={getFileURL(props.logo as string)}
          className="absolute top-0 left-0 h-full w-full rounded-md object-cover"
          alt={t("aria_labels.projects_sidebar.workspace_logo")}
        />
      ) : (
        getFallbackAvatarInitials(props.name)
      )}
    </div>
  );
});
