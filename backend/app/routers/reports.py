"""月度/年度报告。

设计要点:
- 报告内容按月生成快照(JSON),写入 MonthlyReport 表;一旦生成,后续数据变更不影响历史报告
- 所有统计严格过滤 is_backfill==False —— 补录绝不进报告
- 不弹"本月还没结束"的报告:首次打开 app 时弹的是"上个月"的报告
- 缺失某个月直接生成:补历史 / 1 号自动生成 / 用户手动 regenerate
"""
import json
from datetime import date, datetime, timedelta
from typing import Optional, Dict, List
from collections import defaultdict, Counter

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func

from ..db import get_session
from ..models import (
    Work, Watching, ProgressEntry, Tag, MonthlyReport, WorkTagLink,
)
from ..models.enums import PersonalStatus, ReleaseStatus, WorkType, TYPES_WITH_RANGE_PROGRESS

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ---------- 工具 ----------

def _month_bounds(year: int, month: int):
    """返回 (month_start, month_end_excl) 两个 date,左闭右开。"""
    if month == 12:
        ny, nm = year + 1, 1
    else:
        ny, nm = year, month + 1
    return date(year, month, 1), date(ny, nm, 1)


def _add_month(y: int, m: int):
    if m == 12:
        return y + 1, 1
    return y, m + 1


def _previous_month(y: int, m: int):
    if m == 1:
        return y - 1, 12
    return y, m - 1


def _longest_streak(days: List[date]) -> int:
    """Return the longest consecutive run of activity days."""
    if not days:
        return 0
    ordered = sorted(set(days))
    longest = current = 1
    for previous, current_day in zip(ordered, ordered[1:]):
        if current_day == previous + timedelta(days=1):
            current += 1
            longest = max(longest, current)
        else:
            current = 1
    return longest


def _qualified_completions(session: Session, month_start: date, month_end: date):
    """Return completions proven by a non-backfill entry in the month.

    finished_at confirms that the round completed in the month. Range-based works
    also need a regular entry that reaches the current total; non-range works need
    a regular viewing entry. A backfill-only completion is therefore excluded.
    """
    candidates = session.exec(
        select(Work, Watching)
        .join(Watching, Watching.work_id == Work.id)
        .where(Watching.finished_at >= month_start)
        .where(Watching.finished_at < month_end)
        .order_by(Watching.finished_at.desc(), Watching.round_number.desc())
    ).all()

    qualified = []
    for work, watching in candidates:
        entries = session.exec(
            select(ProgressEntry)
            .where(ProgressEntry.watching_id == watching.id)
            .where(ProgressEntry.date >= month_start)
            .where(ProgressEntry.date < month_end)
            .where(ProgressEntry.is_backfill == False)
            .order_by(ProgressEntry.date.desc(), ProgressEntry.created_at.desc())
        ).all()
        if work.type in TYPES_WITH_RANGE_PROGRESS:
            if work.total_units is None:
                continue
            evidence = next(
                (entry for entry in entries
                 if entry.range_end is not None and entry.range_end >= work.total_units),
                None,
            )
        else:
            evidence = entries[0] if entries else None
        if evidence is not None:
            qualified.append((work, watching, evidence))
    return qualified
def _caught_up_works(session: Session, month_start: date, month_end: date):
    """Return ongoing works that reached the currently available total this month.

    This follows the same rule used by the home page's "waiting for updates"
    group: an ongoing range-based work remains in watching status and its regular
    progress reaches the work's available total. Backfill entries never qualify.
    """
    candidates = session.exec(
        select(Work, Watching)
        .join(Watching, Watching.work_id == Work.id)
        .where(Work.release_status == ReleaseStatus.ongoing)
        .where(Work.total_units.is_not(None))
        .where(Watching.personal_status == PersonalStatus.watching)
        .order_by(Work.id, Watching.round_number.desc())
    ).all()

    caught_up = []
    seen_work_ids = set()
    for work, watching in candidates:
        if work.id in seen_work_ids or work.type not in TYPES_WITH_RANGE_PROGRESS:
            continue
        evidence = session.exec(
            select(ProgressEntry)
            .where(ProgressEntry.watching_id == watching.id)
            .where(ProgressEntry.date >= month_start)
            .where(ProgressEntry.date < month_end)
            .where(ProgressEntry.is_backfill == False)
            .where(ProgressEntry.range_end >= work.total_units)
            .order_by(ProgressEntry.date.desc(), ProgressEntry.created_at.desc())
        ).first()
        if evidence is not None:
            caught_up.append((work, watching, evidence))
            seen_work_ids.add(work.id)
    return caught_up


