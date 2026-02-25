"""List elevated-access users for local admin sanity checks.

Usage:
    ../.venv/bin/python backend/scripts/list_admins.py
"""

from __future__ import annotations

from app.db.session import SessionLocal
from app.models.user import User


ELEVATED_ROLES = {"admin", "moderator"}


def main() -> int:
    """Print users with elevated roles and return process exit code."""

    db = SessionLocal()
    try:
        users = (
            db.query(User)
            .filter(User.role.in_(tuple(ELEVATED_ROLES)))
            .order_by(User.role.asc(), User.email.asc())
            .all()
        )

        if not users:
            print("No admin/moderator users found.")
            return 0

        print("Elevated users:")
        for user in users:
            print(
                f"- {user.email} | role={user.role} | status={user.status}"
            )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
