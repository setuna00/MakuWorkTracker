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
    _migrate_add_is_backfill()
    _run_lightweight_migrations()
    _migrate_v1_3_0_tag_groups()


def _migrate_add_is_backfill():
    """v1.2.0: ProgressEntry 加 is_backfill 列。SQLite 安全幂等迁移。"""
    from sqlalchemy import text, inspect
    inspector = inspect(engine)
    if "progressentry" not in inspector.get_table_names():
        return
    columns = [c["name"] for c in inspector.get_columns("progressentry")]
    if "is_backfill" in columns:
        return
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE progressentry ADD COLUMN is_backfill BOOLEAN DEFAULT 0 NOT NULL"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_progressentry_is_backfill ON progressentry (is_backfill)"))
        conn.commit()


def _run_lightweight_migrations() -> None:
    """轻量手动迁移：SQLModel.create_all 不会给已有表加新列。
    每次启动幂等地补齐这次新增的字段。SQLite 不支持 IF NOT EXISTS COLUMN，
    所以读出当前列再决定是否 ALTER。
    """
    from sqlalchemy import text
    migrations = [
        # (table, column, ALTER 语句)
        ("work", "unit_label", "ALTER TABLE work ADD COLUMN unit_label VARCHAR"),
        ("work", "release_year", "ALTER TABLE work ADD COLUMN release_year INTEGER"),
    ]
    with engine.begin() as conn:
        for table, column, ddl in migrations:
            cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))]
            if column not in cols:
                conn.execute(text(ddl))


def get_session():
    with Session(engine) as session:
        yield session


def _migrate_v1_3_0_tag_groups():
    """v1.3.0: TagGroup 表 + Tag 加 group_id/aliases + 默认组初始化。"""
    from sqlalchemy import text, inspect
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "taggroup" not in table_names or "tag" not in table_names:
        return  # 表都没建，create_all 还没跑过；正常流程不会走到

    # 给 tag 表补列
    tag_cols = [c["name"] for c in inspector.get_columns("tag")]
    with engine.begin() as conn:
        if "group_id" not in tag_cols:
            conn.execute(text("ALTER TABLE tag ADD COLUMN group_id INTEGER"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tag_group_id ON tag (group_id)"))
        if "aliases" not in tag_cols:
            conn.execute(text("ALTER TABLE tag ADD COLUMN aliases TEXT DEFAULT '[]'"))

    # 创建默认组（如果不存在）
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id FROM taggroup WHERE is_default=1 LIMIT 1")).fetchone()
        if row is None:
            conn.execute(text(
                "INSERT INTO taggroup (name, sort_order, is_default, created_at) "
                "VALUES ('默认', 0, 1, :ts)"
            ), {"ts": utcnow_iso()})
            row = conn.execute(text("SELECT id FROM taggroup WHERE is_default=1 LIMIT 1")).fetchone()
        default_id = row[0]

        # 把所有 group_id IS NULL 的 tag 归到默认组
        conn.execute(text("UPDATE tag SET group_id = :gid WHERE group_id IS NULL"),
                     {"gid": default_id})


def utcnow_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()

