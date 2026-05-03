"""标签 CRUD。"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Tag
from ..schemas import TagCreate, TagUpdate, TagRead

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=List[TagRead])
def list_tags(session: Session = Depends(get_session)):
    tags = session.exec(select(Tag).order_by(Tag.name)).all()
    return [TagRead.model_validate(t) for t in tags]


@router.post("", response_model=TagRead)
def create_tag(data: TagCreate, session: Session = Depends(get_session)):
    if session.exec(select(Tag).where(Tag.name == data.name)).first():
        raise HTTPException(400, "标签已存在")
    tag = Tag(name=data.name, color=data.color)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return TagRead.model_validate(tag)


@router.patch("/{tag_id}", response_model=TagRead)
def update_tag(tag_id: int, data: TagUpdate, session: Session = Depends(get_session)):
    tag = session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(404, "Tag not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tag, k, v)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return TagRead.model_validate(tag)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, session: Session = Depends(get_session)):
    tag = session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(404, "Tag not found")
    session.delete(tag)
    session.commit()
    return {"ok": True}
