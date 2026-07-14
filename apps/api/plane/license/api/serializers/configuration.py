# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from .base import BaseSerializer
from plane.license.models import InstanceConfiguration
from plane.license.utils.encryption import decrypt_data
from plane.license.utils.instance_value import get_managed_configuration_keys


class InstanceConfigurationSerializer(BaseSerializer):
    # True when the key is reconciled by the Helm chart, so the UI shows it
    # read-only (edits are ignored server-side and reverted on the next deploy).
    is_managed = serializers.SerializerMethodField()

    class Meta:
        model = InstanceConfiguration
        fields = "__all__"

    def get_is_managed(self, instance):
        return instance.key in get_managed_configuration_keys()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Decrypt secrets value
        if instance.is_encrypted and instance.value is not None:
            data["value"] = decrypt_data(instance.value)

        return data
