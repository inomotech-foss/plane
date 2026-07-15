/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TNotification } from "@plane/types";

export function PageNotificationContent({ notification }: { notification: TNotification }) {
  const { triggered_by_details: triggeredBy } = notification;
  const actorName = triggeredBy?.is_bot ? triggeredBy.first_name : triggeredBy?.display_name;
  const preview = notification.message_stripped;

  return (
    <>
      <span className="font-medium text-primary">{actorName} </span>
      <span className="text-tertiary">mentioned you in a comment</span>
      {preview ? <span className="text-tertiary">: {preview}</span> : "."}
    </>
  );
}
