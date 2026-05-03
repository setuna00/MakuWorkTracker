"""作品 CRUD 路由。"""
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlmodel import Session, select, func
from ..db import get_session
from ..models import Work, Tag, Collection, Watching, ProgressEntry
from ..models.enums import WorkType, ReleaseStatus, PersonalStatus
from ..schemas import (
    WorkCreate, WorkUpdate, WorkRead, WorkDetailRead, WatchingRead, MonthlyOverview
)
from ..utils.images import save_cover, delete_cover
from datetime import datetime, timezone

router = APIRouter(prefix="/api/works", tags=["works"])


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
    tag_id: Optional[int] = None,
    collection_id: Optional[int] = None,
    q: Optional[str] = None,
    sort: str = Query("updated_at", regex="^(updated_at|created_at|title|rating)$"),
    order: str = Query("desc", regex="^(asc|desc)$"),
):
    stmt = select(Work).distinct()

    if type:
        stmt = stmt.where(Work.type == type)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Work.title.like(like)) | (Work.original_title.like(like)))
    if tag_id is not None:
        from ..models import WorkTagLink
        stmt = stmt.join(WorkTagLink, WorkTagLink.work_id == Work.id).where(WorkTagLink.tag_id == tag_id)
    if collection_id is not None:
        from ..models import WorkCollectionLink
        stmt = stmt.join(WorkCollectionLink, WorkCollectionLink.work_id == Work.id).where(
            WorkCollectionLink.collection_id == collection_id
        )

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
    else:
        col = getattr(Work, sort)
    stmt = stmt.order_by(col.desc() if order == "desc" else col.asc())

    works = session.exec(stmt).all()
    return [WorkRead.model_validate(w) for w in works]


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
    from ..models.enums import TYPES_WITH_RANGE_PROGRESS
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
