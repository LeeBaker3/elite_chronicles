"""add ship operations log table

Revision ID: 0003_ship_operations_log
Revises: 0002_comms_messages
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_ship_operations_log"
down_revision = "0002_comms_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ship_operations_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "ship_id",
            sa.BigInteger(),
            sa.ForeignKey("ships.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("operation", sa.Text(), nullable=False),
        sa.Column("cost_credits", sa.BigInteger(),
                  nullable=False, server_default="0"),
        sa.Column("credits_after", sa.BigInteger(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ship_operations_log_ship_id_idx",
                    "ship_operations_log", ["ship_id"])
    op.create_index("ship_operations_log_user_id_idx",
                    "ship_operations_log", ["user_id"])


def downgrade() -> None:
    op.drop_index("ship_operations_log_user_id_idx",
                  table_name="ship_operations_log")
    op.drop_index("ship_operations_log_ship_id_idx",
                  table_name="ship_operations_log")
    op.drop_table("ship_operations_log")
