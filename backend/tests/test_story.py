def test_story_interpret_requires_input(client, auth_headers):
    response = client.post(
        "/api/story/interpret",
        json={"session_id": 1, "player_input": "   "},
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_story_interpret_ok(client, auth_headers):
    response = client.post(
        "/api/story/interpret",
        json={"session_id": 1, "player_input": "Look around"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["requires_confirmation"] is True
    assert "Look around" in payload["interpretation"]


def test_story_confirm_cancelled(client, auth_headers):
    response = client.post(
        "/api/story/confirm",
        json={"session_id": 1, "confirm": False},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_story_sessions_list(client, auth_headers):
    start_response = client.post(
        "/api/story/start/1",
        headers=auth_headers,
    )
    assert start_response.status_code == 200

    list_response = client.get(
        "/api/story/sessions",
        headers=auth_headers,
    )

    assert list_response.status_code == 200
    payload = list_response.json()
    assert len(payload) >= 1
    assert payload[0]["location_type"] == "station"
