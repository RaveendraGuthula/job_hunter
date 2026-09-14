"""add gen_random_uuid() server defaults to profile table ids

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-12

Reconciles profiles/skills/experience/education/preferences tables that were
created outside alembic (via ORM create_all) so their id columns match the
server_default declared by migration 0002. Non-destructive: only adds a column
default.
"""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

TABLES = ("profiles", "skills", "experience", "education", "preferences")


def upgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table,
            "id",
            server_default=sa.text("gen_random_uuid()"),
        )


def downgrade() -> None:
    for table in TABLES:
        op.alter_column(table, "id", server_default=None)