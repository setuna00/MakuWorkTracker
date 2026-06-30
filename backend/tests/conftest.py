"""测试夹具：用独立的内存 SQLite 覆盖应用的 DB 会话，保证测试不碰生产数据。"""
import os
import tempfile

# 必须在导入任何 app.* 之前设置数据目录，避免 import 时在默认 /app/data 建目录
os.environ.setdefault("WT_DATA_DIR", tempfile.mkdtemp(prefix="wt-test-"))

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db import get_session
from app import models  # noqa: F401  确保所有模型注册


@pytest.fixture()
def session():
    # StaticPool + 同一个 in-memory 连接，让多次 get_session 共享同一张内存库
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s
    engine.dispose()


@pytest.fixture()
def client(session):
    def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
