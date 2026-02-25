"""add comms messages table

Revision ID: 0002_comms_messages
Revises: 0001_initial
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_comms_messages"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comms_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel_id", sa.Text(), nullable=False),
        sa.Column("author", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("direction", sa.Text(), nullable=False),
        sa.Column("delivery", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )
    op.create_index("comms_messages_user_id_idx",
                    "comms_messages", ["user_id"])
    op.create_index(
        "comms_messages_channel_id_idx",
        "comms_messages",
        ["channel_id"],
    )


def downgrade() -> None:
    op.drop_index("comms_messages_channel_id_idx", table_name="comms_messages")
    op.drop_index("comms_messages_user_id_idx", table_name="comms_messages")
    op.drop_table("comms_messages")
