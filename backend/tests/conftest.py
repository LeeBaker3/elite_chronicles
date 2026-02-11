from app.db.base import Base
from app.db.session import get_db
from app.main import app
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


TEST_DB_URL = os.getenv("TEST_DATABASE_URL")
if not TEST_DB_URL:
    pytest.skip("TEST_DATABASE_URL is not set", allow_module_level=True)

os.environ["DATABASE_URL"] = TEST_DB_URL


def ensure_test_database(url: str) -> None:
    parsed = make_url(url)
    db_name = parsed.database
    if not db_name or not db_name.replace("_", "").isalnum():
        raise RuntimeError("Invalid test database name")

    admin_url = parsed.set(database="postgres")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        admin_engine.dispose()


ensure_test_database(TEST_DB_URL)


engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    response = client.post(
        "/api/auth/register",
        json={
            "email": "pilot@example.com",
            "username": "pilot",
            "password": "pilot123",
        },
    )
    if response.status_code != 200:
        raise RuntimeError(f"Auth setup failed: {response.status_code}")
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}
