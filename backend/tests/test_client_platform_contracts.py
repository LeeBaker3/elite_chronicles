from datetime import datetime, timedelta, timezone

from app.models.session import Session as DbSession
from app.models.ship import Ship
from app.models.user import User
from app.services.auth_service import hash_password


def test_players_me_rejects_malformed_bearer_header(client):
    response = client.get(
        "/api/players/me",
        headers={"Authorization": "Token not-a-bearer-token"},
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "unauthorized"
    assert payload["error"]["message"] == "Invalid authorization"


def test_players_me_rejects_invalid_token(client):
    response = client.get(
        "/api/players/me",
        headers={"Authorization": "Bearer definitely-invalid"},
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "unauthorized"
    assert payload["error"]["message"] == "Invalid token"


def test_players_me_rejects_expired_session(client, db_session):
    user = User(
        email="expired@example.com",
        username="expired",
        password_hash=hash_password("pilot123"),
        status="active",
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        DbSession(
            id="expired-session-token",
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
    )
    db_session.commit()

    response = client.get(
        "/api/players/me",
        headers={"Authorization": "Bearer expired-session-token"},
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "unauthorized"
    assert payload["error"]["message"] == "Session expired"


def test_players_me_exposes_primary_ship_id(client, db_session):
    user = User(
        email="primaryship@example.com",
        username="primaryship",
        password_hash=hash_password("pilot123"),
        status="active",
    )
    db_session.add(user)
    db_session.flush()

    db_session.add_all(
        [
            Ship(
                owner_user_id=user.id,
                name="Alpha",
                hull_max=100,
                hull_current=100,
                shields_max=50,
                shields_current=50,
                energy_cap=60,
                energy_current=60,
                fuel_cap=100,
                fuel_current=100,
                cargo_capacity=40,
                status="docked",
            ),
            Ship(
                owner_user_id=user.id,
                name="Bravo",
                hull_max=100,
                hull_current=100,
                shields_max=50,
                shields_current=50,
                energy_cap=60,
                energy_current=60,
                fuel_cap=100,
                fuel_current=100,
                cargo_capacity=40,
                status="docked",
            ),
        ]
    )
    db_session.add(
        DbSession(
            id="primary-ship-session",
            user_id=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
    )
    db_session.commit()

    response = client.get(
        "/api/players/me",
        headers={"Authorization": "Bearer primary-ship-session"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["primary_ship_id"] is not None
    assert payload["primary_ship_id"] > 0