def _month_kpis(session: Session, year: int, month: int) -> dict:
    """Build the headline metrics shared by current and comparison months."""
    month_start, month_end = _month_bounds(year, month)
    entries_count = session.exec(
        select(func.count(ProgressEntry.id))
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
    ).one() or 0
    active_works = session.exec(
        select(func.count(func.distinct(Watching.work_id)))
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
    ).one() or 0
    active_days = session.exec(
        select(func.count(func.distinct(ProgressEntry.date)))
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
    ).one() or 0

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
    new_works = session.exec(
        select(func.count(first_subq.c.wid))
        .where(first_subq.c.first_date >= month_start)
        .where(first_subq.c.first_date < month_end)
    ).one() or 0
    completed_works = len({work.id for work, _, _ in _qualified_completions(
        session, month_start, month_end
    )})
    return {
        "entries_count": entries_count,
        "active_days": active_days,
        "active_works": active_works,
        "new_works": new_works,
        "completed_works": completed_works,
    }


def _first_progress_month(session: Session):
    """返回数据库里最早一条 progress entry 所在的月,用于补历史的起点。
    若一条都没,返回 None。补录也算(让用户能看到历史)。
    """
    earliest = session.exec(
        select(func.min(ProgressEntry.date)).where(ProgressEntry.is_backfill == False)
    ).one()
    if not earliest:
        return None
    return earliest.year, earliest.month


# ---------- 报告生成核心 ----------

