"""收藏夹 CRUD。"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Collection
from ..schemas import CollectionCreate, CollectionUpdate, CollectionRead

router = APIRouter(prefix="/api/collections", tags=["collections"])


@router.get("", response_model=List[CollectionRead])
def list_collections(session: Session = Depends(get_session)):
    cols = session.exec(select(Collection).order_by(Collection.sort_order, Collection.name)).all()
    return [CollectionRead.model_validate(c) for c in cols]


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
