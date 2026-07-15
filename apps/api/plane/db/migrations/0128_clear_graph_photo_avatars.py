from urllib.parse import urlparse

from django.db import migrations
from django.db.models import Q

# Kept in sync with MS_GRAPH_HOSTS in
# plane/authentication/provider/oauth/oidc.py; inlined so the migration stays
# self-contained.
MS_GRAPH_HOSTS = {
    "graph.microsoft.com",
    "graph.microsoft.us",
    "dod-graph.microsoft.us",
    "microsoftgraph.chinacloudapi.cn",
}


def clear_graph_photo_avatars(apps, schema_editor):
    """Clear Entra Graph photo URLs stored as avatars before the login-side fix.

    These URLs point at the Graph /me/photo endpoint, which needs a bearer token,
    so the browser can't load them (they abort / are blocked). Clearing the field
    falls the avatar back to initials, matching what new logins now store.
    """
    User = apps.get_model("db", "User")
    candidates = User.objects.exclude(avatar="").filter(
        Q(avatar__icontains="graph.microsoft") | Q(avatar__icontains="microsoftgraph")
    )
    to_update = []
    for user in candidates.iterator():
        if (urlparse(user.avatar).hostname or "").lower() in MS_GRAPH_HOSTS:
            user.avatar = ""
            to_update.append(user)
    if to_update:
        User.objects.bulk_update(to_update, ["avatar"], batch_size=500)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0127_fileasset_page_comment"),
    ]

    operations = [
        migrations.RunPython(clear_graph_photo_avatars, migrations.RunPython.noop),
    ]
