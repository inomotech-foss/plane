# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import base64

# Third party imports
import requests

GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
LOGIN_BASE_URL = "https://login.microsoftonline.com"

# Direct attachment POSTs are capped at ~3 MB by Graph; larger files go
# through an upload session in chunks that must be multiples of 320 KiB.
DIRECT_ATTACHMENT_LIMIT = 2_500_000
UPLOAD_SESSION_CHUNK_SIZE = 327_680 * 10

MESSAGE_SELECT_FIELDS = ",".join(
    [
        "id",
        "subject",
        "body",
        "from",
        "toRecipients",
        "ccRecipients",
        "conversationId",
        "internetMessageId",
        "receivedDateTime",
        "hasAttachments",
    ]
)


class MSGraphError(Exception):
    def __init__(self, message, status_code=None, response_text=None):
        self.status_code = status_code
        self.response_text = response_text
        if status_code is not None:
            message = f"{message} (status {status_code}): {response_text}"
        super().__init__(message)


class MSGraphMailClient:
    """Minimal Microsoft Graph mail client using the client-credentials flow.

    Requires an Azure app registration with application permissions
    Mail.ReadWrite and Mail.Send (ideally scoped to the service mailboxes via
    an application access policy).
    """

    def __init__(self, tenant_id, client_id, client_secret, timeout=30):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout
        self._access_token = None

    def _get_access_token(self):
        if self._access_token:
            return self._access_token
        response = requests.post(
            f"{LOGIN_BASE_URL}/{self.tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "scope": "https://graph.microsoft.com/.default",
            },
            timeout=self.timeout,
        )
        if not response.ok:
            raise MSGraphError(
                "Failed to acquire MS Graph access token",
                response.status_code,
                response.text[:500],
            )
        self._access_token = response.json().get("access_token")
        if not self._access_token:
            raise MSGraphError("MS Graph token response did not contain an access token")
        return self._access_token

    def _request(self, method, path, params=None, json_body=None, headers=None):
        request_headers = {"Authorization": f"Bearer {self._get_access_token()}"}
        if headers:
            request_headers.update(headers)
        response = requests.request(
            method,
            f"{GRAPH_BASE_URL}{path}",
            params=params,
            json=json_body,
            headers=request_headers,
            timeout=self.timeout,
        )
        if not response.ok:
            raise MSGraphError(
                f"MS Graph request {method} {path} failed",
                response.status_code,
                response.text[:500],
            )
        return response

    def list_unread_messages(self, mailbox, top=50):
        response = self._request(
            "GET",
            f"/users/{mailbox}/mailFolders/inbox/messages",
            params={
                "$filter": "isRead eq false",
                "$orderby": "receivedDateTime asc",
                "$top": top,
                "$select": MESSAGE_SELECT_FIELDS,
            },
            headers={"Prefer": 'outlook.body-content-type="text"'},
        )
        return response.json().get("value", [])

    def mark_message_read(self, mailbox, message_id):
        self._request(
            "PATCH",
            f"/users/{mailbox}/messages/{message_id}",
            json_body={"isRead": True},
        )

    def list_message_attachments(self, mailbox, message_id):
        """Attachment metadata only — bytes are fetched per attachment."""
        response = self._request(
            "GET",
            f"/users/{mailbox}/messages/{message_id}/attachments",
            params={"$select": "id,name,contentType,size,isInline,contentId"},
        )
        return response.json().get("value", [])

    def download_attachment(self, mailbox, message_id, attachment_id):
        response = self._request(
            "GET",
            f"/users/{mailbox}/messages/{message_id}/attachments/{attachment_id}/$value",
        )
        return response.content

    def create_reply_draft(self, mailbox, message_id):
        response = self._request("POST", f"/users/{mailbox}/messages/{message_id}/createReply")
        return response.json()

    def update_message(self, mailbox, message_id, payload):
        response = self._request("PATCH", f"/users/{mailbox}/messages/{message_id}", json_body=payload)
        return response.json()

    def add_attachment(self, mailbox, message_id, name, content_type, content, is_inline=False, content_id=None):
        if len(content) > DIRECT_ATTACHMENT_LIMIT:
            self._add_large_attachment(mailbox, message_id, name, content_type, content, is_inline, content_id)
            return
        attachment = {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": name,
            "contentType": content_type,
            "contentBytes": base64.b64encode(content).decode("ascii"),
            "isInline": is_inline,
        }
        if content_id:
            attachment["contentId"] = content_id
        self._request("POST", f"/users/{mailbox}/messages/{message_id}/attachments", json_body=attachment)

    def _add_large_attachment(self, mailbox, message_id, name, content_type, content, is_inline, content_id):
        attachment_item = {
            "attachmentType": "file",
            "name": name,
            "size": len(content),
            "isInline": is_inline,
        }
        if content_type:
            attachment_item["contentType"] = content_type
        if content_id:
            attachment_item["contentId"] = content_id
        response = self._request(
            "POST",
            f"/users/{mailbox}/messages/{message_id}/attachments/createUploadSession",
            json_body={"AttachmentItem": attachment_item},
        )
        upload_url = response.json().get("uploadUrl")
        if not upload_url:
            raise MSGraphError("Attachment upload session did not return an upload URL")
        for start in range(0, len(content), UPLOAD_SESSION_CHUNK_SIZE):
            end = min(start + UPLOAD_SESSION_CHUNK_SIZE, len(content))
            # The upload URL is pre-authenticated; no Authorization header.
            chunk_response = requests.put(
                upload_url,
                data=content[start:end],
                headers={
                    "Content-Length": str(end - start),
                    "Content-Range": f"bytes {start}-{end - 1}/{len(content)}",
                },
                timeout=self.timeout,
            )
            if not chunk_response.ok:
                raise MSGraphError(
                    "Attachment upload session chunk failed",
                    chunk_response.status_code,
                    chunk_response.text[:500],
                )

    def send_draft(self, mailbox, message_id):
        self._request("POST", f"/users/{mailbox}/messages/{message_id}/send")

    def create_subscription(self, mailbox, notification_url, client_state, expiration):
        """Subscribe to change notifications for new messages in the inbox.

        Graph validates notification_url synchronously (the receiver must echo
        the validationToken), so the endpoint has to be publicly reachable.
        """
        response = self._request(
            "POST",
            "/subscriptions",
            json_body={
                "changeType": "created",
                "notificationUrl": notification_url,
                "resource": f"/users/{mailbox}/mailFolders('inbox')/messages",
                "expirationDateTime": expiration,
                "clientState": client_state,
            },
        )
        return response.json()

    def renew_subscription(self, subscription_id, expiration):
        response = self._request(
            "PATCH",
            f"/subscriptions/{subscription_id}",
            json_body={"expirationDateTime": expiration},
        )
        return response.json()

    def delete_subscription(self, subscription_id):
        self._request("DELETE", f"/subscriptions/{subscription_id}")
