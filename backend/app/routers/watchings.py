"""周目（Watching）管理路由。"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from ..db import get_session
from ..models import Work, Watching
from ..models.enums import PersonalStatus
from ..schemas import WatchingCreate, WatchingUpdate, WatchingRead

router = APIRouter(tags=["watchings"])


def _to_read(session: Session, w: Watching) -> WatchingRead:
    from ..models import ProgressEntry
    result = session.exec(
        select(
            func.max(ProgressEntry.range_end),
            func.count(ProgressEntry.id),
        ).where(ProgressEntry.watching_id == w.id)
    ).one()
    current_progress, entries_count = result
    return WatchingRead(
        id=w.id, work_id=w.work_id, round_number=w.round_number,
        label=w.label, personal_status=w.personal_status, rating=w.rating,
        overall_review=w.overall_review,
        started_at=w.started_at, finished_at=w.finished_at,
        created_at=w.created_at, updated_at=w.updated_at,
        current_progress=current_progress,
        entries_count=entries_count or 0,
    )


@router.post("/api/works/{work_id}/watchings", response_model=WatchingRead)
def create_new_round(
    work_id: int,
    data: WatchingCreate,
    session: Session = Depends(get_session),
):
    work = session.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")

    # 取最大 round_number + 1
    max_round = session.exec(
        select(func.max(Watching.round_number)).where(Watching.work_id == work_id)
    ).one()
    next_round = (max_round or 0) + 1

    watching = Watching(
        work_id=work_id,
        round_number=next_round,
        label=data.label,
        personal_status=data.personal_status,
    )
    # 新周目成为当前周目，同时刷新作品更新时间，让当前追看状态及时出现在列表/首页。
    work.updated_at = datetime.now(timezone.utc)
    session.add(work)
    session.add(watching)
    session.commit()
    session.refresh(watching)
    return _to_read(session, watching)


@router.patch("/api/watchings/{watching_id}", response_model=WatchingRead)
def update_watching(
    watching_id: int,
    data: WatchingUpdate,
    session: Session = Depends(get_session),
):
    watching = session.get(Watching, watching_id)
    if not watching:
        raise HTTPException(404, "Watching not found")

    update_dict = data.model_dump(exclude_unset=True)
    if "rating" in update_dict and update_dict["rating"] is not None:
        # 验证 0.5 步进
        r = update_dict["rating"]
        if abs(r * 2 - round(r * 2)) > 0.001:
            raise HTTPException(400, "Rating must be in 0.5 steps")

    for k, v in update_dict.items():
        setattr(watching, k, v)
    watching.updated_at = datetime.now(timezone.utc)

    # 当前周目状态变化也刷新作品时间，保证列表状态和排序及时更新。
    work = session.get(Work, watching.work_id)
    if work is not None:
        work.updated_at = datetime.now(timezone.utc)
        session.add(work)
    session.add(watching)
    session.commit()
    session.refresh(watching)
    return _to_read(session, watching)


@router.delete("/api/watchings/{watching_id}")
def delete_watching(watching_id: int, session: Session = Depends(get_session)):
    watching = session.get(Watching, watching_id)
    if not watching:
        raise HTTPException(404, "Watching not found")

    # 不允许删除唯一周目
    count = session.exec(
        select(func.count(Watching.id)).where(Watching.work_id == watching.work_id)
    ).one()
    if count <= 1:
        raise HTTPException(400, "不能删除唯一的周目")

    session.delete(watching)
    session.commit()
    return {"ok": True}
