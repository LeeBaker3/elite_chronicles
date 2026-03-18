from pathlib import Path

from desktop_client.session_store import SessionState, SessionStore


def test_session_store_round_trip(tmp_path: Path):
    session_path = tmp_path / "session.json"
    store = SessionStore(session_path)
    state = SessionState(
        access_token="token-123",
        user_id=9,
        selected_ship_id=42,
        primary_ship_id=42,
    )

    store.save(state)
    loaded = store.load()

    assert loaded == state


def test_session_store_returns_defaults_for_invalid_json(tmp_path: Path):
    session_path = tmp_path / "session.json"
    session_path.write_text("{not-json", encoding="utf-8")
    store = SessionStore(session_path)

    loaded = store.load()

    assert loaded.access_token is None
    assert loaded.selected_ship_id is None
