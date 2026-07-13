"""作品年份字段的 CRUD 与 SQLite 兼容迁移测试。"""
import json

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text

from app import db
from app.schemas import WorkCreate


def _create_payload(**overrides):
    payload = {
        "title": "Dune",
        "type": "movie",
        "release_status": "finished",
        "total_units": 1,
        "release_year": 2021,
    }
    payload.update(overrides)
    return payload


def test_release_year_create_update_and_clear(client):
    created = client.post(
        "/api/works",
        data={"payload": json.dumps(_create_payload())},
    )
    assert created.status_code == 200, created.text
    work = created.json()
    assert work["release_year"] == 2021

    work_id = work["id"]
    fetched = client.get(f"/api/works/{work_id}")
    assert fetched.status_code == 200
    assert fetched.json()["release_year"] == 2021

    updated = client.patch(
        f"/api/works/{work_id}",
        data={"payload": json.dumps({"release_year": 1984})},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["release_year"] == 1984

    cleared = client.patch(
        f"/api/works/{work_id}",
        data={"payload": json.dumps({"release_year": None})},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["release_year"] is None


def test_release_year_rejects_out_of_range_value():
    with pytest.raises(ValidationError):
        WorkCreate.model_validate(_create_payload(release_year=10000))


def test_release_year_lightweight_migration_is_idempotent(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE work (id INTEGER PRIMARY KEY, unit_label VARCHAR)"))

    monkeypatch.setattr(db, "engine", engine)
    db._run_lightweight_migrations()
    db._run_lightweight_migrations()

    columns = {column["name"] for column in inspect(engine).get_columns("work")}
    assert "release_year" in columns
    engine.dispose()