from pathlib import Path

from app.core.config import settings
from app.models.world import (
    Commodity,
    Faction,
    StarSystem,
    Station,
    StationArchetype,
    StationInventory,
)
from app.models.user import User


def seed_market_state(db_session):
    faction = Faction(name="Tick Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Tick System",
        seed="tick-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=3,
        faction_id=faction.id,
    )
    db_session.add(system)
    db_session.flush()

    archetype = StationArchetype(
        name="Tick Hub",
        size_class="small",
        shape="coriolis",
        palette_json={},
        features_json={"market": True},
    )
    db_session.add(archetype)
    db_session.flush()

    station = Station(
        system_id=system.id,
        name="Tick Station",
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=3,
        ai_story_available=False,
    )
    db_session.add(station)
    db_session.flush()

    industrial = Commodity(
        name="Industrial Goods",
        category="industrial",
        base_price=100,
        volatility=0,
        illegal_flag=False,
    )
    agricultural = Commodity(
        name="Agri Goods",
        category="agricultural",
        base_price=50,
        volatility=0,
        illegal_flag=False,
    )
    db_session.add_all([industrial, agricultural])
    db_session.flush()

    row_industrial = StationInventory(
        station_id=station.id,
        commodity_id=industrial.id,
        quantity=10,
        max_capacity=100,
        buy_price=100,
        sell_price=120,
    )
    row_agri = StationInventory(
        station_id=station.id,
        commodity_id=agricultural.id,
        quantity=24,
        max_capacity=100,
        buy_price=80,
        sell_price=90,
    )
    db_session.add_all([row_industrial, row_agri])
    db_session.commit()

    return {
        "system_id": system.id,
        "station_id": station.id,
        "industrial_row_id": row_industrial.id,
        "agri_row_id": row_agri.id,
    }


def create_user_headers(client, db_session, email: str, username: str, role: str = "user"):
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "pilot123",
        },
    )
    assert response.status_code == 200
    token = response.json()["token"]

    if role != "user":
        user = db_session.query(User).filter(User.email == email).first()
        assert user is not None
        user.role = role
        db_session.commit()

    return {"Authorization": f"Bearer {token}"}


def test_market_tick_requires_admin(client, db_session):
    seed_market_state(db_session)
    user_headers = create_user_headers(
        client, db_session, "user@example.com", "user")

    response = client.post(
        "/api/markets/tick",
        json={"steps": 1},
        headers=user_headers,
    )
    assert response.status_code == 403


