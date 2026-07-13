# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.core.management import call_command

from plane.license.models import InstanceConfiguration
from plane.license.utils.encryption import decrypt_data


@pytest.mark.unit
@pytest.mark.django_db
class TestReconcileInstanceConfig:
    """Unit tests for the reconcile_instance_config management command"""

    def test_no_managed_keys_is_noop(self, monkeypatch):
        monkeypatch.delenv("PROVISION_MANAGED_KEYS", raising=False)
        call_command("reconcile_instance_config")
        assert InstanceConfiguration.objects.count() == 0

    def test_creates_plain_and_encrypted_rows(self, monkeypatch):
        monkeypatch.setenv("PROVISION_MANAGED_KEYS", "OIDC_ISSUER,OIDC_CLIENT_SECRET")
        monkeypatch.setenv("OIDC_ISSUER", "https://issuer.example.com")
        monkeypatch.setenv("OIDC_CLIENT_SECRET", "s3cret")

        call_command("reconcile_instance_config")

        issuer = InstanceConfiguration.objects.get(key="OIDC_ISSUER")
        assert issuer.value == "https://issuer.example.com"
        assert issuer.is_encrypted is False
        assert issuer.category == "OIDC"

        secret = InstanceConfiguration.objects.get(key="OIDC_CLIENT_SECRET")
        assert secret.is_encrypted is True
        assert secret.value != "s3cret"
        assert decrypt_data(secret.value) == "s3cret"

    def test_skips_managed_key_without_env(self, monkeypatch):
        monkeypatch.setenv("PROVISION_MANAGED_KEYS", "OIDC_ISSUER")
        monkeypatch.delenv("OIDC_ISSUER", raising=False)

        call_command("reconcile_instance_config")

        assert not InstanceConfiguration.objects.filter(key="OIDC_ISSUER").exists()

    def test_reconciles_drift(self, monkeypatch):
        InstanceConfiguration.objects.create(key="OIDC_ISSUER", value="https://old.example.com", category="OIDC")

        monkeypatch.setenv("PROVISION_MANAGED_KEYS", "OIDC_ISSUER")
        monkeypatch.setenv("OIDC_ISSUER", "https://new.example.com")

        call_command("reconcile_instance_config")

        issuer = InstanceConfiguration.objects.get(key="OIDC_ISSUER")
        assert issuer.value == "https://new.example.com"

    def test_no_write_when_unchanged(self, monkeypatch):
        monkeypatch.setenv("PROVISION_MANAGED_KEYS", "OIDC_ISSUER")
        monkeypatch.setenv("OIDC_ISSUER", "https://issuer.example.com")
        call_command("reconcile_instance_config")

        before = InstanceConfiguration.objects.get(key="OIDC_ISSUER").updated_at
        call_command("reconcile_instance_config")
        after = InstanceConfiguration.objects.get(key="OIDC_ISSUER").updated_at

        assert before == after
