# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from django.utils import timezone

from plane.authentication.utils.instance_admin import role_grants_admin, sync_instance_admin
from plane.db.models import User
from plane.license.models import Instance, InstanceAdmin


def make_instance():
    return Instance.objects.create(
        instance_name="Test",
        instance_id=uuid.uuid4().hex,
        current_version="v1.0.0",
        last_checked_at=timezone.now(),
    )


def make_user(email="admin@example.com"):
    return User.objects.create(email=email, username=uuid.uuid4().hex)


@pytest.mark.unit
class TestRoleGrantsAdmin:
    def test_none_when_no_role_configured(self):
        assert role_grants_admin({"roles": ["Admin"]}, "roles", "") is None

    def test_true_when_role_in_list(self):
        assert role_grants_admin({"roles": ["User", "Admin"]}, "roles", "Admin") is True

    def test_false_when_role_absent(self):
        assert role_grants_admin({"roles": ["User"]}, "roles", "Admin") is False

    def test_string_claim_is_normalized(self):
        assert role_grants_admin({"roles": "Admin"}, "roles", "Admin") is True

    def test_false_when_claim_missing(self):
        assert role_grants_admin({}, "roles", "Admin") is False


@pytest.mark.unit
@pytest.mark.django_db
class TestSyncInstanceAdmin:
    def test_grants_admin(self):
        instance = make_instance()
        user = make_user()

        sync_instance_admin(user=user, is_admin=True)

        assert InstanceAdmin.objects.filter(instance=instance, user=user).exists()

    def test_grant_is_idempotent(self):
        make_instance()
        user = make_user()

        sync_instance_admin(user=user, is_admin=True)
        sync_instance_admin(user=user, is_admin=True)

        assert InstanceAdmin.objects.filter(user=user).count() == 1

    def test_revokes_admin(self):
        instance = make_instance()
        user = make_user()
        InstanceAdmin.objects.create(instance=instance, user=user)

        sync_instance_admin(user=user, is_admin=False)

        assert not InstanceAdmin.objects.filter(user=user).exists()

    def test_noop_without_instance(self):
        user = make_user()
        sync_instance_admin(user=user, is_admin=True)
        assert InstanceAdmin.objects.count() == 0
