"""进度记录路由 - 包含核心业务规则。"""
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Work, Watching, ProgressEntry
from ..models.enums import ReleaseStatus, TYPES_WITH_RANGE_PROGRESS
from ..schemas import ProgressEntryCreate, ProgressEntryUpdate, ProgressEntryRead

router = APIRouter(tags=["progress"])


def _ensure_watching(session: Session, watching_id: int) -> Watching:
    w = session.get(Watching, watching_id)
    if not w:
        raise HTTPException(404, "Watching not found")
    return w


def _validate_range(work: Work, range_start, range_end):
    """根据作品类型校验 range 字段。"""
    if work.type in TYPES_WITH_RANGE_PROGRESS:
        if range_start is None or range_end is None:
            raise HTTPException(400, "该类型作品必须填写进度区间")
        if range_start < 1 or range_end < range_start:
            raise HTTPException(400, "进度区间无效")


def _maybe_extend_total(session: Session, work: Work, range_end):
    """连载中作品：如果 range_end > total_units 则自动扩展。"""
    if (work.release_status == ReleaseStatus.ongoing
            and range_end is not None
            and (work.total_units is None or range_end > work.total_units)):
        work.total_units = range_end
        work.updated_at = datetime.now(timezone.utc)
        session.add(work)


@router.get("/api/watchings/{watching_id}/entries", response_model=List[ProgressEntryRead])
def list_entries(watching_id: int, session: Session = Depends(get_session)):
    _ensure_watching(session, watching_id)
    entries = session.exec(
        select(ProgressEntry)
        .where(ProgressEntry.watching_id == watching_id)
        .order_by(ProgressEntry.date.desc(), ProgressEntry.created_at.desc())
    ).all()
    return [ProgressEntryRead.model_validate(e) for e in entries]


@router.post("/api/watchings/{watching_id}/entries", response_model=ProgressEntryRead)
def create_entry(
    watching_id: int,
    data: ProgressEntryCreate,
    session: Session = Depends(get_session),
):
    watching = _ensure_watching(session, watching_id)
    work = session.get(Work, watching.work_id)
    if not work:
        raise HTTPException(404, "Work not found")

    _validate_range(work, data.range_start, data.range_end)

    # 计算 consumed_count
    if data.range_start is not None and data.range_end is not None:
        consumed = data.range_end - data.range_start + 1
    else:
        consumed = 1  # 电影类

    entry = ProgressEntry(
        watching_id=watching_id,
        date=data.date,
        range_start=data.range_start,
        range_end=data.range_end,
        consumed_count=consumed,
        note=data.note,
    )
    session.add(entry)

    # 业务规则：连载中自动扩 total_units
    _maybe_extend_total(session, work, data.range_end)

    # 自动设 watching.started_at（首条记录）
    if watching.started_at is None:
        watching.started_at = data.date
        session.add(watching)
    # 如果到达 total_units 且作品已完结，自动设 finished_at
    if (work.release_status == ReleaseStatus.finished
            and work.total_units is not None
            and data.range_end == work.total_units
            and watching.finished_at is None):
        watching.finished_at = data.date
        session.add(watching)

    session.commit()
    session.refresh(entry)
    return ProgressEntryRead.model_validate(entry)


@router.patch("/api/entries/{entry_id}", response_model=ProgressEntryRead)
def update_entry(
    entry_id: int,
    data: ProgressEntryUpdate,
    session: Session = Depends(get_session),
):
    entry = session.get(ProgressEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")

    watching = session.get(Watching, entry.watching_id)
    work = session.get(Work, watching.work_id)

    update_dict = data.model_dump(exclude_unset=True)

    # 应用更新
    for k, v in update_dict.items():
        setattr(entry, k, v)

    # 重新校验
    _validate_range(work, entry.range_start, entry.range_end)

    # 重算 consumed_count
    if entry.range_start is not None and entry.range_end is not None:
        entry.consumed_count = entry.range_end - entry.range_start + 1
    else:
        entry.consumed_count = 1

    entry.updated_at = datetime.now(timezone.utc)

    # 仍可能引发自动扩 total_units
    _maybe_extend_total(session, work, entry.range_end)

    session.add(entry)
    session.commit()
    session.refresh(entry)
    return ProgressEntryRead.model_validate(entry)


@router.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(ProgressEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    session.delete(entry)
    session.commit()
    return {"ok": True}
