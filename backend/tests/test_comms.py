from datetime import datetime, timedelta, timezone

from app.models.comms import CommsMessage as DbCommsMessage
from app.models.user import User
from app.models.world import Faction, StarSystem, Station, StationArchetype


def _seed_station(db_session, name: str) -> int:
    """Create a station graph and return station id."""

    faction = Faction(name="Comms Faction",
                      alignment="neutral", reputation_scale=0)
    db_session.add(faction)
    db_session.flush()

    system = StarSystem(
        name="Comms System",
        seed="comms-seed",
        position_x=0,
        position_y=0,
        position_z=0,
        economy_type="mixed",
        tech_level=1,
        faction_id=faction.id,
    )
    db_session.add(system)
    db_session.flush()

    archetype = StationArchetype(
        name="Comms Hub",
        size_class="small",
        shape="coriolis",
        palette_json={},
        features_json={},
    )
    db_session.add(archetype)
    db_session.flush()

    station = Station(
        system_id=system.id,
        name=name,
        archetype_id=archetype.id,
        position_x=0,
        position_y=0,
        position_z=0,
        services_json={"market": True},
        faction_id=faction.id,
        tech_level=1,
        ai_story_available=False,
    )
    db_session.add(station)
    db_session.commit()

    return int(station.id)


def test_list_channels_requires_auth(client):
    response = client.get("/api/comms/channels")

    assert response.status_code == 401


def test_list_channels_ok(client, auth_headers):
    response = client.get("/api/comms/channels", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 3
    assert payload[0]["id"] == "local-station"
    channel_map = {channel["id"]: channel for channel in payload}
    assert channel_map["local-station"]["unread"] == 2
    assert channel_map["system-traffic"]["unread"] == 1
    assert channel_map["relay-vega-lave"]["unread"] == 1


def test_list_messages_unknown_channel(client, auth_headers):
    response = client.get(
        "/api/comms/channels/unknown/messages",
        headers=auth_headers,
    )

    assert response.status_code == 404


def test_send_message_appends_to_channel(client, auth_headers):
    send_response = client.post(
        "/api/comms/channels/local-station/messages",
        json={"body": "Requesting lane assignment."},
        headers=auth_headers,
    )

    assert send_response.status_code == 200
    sent_payload = send_response.json()
    assert sent_payload["direction"] == "outbound"
    assert sent_payload["delivery"] == "instant"
    assert sent_payload["body"] == "Requesting lane assignment."

    list_response = client.get(
        "/api/comms/channels/local-station/messages",
        headers=auth_headers,
    )

    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert list_payload[-1]["body"] == "Requesting lane assignment."


def test_send_message_rejects_blank_body(client, auth_headers):
    response = client.post(
        "/api/comms/channels/local-station/messages",
        json={"body": ""},
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_mark_channel_read_sets_unread_to_zero(client, auth_headers):
    initial_channels = client.get("/api/comms/channels", headers=auth_headers)

    assert initial_channels.status_code == 200
    initial_payload = initial_channels.json()
    initial_map = {channel["id"]: channel for channel in initial_payload}
    assert initial_map["local-station"]["unread"] == 2

    mark_response = client.post(
        "/api/comms/channels/local-station/read",
        headers=auth_headers,
    )

    assert mark_response.status_code == 200
    assert mark_response.json()["id"] == "local-station"
    assert mark_response.json()["unread"] == 0

    channels_after = client.get("/api/comms/channels", headers=auth_headers)

    assert channels_after.status_code == 200
    after_map = {channel["id"]: channel for channel in channels_after.json()}
    assert after_map["local-station"]["unread"] == 0


def test_send_outbound_message_does_not_increase_unread(client, auth_headers):
    mark_response = client.post(
        "/api/comms/channels/local-station/read",
        headers=auth_headers,
    )
    assert mark_response.status_code == 200

    send_response = client.post(
        "/api/comms/channels/local-station/messages",
        json={"body": "Status check from cockpit."},
        headers=auth_headers,
    )
    assert send_response.status_code == 200

    channels_response = client.get("/api/comms/channels", headers=auth_headers)
    assert channels_response.status_code == 200
    channel_map = {channel["id"]                   : channel for channel in channels_response.json()}
    assert channel_map["local-station"]["unread"] == 0


def test_local_channel_uses_station_name(client, auth_headers, db_session):
    station_id = _seed_station(db_session, "Orbis Prime")
    user = db_session.query(User).filter(
        User.email == "pilot@example.com").first()
    assert user is not None
    user.location_type = "station"
    user.location_id = station_id
    db_session.commit()

    response = client.get("/api/comms/channels", headers=auth_headers)

    assert response.status_code == 200
    channel_map = {channel["id"]: channel for channel in response.json()}
    assert channel_map["local-station"]["name"] == "Orbis Prime Local"


def test_interstellar_outbound_transitions_from_queued_to_delivered(
    client,
    auth_headers,
    db_session,
):
    send_response = client.post(
        "/api/comms/channels/relay-vega-lave/messages",
        json={"body": "Relay check from Vega."},
        headers=auth_headers,
    )
    assert send_response.status_code == 200
    assert send_response.json()["delivery"] == "queued"

    user = db_session.query(User).filter(
        User.email == "pilot@example.com").first()
    assert user is not None
    queued_row = (
        db_session.query(DbCommsMessage)
        .filter(
            DbCommsMessage.user_id == user.id,
            DbCommsMessage.channel_id == "relay-vega-lave",
            DbCommsMessage.direction == "outbound",
            DbCommsMessage.body == "Relay check from Vega.",
        )
        .order_by(DbCommsMessage.id.desc())
        .first()
    )
    assert queued_row is not None
    assert queued_row.delivery == "queued"
    queued_row.deliver_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    list_response = client.get(
        "/api/comms/channels/relay-vega-lave/messages",
        headers=auth_headers,
    )
    assert list_response.status_code == 200
    latest = list_response.json()[-1]
    assert latest["body"] == "Relay check from Vega."
    assert latest["delivery"] == "delivered"


def test_queued_inbound_does_not_count_unread_until_delivered(
    client,
    auth_headers,
    db_session,
):
    user = db_session.query(User).filter(
        User.email == "pilot@example.com").first()
    assert user is not None

    seed_channels = client.get("/api/comms/channels", headers=auth_headers)
    assert seed_channels.status_code == 200
    baseline_map = {channel["id"]: channel for channel in seed_channels.json()}
    baseline_unread = baseline_map["relay-vega-lave"]["unread"]

    queued_inbound = DbCommsMessage(
        user_id=user.id,
        channel_id="relay-vega-lave",
        author="Relay Monitor",
        body="Inbound delayed packet.",
        direction="inbound",
        delivery="queued",
        created_at=datetime.now(timezone.utc),
        deliver_at=datetime.now(timezone.utc) + timedelta(seconds=300),
        delivered_at=None,
    )
    db_session.add(queued_inbound)
    db_session.commit()

    before_release = client.get("/api/comms/channels", headers=auth_headers)
    assert before_release.status_code == 200
    before_map = {channel["id"]: channel for channel in before_release.json()}
    assert before_map["relay-vega-lave"]["unread"] == baseline_unread

    queued_inbound.deliver_at = datetime.now(
        timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    after_release = client.get("/api/comms/channels", headers=auth_headers)
    assert after_release.status_code == 200
    after_map = {channel["id"]: channel for channel in after_release.json()}
    assert after_map["relay-vega-lave"]["unread"] == baseline_unread + 1
