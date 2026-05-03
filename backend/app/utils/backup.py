"""SQLite 备份调度与保留策略。"""
import sqlite3
from datetime import datetime
from pathlib import Path
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from ..config import settings


def perform_backup() -> Path:
    """使用 SQLite backup API 做热备份。"""
    settings.ensure_dirs()
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_filename = f"db-{ts}.sqlite"
    backup_path = settings.backups_dir / backup_filename

    src = sqlite3.connect(str(settings.db_path))
    dst = sqlite3.connect(str(backup_path))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    _enforce_retention()
    return backup_path


def _enforce_retention() -> None:
    """保留最近 N 份备份，删除较旧的。"""
    backups = sorted(
        settings.backups_dir.glob("db-*.sqlite"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in backups[settings.backup_retention:]:
        try:
            old.unlink()
        except Exception:
            pass


def list_backups():
    settings.ensure_dirs()
    backups = sorted(
        settings.backups_dir.glob("db-*.sqlite"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return [
        {
            "filename": p.name,
            "size_bytes": p.stat().st_size,
            "created_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
        }
        for p in backups
    ]


_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone=settings.tz)
    _scheduler.add_job(
        perform_backup,
        CronTrigger(hour=settings.backup_hour, minute=settings.backup_minute),
        id="daily_backup",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