def generate_monthly_report(session: Session, year: int, month: int) -> dict:
    """生成指定年月的报告数据(dict 形式)。

    所有指标严格排除 is_backfill==True 的 progress entry。
    完成作品:基于 watching.finished_at 在该月份内。
    """
    month_start, month_end = _month_bounds(year, month)

    # ---- A. stats ----
    # 本月记录条数(非补录)
    entries_count = session.exec(
        select(func.count(ProgressEntry.id))
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
    ).one() or 0

    # 本月活跃作品数(本月有进度的不同 work)
    active_works_count = session.exec(
        select(func.count(func.distinct(Watching.work_id)))
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
    ).one() or 0

    # 本月新开作品数(该作品最早 progress 落在本月)
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
    new_works_count = session.exec(
        select(func.count(first_subq.c.wid))
        .where(first_subq.c.first_date >= month_start)
        .where(first_subq.c.first_date < month_end)
    ).one() or 0

    # 本月完成作品必须由该月的非补档记录证明。
    qualified_completions = _qualified_completions(session, month_start, month_end)
    completed_works_count = len({work.id for work, _, _ in qualified_completions})
    active_days_count = session.exec(
        select(func.count(func.distinct(ProgressEntry.date)))
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
    ).one() or 0

    previous_year, previous_month = _previous_month(year, month)
    current_kpis = {
        "entries_count": entries_count,
        "active_days": active_days_count,
        "active_works": active_works_count,
        "new_works": new_works_count,
        "completed_works": completed_works_count,
    }
    previous_kpis = _month_kpis(session, previous_year, previous_month)
    comparison = {
        "year": previous_year, "month": previous_month,
        "has_activity": previous_kpis["entries_count"] > 0,
        "previous": previous_kpis,
        "delta": {key: current_kpis[key] - previous_kpis[key] for key in current_kpis},
    }

    # ---- B. 类型分布(本月活跃作品按类型分桶) ----
    active_works_with_type = session.exec(
        select(Work.id, Work.type)
        .join(Watching, Watching.work_id == Work.id)
        .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
        .distinct()
    ).all()
    type_counter = Counter(t.value for _, t in active_works_with_type)
    type_distribution = [
        {"type": t, "count": c}
        for t, c in sorted(type_counter.items(), key=lambda x: -x[1])
    ]

    # ---- C. 高频 tag Top 5(本月活跃作品所带的 tag) ----
    active_work_ids = [wid for wid, _ in active_works_with_type]
    top_tags: List[dict] = []
    if active_work_ids:
        tag_rows = session.exec(
            select(Tag.id, Tag.name, func.count(WorkTagLink.work_id).label("c"))
            .join(WorkTagLink, WorkTagLink.tag_id == Tag.id)
            .where(WorkTagLink.work_id.in_(active_work_ids))
            .group_by(Tag.id, Tag.name)
            .order_by(func.count(WorkTagLink.work_id).desc())
            .limit(5)
        ).all()
        top_tags = [{"tag_id": tid, "tag_name": name, "count": c} for tid, name, c in tag_rows]

    # ---- D. 评分洞察(本月新增的评分,基于 watching.updated_at + rating 不为空) ----
    # 注:rating 是 Watching 字段,没有"本月评分"的精确语义。
    # 这里用近似:本月活跃的作品中,有评分的部分作为"本月评分作品"。
    # 后续如果想做更精确的"本月新增评分",得加 rating_updated_at 字段。
    rating_insight = None
    if active_work_ids:
        latest_rounds = (
            select(
                Watching.work_id.label("work_id"),
                func.max(Watching.round_number).label("round_number"),
            )
            .group_by(Watching.work_id)
            .subquery()
        )
        rated_rows = session.exec(
            select(Work.id, Work.title, Work.cover_path, Work.cover_thumb_path, Watching.rating)
            .join(latest_rounds, latest_rounds.c.work_id == Work.id)
            .join(
                Watching,
                (Watching.work_id == latest_rounds.c.work_id)
                & (Watching.round_number == latest_rounds.c.round_number),
            )
            .where(Work.id.in_(active_work_ids))
            .where(Watching.rating.is_not(None))
        ).all()
        if rated_rows:
            ratings = [row[4] for row in rated_rows]
            avg = round(sum(ratings) / len(ratings), 1)
            highest = max(rated_rows, key=lambda row: row[4])
            rating_insight = {
                "rated_count": len(rated_rows),
                "average": avg,
                "highest": {
                    "work_id": highest[0],
                    "title": highest[1],
                    "cover_path": highest[2],
                    "cover_thumb_path": highest[3],
                    "rating": highest[4],
                },
            }

    # ---- E. 月历热力图(每天的非补录条目数) ----
    daily_counts = session.exec(
        select(
            ProgressEntry.date,
            func.count(ProgressEntry.id),
            func.sum(ProgressEntry.consumed_count),
            func.count(func.distinct(Watching.work_id)),
        )
        .join(Watching, ProgressEntry.watching_id == Watching.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
        .group_by(ProgressEntry.date)
    ).all()
    daily_activity = {
        d.isoformat(): {
            "entries": entry_count,
            "consumed": consumed or 0,
            "works": work_count,
        }
        for d, entry_count, consumed, work_count in daily_counts
    }
    heatmap = {day: values["entries"] for day, values in daily_activity.items()}
    activity_dates = [date.fromisoformat(day) for day in daily_activity]
    busiest_day = None
    if daily_activity:
        busiest_date, busiest_values = max(
            daily_activity.items(),
            key=lambda item: (item[1]["entries"], item[1]["consumed"], item[0]),
        )
        busiest_day = {"date": busiest_date, **busiest_values}
    activity_insight = {
        "active_days": active_days_count,
        "longest_streak": _longest_streak(activity_dates),
        "busiest_day": busiest_day,
    }

    # ---- E2. 本月实际推进量(不同单位分开统计) ----
    consumption_rows = session.exec(
        select(
            Work.type,
            Work.unit_label,
            func.sum(ProgressEntry.consumed_count),
        )
        .join(Watching, ProgressEntry.watching_id == Watching.id)
        .join(Work, Watching.work_id == Work.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
        .group_by(Work.type, Work.unit_label)
    ).all()
    type_order = {
        WorkType.anime: 0,
        WorkType.tv: 1,
        WorkType.movie: 2,
        WorkType.manga: 3,
        WorkType.novel: 4,
        WorkType.other: 5,
    }
    consumption = [
        {
            "type": work_type.value,
            "unit_label": unit_label,
            "count": consumed or 0,
        }
        for work_type, unit_label, consumed in sorted(
            consumption_rows,
            key=lambda row: (type_order.get(row[0], 99), row[1] or ""),
        )
    ]

    # ---- E3. 按推进量排序的本月作品 ----
    work_rows = session.exec(
        select(
            Work.id,
            Work.title,
            Work.cover_thumb_path,
            Work.type,
            Work.unit_label,
            func.sum(ProgressEntry.consumed_count),
            func.count(ProgressEntry.id),
            func.count(func.distinct(ProgressEntry.date)),
            func.min(ProgressEntry.range_start),
            func.max(ProgressEntry.range_end),
        )
        .join(Watching, ProgressEntry.watching_id == Watching.id)
        .join(Work, Watching.work_id == Work.id)
        .where(ProgressEntry.date >= month_start)
        .where(ProgressEntry.date < month_end)
        .where(ProgressEntry.is_backfill == False)
        .group_by(Work.id, Work.title, Work.cover_thumb_path, Work.type, Work.unit_label)
        .order_by(
            func.count(func.distinct(ProgressEntry.date)).desc(),
            func.count(ProgressEntry.id).desc(),
            func.sum(ProgressEntry.consumed_count).desc(),
        )
    ).all()
    latest_status = {}
    if active_work_ids:
        watching_rows = session.exec(
            select(Watching)
            .where(Watching.work_id.in_(active_work_ids))
            .order_by(Watching.work_id, Watching.round_number.desc())
        ).all()
        for watching in watching_rows:
            latest_status.setdefault(watching.work_id, watching.personal_status.value)
    work_ranking = [
        {
            "work_id": wid,
            "title": title,
            "cover_thumb_path": cover,
            "type": work_type.value,
            "unit_label": unit_label,
            "consumed_count": consumed or 0,
            "entries_count": entry_count,
            "active_days": active_days,
            "progress_start": progress_start,
            "progress_end": progress_end,
            "status": latest_status.get(wid),
        }
        for (
            wid, title, cover, work_type, unit_label, consumed, entry_count,
            active_days, progress_start, progress_end,
        ) in work_rows
    ]

    # ---- F. 完成的作品列表(本月 finished 的 watching 关联的 work) ----
    completed_list = [
        {
            "work_id": work.id,
            "title": work.title,
            "cover_thumb_path": work.cover_thumb_path,
            "type": work.type.value,
            "rating": watching.rating,
            "round_number": watching.round_number,
            "round_label": watching.label,
            "completed_at": evidence.date.isoformat(),
            "overall_review": watching.overall_review,
        }
        for work, watching, evidence in qualified_completions
    ]
    caught_up_list = [
        {
            "work_id": work.id,
            "title": work.title,
            "cover_thumb_path": work.cover_thumb_path,
            "type": work.type.value,
            "unit_label": work.unit_label,
            "rating": watching.rating,
            "round_number": watching.round_number,
            "round_label": watching.label,
            "caught_up_at": evidence.date.isoformat(),
            "progress_end": evidence.range_end,
            "overall_review": watching.overall_review,
        }
        for work, watching, evidence in _caught_up_works(
            session, month_start, month_end
        )
    ]

    # ---- G. 文字总结(模板化,前端可选择渲染或自行生成) ----
    summary_parts = []
    if entries_count > 0:
        summary_parts.append(f"这个月你记录了 {entries_count} 条进度,涉及 {active_works_count} 部作品")
    if new_works_count > 0:
        summary_parts.append(f"新开了 {new_works_count} 部")
    if completed_works_count > 0:
        summary_parts.append(f"完成了 {completed_works_count} 部")
    if top_tags:
        summary_parts.append(f"最常出现的标签是「{top_tags[0]['tag_name']}」")
    summary_text = "。".join(summary_parts) + ("。" if summary_parts else "")

    return {
        "year": year,
        "month": month,
        "stats": {
            "entries_count": entries_count,
            "active_days": active_days_count,
            "active_works": active_works_count,
            "new_works": new_works_count,
            "completed_works": completed_works_count,
        },
        "comparison": comparison,
        "activity_insight": activity_insight,
        "consumption": consumption,
        "work_ranking": work_ranking,
        "type_distribution": type_distribution,
        "top_tags": top_tags,
        "rating_insight": rating_insight,
        "heatmap": heatmap,
        "daily_activity": daily_activity,
        "completed_list": completed_list,
        "caught_up_list": caught_up_list,
        "summary_text": summary_text,
    }


def _save_report(session: Session, year: int, month: int, data: dict, overwrite: bool = False) -> MonthlyReport:
    existing = session.exec(
        select(MonthlyReport).where(MonthlyReport.year == year).where(MonthlyReport.month == month)
    ).first()
    if existing:
        if not overwrite:
            return existing
        existing.data = json.dumps(data, ensure_ascii=False)
        existing.generated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    rep = MonthlyReport(
        year=year, month=month,
        data=json.dumps(data, ensure_ascii=False),
    )
    session.add(rep)
    session.commit()
    session.refresh(rep)
    return rep


# ---------- API ----------

@router.get("/monthly/list")
def list_reports(session: Session = Depends(get_session)):
    """已有报告的年月列表,用于设置页历史报告面板。"""
    rows = session.exec(
        select(MonthlyReport.year, MonthlyReport.month, MonthlyReport.generated_at)
        .order_by(MonthlyReport.year.desc(), MonthlyReport.month.desc())
    ).all()
    return [{"year": y, "month": m, "generated_at": ga.isoformat()} for y, m, ga in rows]


@router.get("/monthly")
def get_report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    session: Session = Depends(get_session),
):
    """取指定年月的快照。不存在时按需生成并存快照(同时也补上历史里漏掉的月份)。"""
    rep = session.exec(
        select(MonthlyReport).where(MonthlyReport.year == year).where(MonthlyReport.month == month)
    ).first()
    if rep:
        return json.loads(rep.data)
    # 不存在 → 生成并存
    data = generate_monthly_report(session, year, month)
    _save_report(session, year, month, data, overwrite=False)
    return data


@router.post("/monthly/regenerate")
def regenerate_report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    session: Session = Depends(get_session),
):
    """强制重新生成某月报告,覆盖原有快照。用户在设置里点"重新生成"时调。"""
    data = generate_monthly_report(session, year, month)
    rep = _save_report(session, year, month, data, overwrite=True)
    return {"ok": True, "generated_at": rep.generated_at.isoformat()}


