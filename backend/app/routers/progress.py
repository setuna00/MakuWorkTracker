"""进度记录路由 - 包含核心业务规则。"""
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from ..db import get_session
from ..models import Work, Watching, ProgressEntry
from ..models.enums import ReleaseStatus, PersonalStatus, TYPES_WITH_RANGE_PROGRESS
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


def sync_watching_completion(session: Session, watching: Watching, work: Work):
    """根据当前作品发布状态 + 进度，自动同步 watching 的 finished_at / personal_status。

    规则：
    - 完结作品（finished + total_units 已设）：
        cur >= total → done + finished_at = today
        cur <  total → 退回 watching + 清空 finished_at（应对 total 被改大、退回的情况）
    - 连载中作品（ongoing）：
        如果当前是 done（之前 finished 时被推上去的） → 退回 watching + 清空 finished_at
        否则不动（在不在前端"等待更新"栏由前端 split 决定）
    - 没有 total_units / 无法判断：不动
    """
    max_range_end = session.exec(
        select(func.max(ProgressEntry.range_end)).where(ProgressEntry.watching_id == watching.id)
    ).one()

    changed = False

    if work.release_status == ReleaseStatus.finished and work.total_units is not None:
        reached_end = max_range_end is not None and max_range_end >= work.total_units
        if reached_end:
            if watching.finished_at is None:
                watching.finished_at = datetime.now(timezone.utc).date()
                changed = True
            if watching.personal_status != PersonalStatus.done:
                watching.personal_status = PersonalStatus.done
                changed = True
        else:
            if watching.finished_at is not None:
                watching.finished_at = None
                changed = True
            if watching.personal_status == PersonalStatus.done:
                watching.personal_status = PersonalStatus.watching
                changed = True
    else:
        if watching.personal_status == PersonalStatus.done:
            watching.personal_status = PersonalStatus.watching
            watching.finished_at = None
            changed = True

    if changed:
        watching.updated_at = datetime.now(timezone.utc)
        session.add(watching)


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

    # 业务规则：从「想看」记进度 → 自动转「在看」
    # 注意：必须放在 sync_watching_completion 之前——后者可能进一步把状态推到 done
    # （场景：完结作品一次性记录全程 1-N 集，want → watching → done 同一次提交内完成）
    if watching.personal_status == PersonalStatus.want:
        watching.personal_status = PersonalStatus.watching
        watching.updated_at = datetime.now(timezone.utc)
        session.add(watching)

    sync_watching_completion(session, watching, work)

    session.commit()
    session.refresh(entry)
    return ProgressEntryRead.model_validate(entry)


@router.get("/api/entries/{entry_id}", response_model=ProgressEntryRead)
def get_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(ProgressEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
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
    sync_watching_completion(session, watching, work)

    session.add(entry)
    session.commit()
    session.refresh(entry)
    return ProgressEntryRead.model_validate(entry)


@router.delete("/api/entries/{entry_id}")
def delete_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(ProgressEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    watching = session.get(Watching, entry.watching_id)
    work = session.get(Work, watching.work_id) if watching else None
    session.delete(entry)
    if watching and work:
        sync_watching_completion(session, watching, work)
    session.commit()
    return {"ok": True}