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
