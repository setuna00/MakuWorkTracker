"""管理：备份、导出、导入。"""
import io
import csv
import json
import zipfile
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, FileResponse
from sqlmodel import Session, select
from ..db import get_session
from ..models import Work, Watching, ProgressEntry, Tag, Collection
from ..config import settings
from ..utils.backup import perform_backup, list_backups

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/backup")
def trigger_backup():
    p = perform_backup()
    return {"ok": True, "filename": p.name}


@router.get("/backups")
def get_backups():
    return {"backups": list_backups()}


@router.get("/backups/{filename}")
def download_backup(filename: str):
    # 防穿越
    safe = (settings.backups_dir / filename).resolve()
    if not str(safe).startswith(str(settings.backups_dir.resolve())):
        return {"error": "invalid filename"}
    if not safe.exists():
        return {"error": "not found"}
    return FileResponse(safe, filename=filename, media_type="application/octet-stream")


def _model_to_dict(m, exclude=()):
    d = {}
    for k in m.__class__.__fields__:
        if k in exclude:
            continue
        v = getattr(m, k)
        if isinstance(v, datetime):
            d[k] = v.isoformat()
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        else:
            d[k] = v
    return d


@router.get("/export/json")
def export_json(session: Session = Depends(get_session)):
    """完整 JSON 备份 + 图片打包成 zip。"""
    works = session.exec(select(Work)).all()
    watchings = session.exec(select(Watching)).all()
    entries = session.exec(select(ProgressEntry)).all()
    tags = session.exec(select(Tag)).all()
    collections = session.exec(select(Collection)).all()

    data = {
        "exported_at": datetime.utcnow().isoformat(),
        "version": "1.0",
        "works": [],
        "watchings": [_model_to_dict(w) for w in watchings],
        "progress_entries": [_model_to_dict(e) for e in entries],
        "tags": [_model_to_dict(t) for t in tags],
        "collections": [_model_to_dict(c) for c in collections],
    }
    # works 单独处理：要带 tag_ids / collection_ids
    for w in works:
        d = _model_to_dict(w)
        d["tag_ids"] = [t.id for t in w.tags]
        d["collection_ids"] = [c.id for c in w.collections]
        data["works"].append(d)

    # 打包 zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2))
        # 加入封面文件
        if settings.covers_dir.exists():
            for f in settings.covers_dir.rglob("*"):
                if f.is_file():
                    arc = "covers/" + str(f.relative_to(settings.covers_dir))
                    zf.write(f, arc)
    buf.seek(0)

    filename = f"works-tracker-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/csv")
def export_csv(session: Session = Depends(get_session)):
    """三个表的 CSV 打包 zip。"""
    works = session.exec(select(Work)).all()
    watchings = session.exec(select(Watching)).all()
    entries = session.exec(select(ProgressEntry)).all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # works.csv
        sb = io.StringIO()
        wr = csv.writer(sb)
        wr.writerow(["id", "title", "original_title", "type", "release_status",
                     "total_units", "creators", "tags", "collections",
                     "created_at", "updated_at"])
        for w in works:
            wr.writerow([
                w.id, w.title, w.original_title or "", w.type.value, w.release_status.value,
                w.total_units or "",
                json.dumps(w.creators, ensure_ascii=False),
                "|".join(t.name for t in w.tags),
                "|".join(c.name for c in w.collections),
                w.created_at.isoformat(), w.updated_at.isoformat(),
            ])
        zf.writestr("works.csv", sb.getvalue())

        # watchings.csv
        sb = io.StringIO()
        wr = csv.writer(sb)
        wr.writerow(["id", "work_id", "round_number", "label", "personal_status",
                     "rating", "started_at", "finished_at", "overall_review"])
        for x in watchings:
            wr.writerow([
                x.id, x.work_id, x.round_number, x.label or "",
                x.personal_status.value, x.rating or "",
                x.started_at.isoformat() if x.started_at else "",
                x.finished_at.isoformat() if x.finished_at else "",
                x.overall_review or "",
            ])
        zf.writestr("watchings.csv", sb.getvalue())

        # progress_entries.csv
        sb = io.StringIO()
        wr = csv.writer(sb)
        wr.writerow(["id", "watching_id", "date", "range_start", "range_end",
                     "consumed_count", "note", "created_at"])
        for e in entries:
            wr.writerow([
                e.id, e.watching_id, e.date.isoformat(),
                e.range_start or "", e.range_end or "", e.consumed_count,
                e.note or "", e.created_at.isoformat(),
            ])
        zf.writestr("progress_entries.csv", sb.getvalue())

    buf.seek(0)
    filename = f"works-tracker-csv-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/info")
def admin_info(session: Session = Depends(get_session)):
    works_count = session.exec(select(Work)).all()
    entries_count = session.exec(select(ProgressEntry)).all()
    db_size = settings.db_path.stat().st_size if settings.db_path.exists() else 0
    return {
        "version": "1.0.0",
        "works_count": len(works_count),
        "entries_count": len(entries_count),
        "db_size_bytes": db_size,
        "data_dir": str(settings.data_dir),
    }
