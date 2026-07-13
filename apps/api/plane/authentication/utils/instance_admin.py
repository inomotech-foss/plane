# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction

# Module imports
from plane.license.models import Instance, InstanceAdmin


def role_grants_admin(claims, claim_name, role):
    """Return whether the token claims grant instance admin.

    Returns None when no admin role is configured (the caller should then leave
    membership untouched), otherwise a bool for whether the configured role is
    present in the claim.
    """
    if not role:
        return None
    values = claims.get(claim_name)
    if values is None:
        values = []
    elif isinstance(values, str):
        values = [values]
    return role in values


def sync_instance_admin(user, is_admin):
    """Full-sync a user's InstanceAdmin membership to match is_admin."""
    instance = Instance.objects.first()
    if instance is None:
        return
    with transaction.atomic():
        if is_admin:
            InstanceAdmin.objects.get_or_create(instance=instance, user=user)
        else:
            InstanceAdmin.objects.filter(instance=instance, user=user).delete()
