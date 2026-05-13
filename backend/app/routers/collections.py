"""收藏夹 CRUD。"""
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from ..db import get_session
from ..models import Collection, Work, WorkCollectionLink
from ..schemas import CollectionCreate, CollectionUpdate, CollectionRead

router = APIRouter(prefix="/api/collections", tags=["collections"])


@router.get("", response_model=List[CollectionRead])
def list_collections(session: Session = Depends(get_session)):
    cols = session.exec(select(Collection).order_by(Collection.sort_order, Collection.name)).all()
    # 一次查所有 collection 的作品数,避免 N+1
    counts = dict(session.exec(
        select(WorkCollectionLink.collection_id, func.count(WorkCollectionLink.work_id))
        .group_by(WorkCollectionLink.collection_id)
    ).all())
    out = []
    for c in cols:
        cr = CollectionRead.model_validate(c)
        cr.work_count = counts.get(c.id, 0)
        out.append(cr)
    return out


@router.post("", response_model=CollectionRead)
def create_collection(data: CollectionCreate, session: Session = Depends(get_session)):
    if session.exec(select(Collection).where(Collection.name == data.name)).first():
        raise HTTPException(400, "收藏夹已存在")
    col = Collection(**data.model_dump())
    session.add(col)
    session.commit()
    session.refresh(col)
    return CollectionRead.model_validate(col)


@router.patch("/{col_id}", response_model=CollectionRead)
def update_collection(col_id: int, data: CollectionUpdate, session: Session = Depends(get_session)):
    col = session.get(Collection, col_id)
    if not col:
        raise HTTPException(404, "Collection not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(col, k, v)
    session.add(col)
    session.commit()
    session.refresh(col)
    return CollectionRead.model_validate(col)


@router.delete("/{col_id}")
def delete_collection(col_id: int, session: Session = Depends(get_session)):
    col = session.get(Collection, col_id)
    if not col:
        raise HTTPException(404, "Collection not found")
    session.delete(col)
    session.commit()
    return {"ok": True}


# ---------- 批量加入/移出 ----------

class BulkAddWorksPayload(BaseModel):
    work_ids: List[int]


@router.post("/{col_id}/works")
def bulk_add_works(col_id: int, payload: BulkAddWorksPayload, session: Session = Depends(get_session)):
    """批量把作品加入收藏夹。已存在的链接会被跳过(不报错)。"""
    col = session.get(Collection, col_id)
    if not col:
        raise HTTPException(404, "Collection not found")
    if not payload.work_ids:
        return {"added": 0, "skipped": 0}

    # 验证 work 都存在
    existing_works = set(session.exec(
        select(Work.id).where(Work.id.in_(payload.work_ids))
    ).all())

    # 当前已经在收藏夹里的链接
    already_linked = set(session.exec(
        select(WorkCollectionLink.work_id)
        .where(WorkCollectionLink.collection_id == col_id)
        .where(WorkCollectionLink.work_id.in_(payload.work_ids))
    ).all())

    added = 0
    skipped = 0
    for wid in payload.work_ids:
        if wid not in existing_works:
            skipped += 1
            continue
        if wid in already_linked:
            skipped += 1
            continue
        session.add(WorkCollectionLink(work_id=wid, collection_id=col_id))
        added += 1

    session.commit()
    return {"added": added, "skipped": skipped}


@router.delete("/{col_id}/works/{work_id}")
def remove_work_from_collection(col_id: int, work_id: int, session: Session = Depends(get_session)):
    """把单个作品从收藏夹移出。"""
    link = session.exec(
        select(WorkCollectionLink)
        .where(WorkCollectionLink.collection_id == col_id)
        .where(WorkCollectionLink.work_id == work_id)
    ).first()
    if not link:
        raise HTTPException(404, "Link not found")
    session.delete(link)
    session.commit()
    return {"ok": True}
