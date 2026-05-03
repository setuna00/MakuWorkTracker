"""数据库引擎和会话管理。"""
from sqlmodel import SQLModel, create_engine, Session
from .config import settings


# WAL 模式 + 启用外键
connect_args = {"check_same_thread": False}

# 路径会在 ensure_dirs 之后被使用
def make_engine():
    settings.ensure_dirs()
    db_url = f"sqlite:///{settings.db_path}"
    engine = create_engine(db_url, connect_args=connect_args)

    # SQLite 启用 WAL 和外键
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


engine = make_engine()


def init_db() -> None:
    """启动时建表。"""
    # 必须先 import 所有模型让 SQLModel 注册
    from . import models  # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
