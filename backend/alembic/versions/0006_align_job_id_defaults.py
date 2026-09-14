"""add server-side defaults to jobs and job_matches id columns

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-14
"""

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

TABLES = ("jobs", "job_matches")


def upgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table,
            "id",
            server_default=sa.text("gen_random_uuid()"),
            existing_type=sa.Uuid(),
            existing_nullable=False,
        )


def downgrade() -> None:
    for table in TABLES:
        op.alter_column(
            table,
            "id",
            server_default=None,
            existing_type=sa.Uuid(),
            existing_nullable=False,
        )