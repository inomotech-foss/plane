# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from django.urls import reverse
from django.utils import timezone

from plane.license.models import Instance, InstanceAdmin, InstanceConfiguration


@pytest.fixture
def instance_admin_client(api_client, create_user):
    instance = Instance.objects.create(
        instance_name="Test",
        instance_id=uuid.uuid4().hex,
        current_version="v1.0.0",
        last_checked_at=timezone.now(),
    )
    InstanceAdmin.objects.create(instance=instance, user=create_user)
    api_client.force_authenticate(user=create_user)
    return api_client


@pytest.mark.unit
@pytest.mark.django_db
class TestManagedInstanceConfiguration:
    def test_get_flags_managed_keys(self, instance_admin_client, monkeypatch):
        monkeypatch.setenv("PROVISION_MANAGED_KEYS", "OIDC_ISSUER")
        InstanceConfiguration.objects.create(key="OIDC_ISSUER", value="https://issuer", category="OIDC")
        InstanceConfiguration.objects.create(key="ENABLE_MAGIC_LINK_LOGIN", value="1", category="AUTHENTICATION")

        response = instance_admin_client.get(reverse("instance-configuration"))
        assert response.status_code == 200

        managed = {item["key"]: item["is_managed"] for item in response.data}
        assert managed["OIDC_ISSUER"] is True
        assert managed["ENABLE_MAGIC_LINK_LOGIN"] is False

    def test_patch_ignores_managed_keys(self, instance_admin_client, monkeypatch):
        monkeypatch.setenv("PROVISION_MANAGED_KEYS", "OIDC_ISSUER")
        InstanceConfiguration.objects.create(key="OIDC_ISSUER", value="https://issuer", category="OIDC")
        InstanceConfiguration.objects.create(key="ENABLE_MAGIC_LINK_LOGIN", value="0", category="AUTHENTICATION")

        response = instance_admin_client.patch(
            reverse("instance-configuration"),
            data={"OIDC_ISSUER": "https://evil", "ENABLE_MAGIC_LINK_LOGIN": "1"},
            format="json",
        )
        assert response.status_code == 200

        assert InstanceConfiguration.objects.get(key="OIDC_ISSUER").value == "https://issuer"
        assert InstanceConfiguration.objects.get(key="ENABLE_MAGIC_LINK_LOGIN").value == "1"
