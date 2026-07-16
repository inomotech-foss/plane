# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for refreshing profile data from the provider on login."""

import hashlib
import uuid
from unittest.mock import patch

import pytest
from django.test import RequestFactory

from plane.authentication.adapter.base import Adapter
from plane.db.models import FileAsset, Profile, User


class _FakeAdapter(Adapter):
    """Adapter that returns pre-baked user data, like an OAuth provider."""

    def __init__(self, request, provider, user_data):
        super().__init__(request=request, provider=provider)
        self.user_data = user_data
        self.token_data = None  # skip account creation

    def get_persistable_avatar_url(self, avatar_url):
        return ""


@pytest.fixture
def request_obj():
    return RequestFactory().get("/", HTTP_USER_AGENT="pytest")


def _make_user(email):
    user = User.objects.create(email=email, username=uuid.uuid4().hex)
    Profile.objects.create(user=user)
    return user


def _user_data(email, **user_fields):
    user = {
        "provider_id": "sub",
        "email": email,
        "first_name": "",
        "last_name": "",
        "display_name": "",
        "avatar": "",
        "is_password_autoset": True,
    }
    user.update(user_fields)
    return {"email": email, "user": user}


def _avatar_asset(user, source_hash, asset_name):
    return FileAsset.objects.create(
        attributes={"source_hash": source_hash},
        asset=asset_name,
        size=1,
        user=user,
        created_by=user,
        entity_type=FileAsset.EntityTypeContext.USER_AVATAR,
        is_uploaded=True,
    )


@pytest.mark.contract
class TestLoginProfileRefresh:
    @pytest.mark.django_db
    @patch("plane.authentication.adapter.base.user_activation_email")
    def test_oidc_login_refreshes_name_and_display_by_default(self, _email, request_obj):
        user = _make_user("returning@plane.so")
        user.first_name, user.last_name, user.display_name = "Old", "Name", "Old Name"
        user.save()

        adapter = _FakeAdapter(
            request_obj,
            provider="oidc",
            user_data=_user_data("returning@plane.so", first_name="New", last_name="Name", display_name="New Name"),
        )
        result = adapter.complete_login_or_signup()
        result.refresh_from_db()
        assert (result.first_name, result.last_name, result.display_name) == ("New", "Name", "New Name")

    @pytest.mark.django_db
    @patch("plane.authentication.adapter.base.user_activation_email")
    def test_non_oidc_login_does_not_sync_by_default(self, _email, request_obj):
        user = _make_user("google@plane.so")
        user.first_name = "Old"
        user.save()

        adapter = _FakeAdapter(
            request_obj, provider="google", user_data=_user_data("google@plane.so", first_name="New")
        )
        result = adapter.complete_login_or_signup()
        result.refresh_from_db()
        assert result.first_name == "Old"


@pytest.mark.contract
class TestLoginAvatarRefresh:
    @pytest.mark.django_db
    @patch("plane.authentication.adapter.base.user_activation_email")
    def test_unchanged_avatar_is_not_reuploaded(self, _email, request_obj):
        content = b"image-bytes"
        source_hash = hashlib.sha256(content).hexdigest()
        user = _make_user("avatar@plane.so")
        asset = _avatar_asset(user, source_hash, "existing-avatar.png")
        user.avatar_asset = asset
        user.save()

        adapter = _FakeAdapter(
            request_obj, provider="oidc", user_data=_user_data("avatar@plane.so", avatar="https://idp/pic")
        )
        with (
            patch.object(Adapter, "_fetch_avatar_bytes", return_value=(content, "image/png", "png")),
            patch.object(Adapter, "_store_avatar") as store,
            patch.object(Adapter, "delete_old_avatar") as delete,
        ):
            result = adapter.complete_login_or_signup()

        store.assert_not_called()
        delete.assert_not_called()
        result.refresh_from_db()
        assert result.avatar_asset_id == asset.id

    @pytest.mark.django_db
    @patch("plane.authentication.adapter.base.user_activation_email")
    def test_changed_avatar_swaps_asset(self, _email, request_obj):
        user = _make_user("avatar2@plane.so")
        old_asset = _avatar_asset(user, "old-hash", "old-avatar.png")
        user.avatar_asset = old_asset
        user.save()

        new_content = b"new-image"
        new_asset = _avatar_asset(user, hashlib.sha256(new_content).hexdigest(), "new-avatar.png")

        adapter = _FakeAdapter(
            request_obj, provider="oidc", user_data=_user_data("avatar2@plane.so", avatar="https://idp/pic")
        )
        with (
            patch.object(Adapter, "_fetch_avatar_bytes", return_value=(new_content, "image/png", "png")),
            patch.object(Adapter, "_store_avatar", return_value=new_asset) as store,
            patch.object(Adapter, "delete_old_avatar") as delete,
        ):
            result = adapter.complete_login_or_signup()

        store.assert_called_once()
        delete.assert_called_once()
        result.refresh_from_db()
        assert result.avatar_asset_id == new_asset.id