@router.post("/monthly/generate-all-history")
def generate_all_history(session: Session = Depends(get_session)):
    """补生从最早 progress entry 那一月到上个月的所有报告。

    已存在的不重新生成(idempotent);只填空白月。返回新生成的月份列表。
    用户在设置里手动触发,首次启用时弹个提示自动调一次。
    """
    earliest = _first_progress_month(session)
    if earliest is None:
        return {"generated": [], "message": "no progress yet"}

    today = date.today()
    # 终点:上一月(不含本月,因为本月没结束不出报告)
    end_y, end_m = today.year, today.month
    end_y, end_m = (end_y, end_m - 1) if end_m > 1 else (end_y - 1, 12)

    # 现有的(避免重复生成)
    existing = {
        (y, m) for y, m in session.exec(
            select(MonthlyReport.year, MonthlyReport.month)
        ).all()
    }

    generated = []
    y, m = earliest
    while (y, m) <= (end_y, end_m):
        if (y, m) not in existing:
            data = generate_monthly_report(session, y, m)
            _save_report(session, y, m, data, overwrite=False)
            generated.append({"year": y, "month": m})
        y, m = _add_month(y, m)

    return {"generated": generated, "count": len(generated)}


@router.get("/monthly/should-prompt")
def should_prompt(session: Session = Depends(get_session)):
    """前端启动时调用:是否应该弹"上个月"的报告?

    条件:
      - 今天 >= 上月 1 号(永远满足)且 今天 >= 本月 1 号(永远满足)
      - 上月有数据(非补录条目 > 0)—— 否则没意义
      - 已存在 / 自动生成 上月报告
      - 前端会自己负责"用户已关过本月一次"的 localStorage 判定,后端只告诉它有没有
    """
    today = date.today()
    if today.month > 1:
        prev_y, prev_m = today.year, today.month - 1
    else:
        prev_y, prev_m = today.year - 1, 12

    prev_start, prev_end = _month_bounds(prev_y, prev_m)
    has_data = session.exec(
        select(func.count(ProgressEntry.id))
        .where(ProgressEntry.date >= prev_start)
        .where(ProgressEntry.date < prev_end)
        .where(ProgressEntry.is_backfill == False)
    ).one() or 0

    if not has_data:
        return {"should": False}

    # 自动确保上月报告已生成
    existing = session.exec(
        select(MonthlyReport).where(MonthlyReport.year == prev_y).where(MonthlyReport.month == prev_m)
    ).first()
    if not existing:
        data = generate_monthly_report(session, prev_y, prev_m)
        _save_report(session, prev_y, prev_m, data, overwrite=False)

    return {"should": True, "year": prev_y, "month": prev_m}


@router.delete("/monthly")
def delete_report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    session: Session = Depends(get_session),
):
    """删除某月报告(如果用户想重新生成或不想留这个月)。"""
    rep = session.exec(
        select(MonthlyReport).where(MonthlyReport.year == year).where(MonthlyReport.month == month)
    ).first()
    if not rep:
        raise HTTPException(404, "Report not found")
    session.delete(rep)
    session.commit()
    return {"ok": True}
