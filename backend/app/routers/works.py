"""作品 CRUD 路由。"""
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlmodel import Session, select, func
from ..db import get_session
from ..models import Work, Tag, Collection, Watching, ProgressEntry
from ..models.enums import WorkType, ReleaseStatus, PersonalStatus, TYPES_WITH_RANGE_PROGRESS
from ..schemas import (
    WorkCreate, WorkUpdate, WorkRead, WorkDetailRead, WatchingRead, MonthlyOverview
)
from ..utils.images import save_cover, delete_cover
from ..utils.pinyin import _to_pinyin_forms, _is_ascii_query, _pinyin_match
from .progress import sync_watching_completion
from datetime import datetime, timezone

router = APIRouter(prefix="/api/works", tags=["works"])


# 高级搜索语法解析：把 q 字符串拆成 ($tag, $favorites, $<creator>, 自由文本) 四类
# 例: '$tag:剧情 $author:Edge 三体' →
#     tag=['剧情'], fav=[], creator=[('author', 'Edge')], free=['三体']
import re

_TOKEN_RE = re.compile(r"\$(\w+):([^\s]+)")

def _parse_query(q: str):
    tags: List[str] = []
    favs: List[str] = []
    creators: List[tuple] = []
    free: List[str] = []
    pos = 0
    for m in _TOKEN_RE.finditer(q):
        # 拼接 token 前的散文部分到 free
        gap = q[pos:m.start()].strip()
        if gap:
            free.extend(gap.split())
        key = m.group(1)
        val = m.group(2)
        if not val:
            pos = m.end(); continue
        if key == "tag":
            tags.append(val)
        elif key == "favorites":
            favs.append(val)
        else:
            # 把 $author: $director: $studio: 等都当 creator key
            creators.append((key, val))
        pos = m.end()
    tail = q[pos:].strip()
    if tail:
        free.extend(tail.split())
    return tags, favs, creators, free


def _watching_with_progress(session: Session, w: Watching) -> WatchingRead:
    """把 Watching ORM 转成 schema，并补上 current_progress 和 entries_count。"""
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


