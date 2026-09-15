"""create applications, application_events, and application_answers tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "applications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "resume_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("resumes.id", ondelete="SET NULL"),
        ),
        sa.Column("status", sa.String(30), server_default="SAVED", nullable=False),
        sa.Column("source", sa.String(100)),
        sa.Column("job_url", sa.String(2048), nullable=False),
        sa.Column("company", sa.String(255)),
        sa.Column("job_title", sa.String(255), nullable=False),
        sa.Column("match_score", sa.Float()),
        sa.Column(
            "application_date",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "job_url", name="uq_applications_user_job_url"),
    )
    op.create_index(op.f("ix_applications_user_id"), "applications", ["user_id"])
    op.create_index(op.f("ix_applications_job_id"), "applications", ["job_id"])
    op.create_index(op.f("ix_applications_resume_id"), "applications", ["resume_id"])

    op.create_table(
        "application_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "application_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("state", sa.String(30)),
        sa.Column("message", sa.Text()),
        sa.Column("metadata", postgresql.JSONB()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_application_events_application_id"),
        "application_events",
        ["application_id"],
    )

    op.create_table(
        "application_answers",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "application_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("intent", sa.String(50)),
        sa.Column("interaction_type", sa.String(30)),
        sa.Column("answer", sa.Text()),
        sa.Column("answer_source", sa.String(20)),
        sa.Column("confidence", sa.Float(), server_default="0", nullable=False),
        sa.Column("was_ai_generated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("user_modified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_application_answers_application_id"),
        "application_answers",
        ["application_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_application_answers_application_id"), table_name="application_answers"
    )
    op.drop_table("application_answers")
    op.drop_index(
        op.f("ix_application_events_application_id"), table_name="application_events"
    )
    op.drop_table("application_events")
    op.drop_index(op.f("ix_applications_resume_id"), table_name="applications")
    op.drop_index(op.f("ix_applications_job_id"), table_name="applications")
    op.drop_index(op.f("ix_applications_user_id"), table_name="applications")
    op.drop_table("applications")