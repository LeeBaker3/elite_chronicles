"""add comms channel read state table

Revision ID: 0005_comms_channel_reads
Revises: 0004_missions_reputation
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_comms_channel_reads"
down_revision = "0004_missions_reputation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comms_channel_reads",
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel_id", sa.Text(), nullable=False),
        sa.Column("last_read_message_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("user_id", "channel_id"),
    )
    op.create_index(
        "comms_channel_reads_user_id_idx",
        "comms_channel_reads",
        ["user_id"],
    )
    op.create_index(
        "comms_channel_reads_channel_id_idx",
        "comms_channel_reads",
        ["channel_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "comms_channel_reads_channel_id_idx",
        table_name="comms_channel_reads",
    )
    op.drop_index(
        "comms_channel_reads_user_id_idx",
        table_name="comms_channel_reads",
    )
    op.drop_table("comms_channel_reads")
