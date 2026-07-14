from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0124_pagecomment"),
        ("db", "0125_default_issue_type_data"),
    ]

    operations = [
        migrations.CreateModel(
            name="PageCommentReaction",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("reaction", models.TextField()),
                (
                    "actor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_comment_reactions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "comment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_comment_reactions",
                        to="db.pagecomment",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_page_comment_reactions",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Page Comment Reaction",
                "verbose_name_plural": "Page Comment Reactions",
                "db_table": "page_comment_reactions",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="pagecommentreaction",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("comment", "actor", "reaction"),
                name="page_comment_reaction_unique_when_deleted_at_null",
            ),
        ),
    ]