def test_market_tick_updates_inventory(client, db_session):
    state = seed_market_state(db_session)
    admin_headers = create_user_headers(
        client,
        db_session,
        "admin@example.com",
        "admin",
        role="admin",
    )

    response = client.post(
        "/api/markets/tick",
        json={"steps": 2, "system_id": state["system_id"]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    row = (
        db_session.query(StationInventory)
        .filter(StationInventory.id == state["industrial_row_id"])
        .first()
    )
    assert row is not None
    assert row.quantity == 12


def test_market_summary_simulation_does_not_mutate_db(client, db_session):
    state = seed_market_state(db_session)

    baseline = client.get(f"/api/markets/{state['system_id']}/summary")
    assert baseline.status_code == 200
    baseline_payload = baseline.json()
    assert baseline_payload[0]["scarcity_count"] == 2

    simulated = client.get(
        f"/api/markets/{state['system_id']}/summary?simulate_ticks=20")
    assert simulated.status_code == 200
    simulated_payload = simulated.json()
    assert simulated_payload[0]["scarcity_count"] == 0

    after_simulation = client.get(f"/api/markets/{state['system_id']}/summary")
    assert after_simulation.status_code == 200
    assert after_simulation.json()[0]["scarcity_count"] == 2

    row = (
        db_session.query(StationInventory)
        .filter(StationInventory.id == state["agri_row_id"])
        .first()
    )
    assert row is not None
    assert row.quantity == 24


def test_admin_logs_requires_admin(client, db_session):
    user_headers = create_user_headers(
        client, db_session, "pilot2@example.com", "pilot2")

    response = client.get("/api/admin/logs", headers=user_headers)
    assert response.status_code == 403


def test_admin_logs_requires_authentication(client):
    response = client.get("/api/admin/logs")
    assert response.status_code == 401


def test_admin_logs_filters_and_tail(client, db_session, tmp_path: Path):
    admin_headers = create_user_headers(
        client,
        db_session,
        "admin2@example.com",
        "admin2",
        role="admin",
    )

    original_log_dir = settings.log_dir
    settings.log_dir = str(tmp_path)
    try:
        app_log = tmp_path / "app.log"
        app_log.write_text(
            "\n".join(
                [
                    "2026-02-13 12:00:00,000 INFO api Tick completed",
                    "2026-02-13 12:00:01,000 ERROR api Tick failure",
                ]
            ),
            encoding="utf-8",
        )

        response = client.get(
            "/api/admin/logs?level=ERROR&tail=10&contains=failure&regex=Tick\\sfail",
            headers=admin_headers,
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["entries"]) == 1
        assert payload["entries"][0]["level"] == "ERROR"
        assert "failure" in payload["entries"][0]["message"].lower()
    finally:
        settings.log_dir = original_log_dir


def test_admin_logs_rejects_invalid_regex(client, db_session, tmp_path: Path):
    admin_headers = create_user_headers(
        client,
        db_session,
        "admin3@example.com",
        "admin3",
        role="admin",
    )

    original_log_dir = settings.log_dir
    settings.log_dir = str(tmp_path)
    try:
        app_log = tmp_path / "app.log"
        app_log.write_text(
            "2026-02-13 12:00:00,000 INFO api Tick completed",
            encoding="utf-8",
        )

        response = client.get(
            "/api/admin/logs?regex=([",
            headers=admin_headers,
        )
        assert response.status_code == 422
        payload = response.json()
        message = payload.get("detail") or payload.get(
            "error", {}).get("message") or ""
        assert "Invalid regex pattern" in message
    finally:
        settings.log_dir = original_log_dir


def test_admin_users_requires_authentication(client):
    response = client.get("/api/admin/users")
    assert response.status_code == 401


def test_admin_users_requires_admin(client, db_session):
    user_headers = create_user_headers(
        client, db_session, "pilot4@example.com", "pilot4")
    response = client.get("/api/admin/users", headers=user_headers)
    assert response.status_code == 403


def test_admin_users_list_and_patch(client, db_session):
    admin_headers = create_user_headers(
        client,
        db_session,
        "admin4@example.com",
        "admin4",
        role="admin",
    )
    target_headers = create_user_headers(
        client,
        db_session,
        "target@example.com",
        "target",
    )
    _ = target_headers

    users_response = client.get(
        "/api/admin/users?limit=20&offset=0", headers=admin_headers)
    assert users_response.status_code == 200
    payload = users_response.json()
    assert payload["total"] >= 2
    usernames = [entry["username"] for entry in payload["users"]]
    assert "admin4" in usernames
    assert "target" in usernames

    target_id = next(
        entry["id"] for entry in payload["users"] if entry["username"] == "target"
    )
    patch_response = client.patch(
        f"/api/admin/users/{target_id}",
        json={"role": "moderator", "status": "inactive"},
        headers=admin_headers,
    )
    assert patch_response.status_code == 200
    updated = patch_response.json()
    assert updated["role"] == "moderator"
    assert updated["status"] == "inactive"


def test_admin_users_prevents_self_lockout(client, db_session):
    admin_headers = create_user_headers(
        client,
        db_session,
        "admin5@example.com",
        "admin5",
        role="admin",
    )

    users_response = client.get("/api/admin/users", headers=admin_headers)
    assert users_response.status_code == 200
    admin_id = next(
        entry["id"]
        for entry in users_response.json()["users"]
        if entry["username"] == "admin5"
    )

    demote_response = client.patch(
        f"/api/admin/users/{admin_id}",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert demote_response.status_code == 409

    deactivate_response = client.patch(
        f"/api/admin/users/{admin_id}",
        json={"status": "inactive"},
        headers=admin_headers,
    )
    assert deactivate_response.status_code == 409


def test_admin_logs_since_cursor_filters_entries(client, db_session, tmp_path: Path):
    admin_headers = create_user_headers(
        client,
        db_session,
        "admin6@example.com",
        "admin6",
        role="admin",
    )

    original_log_dir = settings.log_dir
    settings.log_dir = str(tmp_path)
    try:
        app_log = tmp_path / "app.log"
        app_log.write_text(
            "\n".join(
                [
                    "2026-02-13 12:00:00,000 INFO api first",
                    "2026-02-13 12:00:01,000 INFO api second",
                    "2026-02-13 12:00:02,000 INFO api third",
                ]
            ),
            encoding="utf-8",
        )

        first = client.get(
            "/api/admin/logs?tail=2",
            headers=admin_headers,
        )
        assert first.status_code == 200
        first_payload = first.json()
        assert len(first_payload["entries"]) == 2
        assert first_payload["next_since"] is not None

        second = client.get(
            f"/api/admin/logs?tail=10&since={first_payload['next_since']}",
            headers=admin_headers,
        )
        assert second.status_code == 200
        second_payload = second.json()
        assert len(second_payload["entries"]) == 0
    finally:
        settings.log_dir = original_log_dir


def test_admin_logs_rejects_invalid_since_cursor(client, db_session):
    admin_headers = create_user_headers(
        client,
        db_session,
        "admin7@example.com",
        "admin7",
        role="admin",
    )

    response = client.get(
        "/api/admin/logs?since=not-a-timestamp",
        headers=admin_headers,
    )
    assert response.status_code == 422
