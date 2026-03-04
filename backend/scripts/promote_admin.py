"""Promote an existing user to an elevated role for local admin testing.

Usage:
    ../.venv/bin/python backend/scripts/promote_admin.py --email user@example.com
"""

from __future__ import annotations

import argparse
import sys

from app.db.session import SessionLocal
from app.models.user import User


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for user promotion."""

    parser = argparse.ArgumentParser(
        description="Promote or update a user role for local admin testing.",
    )
    parser.add_argument(
        "--email",
        required=True,
        help="Target user email.",
    )
    parser.add_argument(
        "--role",
        default="admin",
        choices=["user", "moderator", "admin"],
        help="Role to apply (default: admin).",
    )
    parser.add_argument(
        "--activate",
        action="store_true",
        help="Set user status to active while updating role.",
    )
    return parser.parse_args()


def main() -> int:
    """Update the target user's role and optional status."""

    args = parse_args()
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.email == args.email).first()
        if user is None:
            print(f"User not found: {args.email}")
            return 1

        user.role = args.role
        if args.activate:
            user.status = "active"

        db.commit()
        db.refresh(user)

        print(
            "Updated user "
            f"{user.email}: role={user.role}, status={user.status}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
