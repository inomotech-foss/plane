# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os

# Django imports
from django.core.management.base import BaseCommand

# Module imports
from plane.license.models import InstanceConfiguration
from plane.utils.instance_config_variables import instance_config_variables


class Command(BaseCommand):
    help = "Reconcile chart-managed instance configuration from the environment"

    def handle(self, *args, **options):
        from plane.license.utils.encryption import decrypt_data, encrypt_data

        managed_keys = [key.strip() for key in os.environ.get("PROVISION_MANAGED_KEYS", "").split(",") if key.strip()]
        if not managed_keys:
            return

        registry = {item.get("key"): item for item in instance_config_variables}

        for key in managed_keys:
            raw_value = os.environ.get(key)
            if raw_value is None:
                self.stdout.write(self.style.WARNING(f"{key} is managed but not set in the environment; skipping."))
                continue

            meta = registry.get(key, {})
            category = meta.get("category", "AUTHENTICATION")
            is_encrypted = meta.get("is_encrypted", False)

            existing = InstanceConfiguration.objects.filter(key=key).first()
            if existing is not None:
                current = (
                    decrypt_data(existing.value) if existing.is_encrypted and existing.value else existing.value
                )
                if current == raw_value and existing.category == category and existing.is_encrypted == is_encrypted:
                    continue
                existing.value = encrypt_data(raw_value) if is_encrypted else raw_value
                existing.category = category
                existing.is_encrypted = is_encrypted
                existing.save()
            else:
                InstanceConfiguration.objects.create(
                    key=key,
                    value=encrypt_data(raw_value) if is_encrypted else raw_value,
                    category=category,
                    is_encrypted=is_encrypted,
                )

            self.stdout.write(self.style.SUCCESS(f"{key} reconciled from environment."))