@router.get("", response_model=List[WorkRead])
def list_works(
    session: Session = Depends(get_session),
    type: Optional[WorkType] = None,
    personal_status: Optional[PersonalStatus] = None,  # 按"激活周目=main"的状态筛选
    tag_id: Optional[List[int]] = Query(None),  # 多值 AND：作品需同时拥有所有传入 tag
    collection_id: Optional[int] = Query(None),
    q: Optional[str] = None,
    sort: str = Query("updated_at", regex="^(updated_at|created_at|title|rating|last_progress)$"),
    order: str = Query("desc", regex="^(asc|desc)$"),
    active_month: Optional[str] = Query(None, regex=r"^\d{4}-\d{2}$"),
    new_month: Optional[str] = Query(None, regex=r"^\d{4}-\d{2}$"),
):
    stmt = select(Work).distinct()

    # ASCII 查询(英文/拼音)统一走 Python 后处理；中文查询走 SQL LIKE
    pinyin_filters = []  # 形如 ("free", "mao") / ("tag", "mao") / ("creator", "author", "edge")

    if type:
        stmt = stmt.where(Work.type == type)
    if q:
        tag_terms, fav_terms, creator_terms, free_terms = _parse_query(q)

        # ---- 自由文本 ----
        for term in free_terms:
            if _is_ascii_query(term):
                pinyin_filters.append(("free", term.lower()))
            else:
                like = f"%{term}%"
                stmt = stmt.where((Work.title.like(like)) | (Work.original_title.like(like)))

        # ---- $tag:X (多个 AND) ----
        for tname in tag_terms:
            if _is_ascii_query(tname):
                pinyin_filters.append(("tag", tname.lower()))
            else:
                from ..models import WorkTagLink
                stmt = stmt.where(
                    select(func.count(WorkTagLink.tag_id))
                    .where(WorkTagLink.work_id == Work.id)
                    .where(WorkTagLink.tag_id.in_(
                        select(Tag.id).where(Tag.name.like(f"%{tname}%"))
                    ))
                    .scalar_subquery() > 0
                )

        # ---- $favorites:X (多个 AND) ----
        for cname in fav_terms:
            from ..models import WorkCollectionLink
            stmt = stmt.where(
                select(func.count(WorkCollectionLink.collection_id))
                .where(WorkCollectionLink.work_id == Work.id)
                .where(WorkCollectionLink.collection_id.in_(
                    select(Collection.id).where(Collection.name.like(f"%{cname}%"))
                ))
                .scalar_subquery() > 0
            )

        # ---- $author:X / $director:X 等 creator 字段 ----
        for ckey, cval in creator_terms:
            if _is_ascii_query(cval):
                pinyin_filters.append(("creator", ckey, cval.lower()))
            else:
                from sqlalchemy import func as sa_func
                stmt = stmt.where(
                    sa_func.lower(sa_func.json_extract(Work.creators, f"$.{ckey}"))
                    .like(f"%{cval.lower()}%")
                )

    if tag_id:
        # AND 语义：用子查询确保 work 的 tag 集合包含所有传入 tag
        from ..models import WorkTagLink
        stmt = stmt.where(
            select(func.count(func.distinct(WorkTagLink.tag_id)))
            .where(WorkTagLink.work_id == Work.id)
            .where(WorkTagLink.tag_id.in_(tag_id))
            .scalar_subquery() == len(set(tag_id))
        )
    if collection_id is not None:
        from ..models import WorkCollectionLink
        stmt = stmt.join(WorkCollectionLink, WorkCollectionLink.work_id == Work.id).where(
            WorkCollectionLink.collection_id == collection_id
        )

    if active_month or new_month:
        from datetime import date as _date
        target = active_month or new_month
        year = int(target[:4])
        month = int(target[5:7])
        if month == 12:
            ny, nm = year + 1, 1
        else:
            ny, nm = year, month + 1
        month_start = _date(year, month, 1)
        month_end = _date(ny, nm, 1)

        if active_month:
            # 该月有任何进度记录的作品
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
            # 该作品的"最早一条进度记录"落在该月
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
            new_filtered_subq = (
                select(first_subq.c.wid)
                .where(
                    first_subq.c.first_date >= month_start,
                    first_subq.c.first_date < month_end,
                )
                .subquery()
            )
            stmt = stmt.where(Work.id.in_(select(new_filtered_subq.c.wid)))

    if personal_status is not None:
        # 按 main 周目（round_number=1）的状态筛选
        stmt = stmt.join(Watching, Watching.work_id == Work.id).where(
            Watching.round_number == 1,
            Watching.personal_status == personal_status,
        )

    # 排序
    if sort == "rating":
        # 按 main 周目评分（要 join）
        stmt = stmt.outerjoin(Watching, (Watching.work_id == Work.id) & (Watching.round_number == 1))
        col = Watching.rating
        stmt = stmt.order_by(col.desc() if order == "desc" else col.asc())
    elif sort == "last_progress":
        # 按"最近一条进度记录"排序。
        # 用 progress.id(自增主键)而不是 date 或 created_at,因为:
        #   1) date 是用户填的,可能填过去日期,导致刚录入的不排第一
        #   2) created_at 受时区/种子数据影响:导入备份时 created_at 保留原值,
        #      可能比新录入(utcnow)更"新",新录入反而排到后面
        #   3) id 是自增主键,绝对单调:新插入的永远 > 历史所有,语义最贴合"最近在追什么"
        last_sq = (
            select(
                Watching.work_id.label("wid"),
                func.max(ProgressEntry.id).label("last_pid"),
            )
            .join(ProgressEntry, ProgressEntry.watching_id == Watching.id)
            .group_by(Watching.work_id)
            .subquery()
        )
        stmt = stmt.outerjoin(last_sq, last_sq.c.wid == Work.id)
        if order == "desc":
            stmt = stmt.order_by(
                last_sq.c.last_pid.desc().nullslast(),
                Work.updated_at.desc(),
            )
        else:
            stmt = stmt.order_by(
                last_sq.c.last_pid.asc().nullslast(),
                Work.updated_at.asc(),
            )
    else:
        col = getattr(Work, sort)
        stmt = stmt.order_by(col.desc() if order == "desc" else col.asc())

    works = session.exec(stmt).all()

    # ---- 拼音 / 英文模糊匹配（SQL 后处理）----
    # 对于 ASCII 查询，每个 work 都需要满足所有 pinyin_filters（AND）
    if pinyin_filters:
        def matches(work: Work) -> bool:
            for f in pinyin_filters:
                kind = f[0]
                if kind == "free":
                    needle = f[1]
                    # 命中 title / original_title / 任一 tag 名 / 任一 creator 值 即可
                    haystacks = [work.title or "", work.original_title or ""]
                    haystacks += [t.name for t in work.tags]
                    haystacks += [str(v) for v in (work.creators or {}).values()]
                    if not any(_pinyin_match(h, needle) for h in haystacks if h):
                        return False
                elif kind == "tag":
                    needle = f[1]
                    if not any(_pinyin_match(t.name, needle) for t in work.tags):
                        return False
                elif kind == "creator":
                    ckey, needle = f[1], f[2]
                    val = (work.creators or {}).get(ckey)
                    if not val or not _pinyin_match(str(val), needle):
                        return False
            return True

        works = [w for w in works if matches(w)]

    # 给每个 work 填充 main 周目信息(用于列表页显示进度/评分)
    out = []
    for w in works:
        wr = WorkRead.model_validate(w)
        main = next((x for x in w.watchings if x.round_number == 1), None)
        if main is not None:
            wr.main_watching = _watching_with_progress(session, main)
        out.append(wr)
    return out


@router.get("/{work_id}", response_model=WorkDetailRead)
def get_work(work_id: int, session: Session = Depends(get_session)):
    work = session.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")

    detail = WorkDetailRead.model_validate(work)
    detail.watchings = [_watching_with_progress(session, w) for w in
                        sorted(work.watchings, key=lambda x: x.round_number)]
    return detail


