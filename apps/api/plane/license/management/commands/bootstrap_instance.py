# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
import uuid

# Django imports
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

# Module imports
from plane.db.models import Profile, User
from plane.license.models import Instance, InstanceAdmin


def env_bool(name):
    value = os.environ.get(name)
    if value is None:
        return None
    return value.strip().lower() in ("1", "true", "yes", "on")


class Command(BaseCommand):
    help = "Bootstrap instance admins and settings from the environment"

    def handle(self, *args, **options):
        instance = Instance.objects.first()
        if instance is None:
            raise CommandError("Instance is not registered; run register_instance before bootstrap_instance.")

        admin_emails = [
            email.strip().lower() for email in os.environ.get("INSTANCE_ADMIN_EMAILS", "").split(",") if email.strip()
        ]

        # Lock the instance row so replicas starting together during a rollout
        # do not race on admin creation or the setup flag.
        with transaction.atomic():
            instance = Instance.objects.select_for_update().get(pk=instance.pk)

            for email in admin_emails:
                user = User.objects.filter(email=email).first()
                if user is None:
                    user = User(email=email, username=uuid.uuid4().hex)
                    user.set_password(uuid.uuid4().hex)
                    user.is_password_autoset = True
                    user.is_email_verified = True
                    user.is_active = True
                    user.save()
                    Profile.objects.get_or_create(user=user)
                    self.stdout.write(self.style.SUCCESS(f"Created SSO admin user {email}."))

                _, created = InstanceAdmin.objects.get_or_create(instance=instance, user=user)
                if created:
                    self.stdout.write(self.style.SUCCESS(f"Granted instance admin to {email}."))

            dirty = False

            instance_name = os.environ.get("INSTANCE_NAME")
            if instance_name:
                instance.instance_name = instance_name
                dirty = True

            telemetry = env_bool("INSTANCE_TELEMETRY_ENABLED")
            if telemetry is not None:
                instance.is_telemetry_enabled = telemetry
                dirty = True

            # Skip the interactive setup wizard once an admin exists, or when
            # requested explicitly (admins may be assigned via an OIDC role
            # instead of an email list, so there is no admin to key off yet).
            setup_done = env_bool("INSTANCE_SETUP_DONE")
            if not instance.is_setup_done and (setup_done or InstanceAdmin.objects.exists()):
                instance.is_setup_done = True
                dirty = True

            if dirty:
                instance.save()
