"""时间轴 + 统计路由。"""
from datetime import date, datetime, timezone, timedelta
from typing import List, Optional, Dict
from collections import defaultdict
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func
from ..db import get_session
from ..models import Work, Watching, ProgressEntry
from ..models.enums import WorkType
from ..schemas import (
    TimelineDay, TimelineDayItem, TimelineResponse, MonthlyOverview
)

router = APIRouter(tags=["timeline"])


@router.get("/api/timeline", response_model=TimelineResponse)
def get_timeline(
    session: Session = Depends(get_session),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    type: Optional[WorkType] = None,
    work_id: Optional[int] = None,
    limit: int = Query(500, ge=1, le=2000),
):
    """全局时间轴。同日同 watching 的多条 entry 合并显示。"""
    # 一次性 join 拿到所有需要的字段
    stmt = (
        select(ProgressEntry, Watching, Work)
        .join(Watching, Watching.id == ProgressEntry.watching_id)
        .join(Work, Work.id == Watching.work_id)
    )
    if from_date:
        stmt = stmt.where(ProgressEntry.date >= from_date)
    if to_date:
        stmt = stmt.where(ProgressEntry.date <= to_date)
    if type:
        stmt = stmt.where(Work.type == type)
    if work_id is not None:
        stmt = stmt.where(Work.id == work_id)

    stmt = stmt.order_by(ProgressEntry.date.desc(), ProgressEntry.created_at.asc()).limit(limit)
    rows = session.exec(stmt).all()

    # 统计每个 work 的总周目数（用于决定 show_round）
    round_counts = dict(session.exec(
        select(Watching.work_id, func.count(Watching.id)).group_by(Watching.work_id)
    ).all())

    # 分组：date -> watching_id -> [(entry, watching, work), ...]
    grouped: Dict[date, Dict[int, list]] = defaultdict(lambda: defaultdict(list))
    for entry, watching, work in rows:
        grouped[entry.date][watching.id].append((entry, watching, work))

    days: List[TimelineDay] = []
    for d in sorted(grouped.keys(), reverse=True):
        items: List[TimelineDayItem] = []
        for watching_id, entries in grouped[d].items():
            # 取出 entry/watching/work（同 watching 的所有 entry，watching/work 一致）
            first_w = entries[0][1]
            first_work = entries[0][2]

            ranges = [(e.range_start, e.range_end) for e, _, _ in entries
                      if e.range_start is not None and e.range_end is not None]
            if ranges:
                merged_start = min(r[0] for r in ranges)
                merged_end = max(r[1] for r in ranges)
            else:
                merged_start = merged_end = None

            notes = [e.note for e, _, _ in entries if e.note]
            entry_ids = [e.id for e, _, _ in entries]

            items.append(TimelineDayItem(
                work_id=first_work.id,
                work_title=first_work.title,
                work_type=first_work.type,
                work_unit_label=first_work.unit_label,
                work_cover_thumb=first_work.cover_thumb_path,
                watching_id=watching_id,
                round_number=first_w.round_number,
                round_label=first_w.label,
                show_round=round_counts.get(first_work.id, 1) >= 2,
                range_start=merged_start,
                range_end=merged_end,
                notes=notes,
                entry_ids=entry_ids,
            ))
        days.append(TimelineDay(date=d, items=items))

    return TimelineResponse(days=days)


@router.get("/api/stats/monthly-overview", response_model=MonthlyOverview)
def monthly_overview(
    year: int,
    month: int,
    session: Session = Depends(get_session),
):
    """本月概览：记录条数 / 活跃作品数 / 本月新开数。"""
    # 月初 / 下月初
    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1
    month_start = date(year, month, 1)
    month_end_excl = date(next_year, next_month, 1)

    # 1. 本月记录条数
    entries_count = session.exec(
        select(func.count(ProgressEntry.id))
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end_excl)
    ).one()

    # 2. 活跃作品数：本月内有进度记录的不同 work
    active_works = session.exec(
        select(func.count(func.distinct(Watching.work_id)))
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end_excl)
    ).one()

    # 3. 本月新开作品数：该 work 的首条 ProgressEntry 落在本月
    # = 对每个 work，其最小 date 在 [month_start, month_end_excl)
    subq = (
        select(Watching.work_id.label("wid"), func.min(ProgressEntry.date).label("first_date"))
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .group_by(Watching.work_id)
        .subquery()
    )
    new_works = session.exec(
        select(func.count(subq.c.wid))
        .where(subq.c.first_date >= month_start)
        .where(subq.c.first_date < month_end_excl)
    ).one()

    return MonthlyOverview(
        year=year, month=month,
        entries_count=entries_count or 0,
        active_works=active_works or 0,
        new_works=new_works or 0,
    )


@router.get("/api/stats/recent-activity")
def recent_activity(
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(10, ge=1, le=50),
    session: Session = Depends(get_session),
):
    """首页"最近动态"使用：过去 N 天的合并展示事件。"""
    today = date.today()
    from_date = today - timedelta(days=days - 1)
    return get_timeline(session=session, from_date=from_date, to_date=today, limit=limit * 3)