@router.post("", response_model=WorkDetailRead)
def create_work(
    payload: str = Form(...),  # JSON 字符串（multipart 不便嵌套）
    cover: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
):
    data = WorkCreate.model_validate_json(payload)

    # 完结作品总集数必填（电影除外）
    if (data.release_status == ReleaseStatus.finished
            and data.type in TYPES_WITH_RANGE_PROGRESS
            and not data.total_units):
        raise HTTPException(400, "完结作品必须填写总集数/总章数")

    work = Work(
        title=data.title,
        original_title=data.original_title,
        type=data.type,
        description=data.description,
        release_status=data.release_status,
        total_units=data.total_units,
        total_subunits=data.total_subunits,
        unit_label=data.unit_label,
        creators=data.creators,
    )

    # 处理封面
    if cover:
        content = cover.file.read()
        if content:
            cover_rel, thumb_rel = save_cover(content, cover.filename or "cover")
            work.cover_path = cover_rel
            work.cover_thumb_path = thumb_rel

    # 处理 tags / collections
    if data.tag_ids:
        work.tags = list(session.exec(select(Tag).where(Tag.id.in_(data.tag_ids))).all())
    if data.collection_ids:
        work.collections = list(session.exec(
            select(Collection).where(Collection.id.in_(data.collection_ids))
        ).all())

    session.add(work)
    session.flush()  # 拿到 work.id

    # 自动建 main 周目
    main_watching = Watching(
        work_id=work.id,
        round_number=1,
        personal_status=data.initial_status,
    )
    session.add(main_watching)
    session.flush()  # 拿到 main_watching.id

    # 一并补录：如果用户在新建时勾选了"我以前看过"
    if data.backfill is not None:
        from datetime import date as _date_cls

        backfill = data.backfill
        # 校验：有 range 类型必须给 range_end
        if data.type in TYPES_WITH_RANGE_PROGRESS:
            if not backfill.range_end or backfill.range_end < 1:
                raise HTTPException(400, "补录必须填写到第几集/章")
            r_start, r_end = 1, backfill.range_end
            consumed = r_end - r_start + 1
        else:
            r_start = r_end = None
            consumed = 1

        backfill_entry = ProgressEntry(
            watching_id=main_watching.id,
            date=_date_cls.today(),
            range_start=r_start,
            range_end=r_end,
            consumed_count=consumed,
            note=backfill.note,
            is_backfill=True,
        )
        session.add(backfill_entry)

        # 走和正常 create_entry 一样的副作用
        if main_watching.started_at is None:
            main_watching.started_at = _date_cls.today()
            session.add(main_watching)

        if main_watching.personal_status == PersonalStatus.want:
            main_watching.personal_status = PersonalStatus.watching
            main_watching.updated_at = datetime.now(timezone.utc)
            session.add(main_watching)

        # 连载中作品 + range_end > total → 自动扩 total
        if (work.release_status == ReleaseStatus.ongoing
                and r_end is not None
                and (work.total_units is None or r_end > work.total_units)):
            work.total_units = r_end
            work.updated_at = datetime.now(timezone.utc)
            session.add(work)

        sync_watching_completion(session, main_watching, work)

    session.commit()
    session.refresh(work)

    detail = WorkDetailRead.model_validate(work)
    detail.watchings = [_watching_with_progress(session, w) for w in work.watchings]
    return detail


@router.patch("/{work_id}", response_model=WorkDetailRead)
def update_work(
    work_id: int,
    payload: str = Form(...),
    cover: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
):
    work = session.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")

    data = WorkUpdate.model_validate_json(payload)
    update_dict = data.model_dump(exclude_unset=True)

    tag_ids = update_dict.pop("tag_ids", None)
    collection_ids = update_dict.pop("collection_ids", None)

    for k, v in update_dict.items():
        setattr(work, k, v)

    if cover:
        content = cover.file.read()
        if content:
            # 删除旧封面
            delete_cover(work.cover_path, work.cover_thumb_path)
            cover_rel, thumb_rel = save_cover(content, cover.filename or "cover")
            work.cover_path = cover_rel
            work.cover_thumb_path = thumb_rel

    if tag_ids is not None:
        work.tags = list(session.exec(select(Tag).where(Tag.id.in_(tag_ids))).all()) if tag_ids else []
    if collection_ids is not None:
        work.collections = list(session.exec(
            select(Collection).where(Collection.id.in_(collection_ids))
        ).all()) if collection_ids else []

    work.updated_at = datetime.now(timezone.utc)
    session.add(work)

    # 状态切换时（ongoing↔finished、total_units 变化）同步所有周目的完成状态
    for w in work.watchings:
        sync_watching_completion(session, w, work)

    session.commit()
    session.refresh(work)

    detail = WorkDetailRead.model_validate(work)
    detail.watchings = [_watching_with_progress(session, w) for w in
                        sorted(work.watchings, key=lambda x: x.round_number)]
    return detail


@router.delete("/{work_id}")
def delete_work(work_id: int, session: Session = Depends(get_session)):
    work = session.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")
    delete_cover(work.cover_path, work.cover_thumb_path)
    session.delete(work)
    session.commit()
    return {"ok": True}