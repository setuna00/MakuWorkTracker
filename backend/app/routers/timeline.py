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
    include_backfill: bool = Query(False),
):
    """全局时间轴。同日同 watching 的多条 entry 合并显示。"""
    # 一次性 join 拿到所有需要的字段
    stmt = (
        select(ProgressEntry, Watching, Work)
        .join(Watching, Watching.id == ProgressEntry.watching_id)
        .join(Work, Work.id == Watching.work_id)
    )
    if not include_backfill:
        stmt = stmt.where(ProgressEntry.is_backfill == False)
    if from_date:
        stmt = stmt.where(ProgressEntry.date >= from_date)
    if to_date:
        stmt = stmt.where(ProgressEntry.date <= to_date)
    if type:
        stmt = stmt.where(Work.type == type)
    if work_id is not None:
        stmt = stmt.where(Work.id == work_id)

    stmt = stmt.order_by(ProgressEntry.date.desc(), ProgressEntry.created_at.desc()).limit(limit)
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
            is_backfill = bool(entries) and all(e.is_backfill for e, _, _ in entries)

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
                is_backfill=is_backfill,
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
        .where(ProgressEntry.is_backfill == False)
    ).one()

    # 2. 活跃作品数：本月内有进度记录的不同 work
    active_works = session.exec(
        select(func.count(func.distinct(Watching.work_id)))
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end_excl)
        .where(ProgressEntry.is_backfill == False)
    ).one()

    # 3. 本月新开作品数：该 work 的首条 ProgressEntry 落在本月
    # = 对每个 work，其最小 date 在 [month_start, month_end_excl)
    subq = (
        select(Watching.work_id.label("wid"), func.min(ProgressEntry.date).label("first_date"))
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.is_backfill == False)
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
    """首页"最近动态"使用:过去 N 天的合并展示事件。

    严格排除补录:首页是"最近做的事",不是历史回填,所以补录类条目永远不该出现。
    """
    today = date.today()
    from_date = today - timedelta(days=days - 1)
    # 显式 include_backfill=False;前端首页也做了二次过滤兜底
    return get_timeline(
        session=session,
        from_date=from_date,
        to_date=today,
        limit=limit * 3,
        include_backfill=False,
    )


@router.get("/api/stats/recommendations")
def recommendations(
    limit: int = Query(7, ge=1, le=20),
    lookback_days: int = Query(60, ge=7, le=365),
    seed: int = Query(0),
    session: Session = Depends(get_session),
):
    """基于最近记录的 tag/类型相似度,从 personal_status=want 列表中推荐。

    评分方式:
      - 取最近 lookback_days 天内有 progress 记录的 work,统计每个 tag / type 出现的"作品次数"
        (一个作品被记录多次只计一次,避免追番期间被严重过度权重)
      - 对每个 want 作品:重合 tag 加权 2,同 type 加权 1
      - 分数 0 的不算"基于相似度",混排到尾部,保证空记录用户也有内容看
      - 同分组内按 seed 做稳定打散 → 前端"换一批"
    """
    import random
    from ..models import Work, Watching, ProgressEntry
    from ..models.enums import PersonalStatus
    from .works import _watching_with_progress
    from ..schemas import WorkRead

    # 1. 拉最近 lookback_days 内有 progress 记录的 work id 集合(去掉补录)
    since = date.today() - timedelta(days=lookback_days)
    recent_work_ids = set(session.exec(
        select(Watching.work_id)
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.date >= since)
        .where(ProgressEntry.is_backfill == False)
        .distinct()
    ).all())

    # 2. 累积 tag 频率 / type 频率(按"作品次数"统计,每作品计一次)
    tag_freq: Dict[int, int] = defaultdict(int)
    type_freq: Dict[str, int] = defaultdict(int)
    if recent_work_ids:
        recent_works = session.exec(
            select(Work).where(Work.id.in_(recent_work_ids))
        ).all()
        for w in recent_works:
            type_freq[w.type.value] += 1
            for t in w.tags:
                tag_freq[t.id] += 1

    # 3. 拿到所有 want 作品(main 周目 personal_status=want)
    want_works = session.exec(
        select(Work)
        .join(Watching, Watching.work_id == Work.id)
        .where(Watching.round_number == 1)
        .where(Watching.personal_status == PersonalStatus.want)
        .distinct()
    ).all()

    if not want_works:
        return []

    # 4. 打分
    TAG_WEIGHT = 2
    TYPE_WEIGHT = 1
    scored = []
    for w in want_works:
        s = 0
        for t in w.tags:
            s += TAG_WEIGHT * tag_freq.get(t.id, 0)
        s += TYPE_WEIGHT * type_freq.get(w.type.value, 0)
        scored.append((s, w))

    # 5. 排序:分数降序;同分组内用 seed 打散(支持"换一批")
    rng = random.Random(seed)
    scored.sort(key=lambda pair: (-pair[0], rng.random()))

    picked = [w for _, w in scored[:limit]]

    # 6. 组装响应(复用 WorkRead + main_watching)
    out = []
    for w in picked:
        wr = WorkRead.model_validate(w)
        main = next((x for x in w.watchings if x.round_number == 1), None)
        if main is not None:
            wr.main_watching = _watching_with_progress(session, main)
        out.append(wr)
    return out


@router.get("/api/stats/type-counts")
def type_counts(
    collection_id: Optional[int] = Query(None),
    active_month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    new_month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    session: Session = Depends(get_session),
):
    """每个 WorkType 的作品总数,用于作品库类型 Tab 展示数字。

    支持的上下文过滤(与 list_works 行为对齐,保证 tab 数字 = 实际筛选结果):
      - collection_id:只数该收藏夹中的作品
      - active_month (YYYY-MM):只数该月有进度记录的作品
      - new_month (YYYY-MM):只数该月首次出现进度的作品
    多个条件按 AND 组合。
    """
    from ..models import WorkCollectionLink

    stmt = select(Work.type, func.count(func.distinct(Work.id))).group_by(Work.type)

    if collection_id is not None:
        stmt = stmt.join(WorkCollectionLink, WorkCollectionLink.work_id == Work.id) \
                   .where(WorkCollectionLink.collection_id == collection_id)

    if active_month or new_month:
        target = active_month or new_month
        year = int(target[:4])
        month = int(target[5:7])
        ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
        month_start = date(year, month, 1)
        month_end = date(ny, nm, 1)

        if active_month:
            active_subq = (
                select(Watching.work_id)
                .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
                .where(
                    ProgressEntry.date >= month_start,
                    ProgressEntry.date < month_end,
                    ProgressEntry.is_backfill == False,
                )
                .distinct()
                .subquery()
            )
            stmt = stmt.where(Work.id.in_(select(active_subq.c.work_id)))

        if new_month:
            first_subq = (
                select(
                    Watching.work_id.label("wid"),
                    func.min(ProgressEntry.date).label("first_date"),
                )
                .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
                .where(ProgressEntry.is_backfill == False)
                .group_by(Watching.work_id)
                .subquery()
            )
            stmt = stmt.where(
                Work.id.in_(
                    select(first_subq.c.wid)
                    .where(first_subq.c.first_date >= month_start)
                    .where(first_subq.c.first_date < month_end)
                )
            )

    rows = session.exec(stmt).all()

    counts = {t.value: 0 for t in WorkType}
    total = 0
    for ty, cnt in rows:
        counts[ty.value] = cnt
        total += cnt
    return {"total": total, "counts": counts}
