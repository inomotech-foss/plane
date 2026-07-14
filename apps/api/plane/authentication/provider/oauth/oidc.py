# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlparse

import jwt
import pytz
import requests
from jwt import PyJWKClient

# Module imports
from plane.authentication.adapter.oauth import OauthAdapter
from plane.authentication.utils.instance_admin import role_grants_admin
from plane.license.utils.instance_value import get_configuration_value
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)

# Algorithms we accept for id_token signatures. Symmetric (HS*) is intentionally
# excluded: it would let anyone holding the client secret forge tokens.
ID_TOKEN_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"]

# Microsoft Graph photo-endpoint hosts (global + national clouds).
MS_GRAPH_HOSTS = frozenset(
    {
        "graph.microsoft.com",
        "graph.microsoft.us",
        "dod-graph.microsoft.us",
        "microsoftgraph.chinacloudapi.cn",
    }
)


class OIDCOAuthProvider(OauthAdapter):
    provider = "oidc"
    # OIDC requires the "openid" scope; "email profile" get the identity claims.
    default_scope = "openid email profile"
    # None until set_user_data runs: None means no admin role is configured (leave
    # membership alone), otherwise a bool for whether this login grants admin.
    instance_admin = None

    def __init__(self, request, code=None, state=None, callback=None, callback_path="/auth/oidc/callback/"):
        (
            OIDC_ISSUER,
            OIDC_CLIENT_ID,
            OIDC_CLIENT_SECRET,
            OIDC_SCOPES,
            OIDC_AUTHORIZE_URL,
            OIDC_TOKEN_URL,
            OIDC_USERINFO_URL,
            OIDC_JWKS_URL,
        ) = get_configuration_value(
            [
                {"key": "OIDC_ISSUER", "default": os.environ.get("OIDC_ISSUER")},
                {"key": "OIDC_CLIENT_ID", "default": os.environ.get("OIDC_CLIENT_ID")},
                {"key": "OIDC_CLIENT_SECRET", "default": os.environ.get("OIDC_CLIENT_SECRET")},
                {"key": "OIDC_SCOPES", "default": os.environ.get("OIDC_SCOPES", self.default_scope)},
                {"key": "OIDC_AUTHORIZE_URL", "default": os.environ.get("OIDC_AUTHORIZE_URL")},
                {"key": "OIDC_TOKEN_URL", "default": os.environ.get("OIDC_TOKEN_URL")},
                {"key": "OIDC_USERINFO_URL", "default": os.environ.get("OIDC_USERINFO_URL")},
                {"key": "OIDC_JWKS_URL", "default": os.environ.get("OIDC_JWKS_URL")},
            ]
        )

        issuer = (OIDC_ISSUER or "").strip().rstrip("/")
        # The issuer is required even when explicit endpoints are supplied: it is
        # the value the id_token `iss` claim is validated against.
        if not (issuer and OIDC_CLIENT_ID and OIDC_CLIENT_SECRET):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_NOT_CONFIGURED"],
                error_message="OIDC_NOT_CONFIGURED",
            )

        parsed = urlparse(issuer)
        if parsed.scheme not in ("https", "http"):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_NOT_CONFIGURED"],
                error_message="OIDC_NOT_CONFIGURED",  # avoid leaking details to query params
            )

        scope = (OIDC_SCOPES or "").strip() or self.default_scope
        if "openid" not in scope.split():
            scope = f"openid {scope}"

        endpoints = self.__resolve_endpoints(
            issuer=issuer,
            authorize_url=OIDC_AUTHORIZE_URL,
            token_url=OIDC_TOKEN_URL,
            userinfo_url=OIDC_USERINFO_URL,
            jwks_url=OIDC_JWKS_URL,
        )
        self.jwks_url = endpoints["jwks_uri"]
        # Prefer the issuer advertised by the discovery document; fall back to the
        # configured value when endpoints are supplied manually.
        self.expected_issuer = endpoints.get("issuer") or issuer

        # callback_path lets the god-mode flow reuse this provider with its own callback.
        redirect_uri = f"{'https' if request.is_secure() else 'http'}://{request.get_host()}{callback_path}"

        # The nonce is minted by the initiate view and stored in the session before
        # this provider is constructed; it binds the id_token to this login (replay
        # protection) and is re-read here on the callback for validation.
        self.nonce = request.session.get("nonce")

        url_params = {
            "client_id": OIDC_CLIENT_ID,
            "scope": scope,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
        }
        if self.nonce:
            url_params["nonce"] = self.nonce
        auth_url = f"{endpoints['authorization_endpoint']}?{urlencode(url_params)}"

        super().__init__(
            request,
            self.provider,
            OIDC_CLIENT_ID,
            scope,
            redirect_uri,
            auth_url,
            endpoints["token_endpoint"],
            endpoints["userinfo_endpoint"],
            OIDC_CLIENT_SECRET,
            code,
            callback=callback,
        )

    def __resolve_endpoints(self, issuer, authorize_url, token_url, userinfo_url, jwks_url):
        # Discovery is only needed for the endpoints that were not supplied explicitly.
        discovery = {}
        if not (authorize_url and token_url and jwks_url):
            discovery = self.__fetch_discovery(issuer)

        endpoints = {
            "authorization_endpoint": authorize_url or discovery.get("authorization_endpoint"),
            "token_endpoint": token_url or discovery.get("token_endpoint"),
            "userinfo_endpoint": userinfo_url or discovery.get("userinfo_endpoint"),
            "jwks_uri": jwks_url or discovery.get("jwks_uri"),
            "issuer": discovery.get("issuer"),
        }
        # userinfo is optional (identity comes from the id_token); the rest are required.
        if not (endpoints["authorization_endpoint"] and endpoints["token_endpoint"] and endpoints["jwks_uri"]):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_NOT_CONFIGURED"],
                error_message="OIDC_NOT_CONFIGURED",
            )
        return endpoints

    def __fetch_discovery(self, issuer):
        url = f"{issuer}/.well-known/openid-configuration"
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.RequestException:
            self.logger.warning("Error fetching OIDC discovery document")
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_OAUTH_PROVIDER_ERROR"],
                error_message="OIDC_OAUTH_PROVIDER_ERROR",
            )

    def set_token_data(self):
        data = {
            "grant_type": "authorization_code",
            "code": self.code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
        }
        token_response = self.get_user_token(data=data, headers={"Accept": "application/json"})
        super().set_token_data(
            {
                "access_token": token_response.get("access_token"),
                "refresh_token": token_response.get("refresh_token", None),
                "access_token_expired_at": (
                    datetime.now(tz=pytz.utc) + timedelta(seconds=token_response.get("expires_in"))
                    if token_response.get("expires_in")
                    else None
                ),
                "refresh_token_expired_at": None,
                "id_token": token_response.get("id_token", ""),
            }
        )

    def __decode_id_token(self, id_token):
        try:
            signing_key = PyJWKClient(self.jwks_url, timeout=10).get_signing_key_from_jwt(id_token)
            claims = jwt.decode(
                id_token,
                signing_key.key,
                algorithms=ID_TOKEN_ALGORITHMS,
                audience=self.client_id,
                issuer=self.expected_issuer,
                options={"require": ["exp", "iat", "sub"]},
            )
        except jwt.PyJWTError:
            self.logger.warning("Error validating OIDC id_token")
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_OAUTH_PROVIDER_ERROR"],
                error_message="OIDC_OAUTH_PROVIDER_ERROR",
            )
        # Bind the token to this login: the nonce we sent must come back unchanged.
        if self.nonce and claims.get("nonce") != self.nonce:
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_OAUTH_PROVIDER_ERROR"],
                error_message="OIDC_OAUTH_PROVIDER_ERROR",
            )
        return claims

    def __check_email_verified(self, claims):
        (OIDC_TRUST_EMAIL,) = get_configuration_value(
            [{"key": "OIDC_TRUST_EMAIL", "default": os.environ.get("OIDC_TRUST_EMAIL", "0")}]
        )
        # When the provider is a single trusted tenant (e.g. single-tenant Entra,
        # which often omits email_verified) the admin can opt into trusting its
        # emails. Otherwise fail closed: an unverified email would let an attacker
        # assert any address to take over an account (GHSA-7j95-vh8g-f365).
        if OIDC_TRUST_EMAIL == "1":
            return
        verified = claims.get("email_verified")
        if verified is True or str(verified).lower() == "true":
            return
        raise AuthenticationException(
            error_code=AUTHENTICATION_ERROR_CODES["OAUTH_PROVIDER_UNVERIFIED_EMAIL"],
            error_message="OAUTH_PROVIDER_UNVERIFIED_EMAIL",
        )

    def set_user_data(self):
        id_token = self.token_data.get("id_token")
        if not id_token:
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_OAUTH_PROVIDER_ERROR"],
                error_message="OIDC_OAUTH_PROVIDER_ERROR",
            )
        claims = self.__decode_id_token(id_token)

        # The userinfo endpoint can fill claims a slim id_token omits (name, picture).
        # Identity-bearing claims always come from the verified id_token.
        userinfo = {}
        if self.get_user_info_url():
            try:
                userinfo = self.get_user_response()
            except AuthenticationException:
                userinfo = {}

        data = {**userinfo, **claims}
        email = data.get("email") or data.get("preferred_username")
        sub = claims.get("sub")
        if not (email and sub):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_OAUTH_PROVIDER_ERROR"],
                error_message="OIDC_OAUTH_PROVIDER_ERROR",
            )
        self.__check_email_verified(data)

        # Map the provider's role claim (e.g. an Entra app role) to instance admin.
        # Read from the verified id_token claims, never the userinfo response.
        OIDC_ADMIN_CLAIM, OIDC_ADMIN_ROLE = get_configuration_value(
            [
                {"key": "OIDC_ADMIN_CLAIM", "default": os.environ.get("OIDC_ADMIN_CLAIM", "roles")},
                {"key": "OIDC_ADMIN_ROLE", "default": os.environ.get("OIDC_ADMIN_ROLE", "")},
            ]
        )
        self.instance_admin = role_grants_admin(claims, OIDC_ADMIN_CLAIM or "roles", OIDC_ADMIN_ROLE)

        # Entra's picture claim is the Graph photo endpoint, which needs a bearer
        # token; drop it so the avatar falls back to initials.
        picture = data.get("picture")
        if picture and (urlparse(picture).hostname or "").lower() in MS_GRAPH_HOSTS:
            picture = ""

        super().set_user_data(
            {
                "email": email,
                "user": {
                    "provider_id": sub,
                    "email": email,
                    "avatar": picture,
                    "first_name": data.get("given_name") or data.get("name"),
                    "last_name": data.get("family_name", ""),
                    "is_password_autoset": True,
                },
            }
        )
