# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from plane.db.models import Profile, User
from plane.license.models import Instance, InstanceAdmin


def make_instance():
    return Instance.objects.create(
        instance_name="Test",
        instance_id=uuid.uuid4().hex,
        current_version="v1.0.0",
        last_checked_at=timezone.now(),
    )


@pytest.mark.unit
@pytest.mark.django_db
class TestBootstrapInstance:
    """Unit tests for the bootstrap_instance management command"""

    def test_errors_without_instance(self, monkeypatch):
        monkeypatch.setenv("INSTANCE_ADMIN_EMAILS", "admin@example.com")
        with pytest.raises(CommandError):
            call_command("bootstrap_instance")
        assert InstanceAdmin.objects.count() == 0
        assert User.objects.count() == 0

    def test_creates_sso_admin(self, monkeypatch):
        instance = make_instance()
        monkeypatch.setenv("INSTANCE_ADMIN_EMAILS", "admin@example.com")

        call_command("bootstrap_instance")

        user = User.objects.get(email="admin@example.com")
        assert user.is_password_autoset is True
        assert user.is_email_verified is True
        assert user.is_active is True
        assert Profile.objects.filter(user=user).exists()
        assert InstanceAdmin.objects.filter(instance=instance, user=user).exists()

        instance.refresh_from_db()
        assert instance.is_setup_done is True

    def test_promotes_existing_password_user_without_touching_password(self, monkeypatch):
        make_instance()
        user = User.objects.create(email="existing@example.com", username=uuid.uuid4().hex)
        user.set_password("keep-me")
        user.is_password_autoset = False
        user.save()

        monkeypatch.setenv("INSTANCE_ADMIN_EMAILS", "existing@example.com")
        call_command("bootstrap_instance")

        user.refresh_from_db()
        assert user.is_password_autoset is False
        assert user.check_password("keep-me")
        assert InstanceAdmin.objects.filter(user=user).exists()

    def test_applies_instance_settings(self, monkeypatch):
        instance = make_instance()
        monkeypatch.setenv("INSTANCE_ADMIN_EMAILS", "admin@example.com")
        monkeypatch.setenv("INSTANCE_NAME", "Acme Plane")
        monkeypatch.setenv("INSTANCE_TELEMETRY_ENABLED", "false")

        call_command("bootstrap_instance")

        instance.refresh_from_db()
        assert instance.instance_name == "Acme Plane"
        assert instance.is_telemetry_enabled is False

    def test_idempotent(self, monkeypatch):
        make_instance()
        monkeypatch.setenv("INSTANCE_ADMIN_EMAILS", "admin@example.com")

        call_command("bootstrap_instance")
        call_command("bootstrap_instance")

        assert InstanceAdmin.objects.filter(user__email="admin@example.com").count() == 1
        assert User.objects.filter(email="admin@example.com").count() == 1

    def test_no_admin_leaves_setup_incomplete(self, monkeypatch):
        instance = make_instance()
        monkeypatch.delenv("INSTANCE_ADMIN_EMAILS", raising=False)
        monkeypatch.delenv("INSTANCE_SETUP_DONE", raising=False)

        call_command("bootstrap_instance")

        instance.refresh_from_db()
        assert instance.is_setup_done is False
        assert InstanceAdmin.objects.count() == 0

    def test_setup_done_flag_without_admins(self, monkeypatch):
        instance = make_instance()
        monkeypatch.delenv("INSTANCE_ADMIN_EMAILS", raising=False)
        monkeypatch.setenv("INSTANCE_SETUP_DONE", "1")

        call_command("bootstrap_instance")

        instance.refresh_from_db()
        assert instance.is_setup_done is True
        assert InstanceAdmin.objects.count() == 0
