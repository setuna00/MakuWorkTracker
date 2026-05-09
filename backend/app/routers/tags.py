"""标签 CRUD。"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..db import get_session
from ..models import Tag
from ..schemas import TagCreate, TagUpdate, TagRead

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=List[TagRead])
def list_tags(
    in_collection: int | None = None,
    session: Session = Depends(get_session),
):
    """列出标签。
    - 默认:work_count = 全局有该 tag 的作品数
    - in_collection 指定时:work_count = 该收藏夹内有该 tag 的作品数
    排序:work_count 降序、相同时按名字升序
    """
    from sqlmodel import func
    from ..models import WorkTagLink, WorkCollectionLink

    if in_collection is not None:
        # 子集计数:WorkTagLink JOIN WorkCollectionLink 同一个 work_id,且 collection 命中
        cnt_join = (
            select(WorkTagLink.tag_id, func.count(WorkTagLink.work_id).label("cnt"))
            .join(WorkCollectionLink, WorkCollectionLink.work_id == WorkTagLink.work_id)
            .where(WorkCollectionLink.collection_id == in_collection)
            .group_by(WorkTagLink.tag_id)
            .subquery()
        )
        rows = session.exec(
            select(Tag, func.coalesce(cnt_join.c.cnt, 0).label("cnt"))
            .outerjoin(cnt_join, cnt_join.c.tag_id == Tag.id)
            .order_by(func.coalesce(cnt_join.c.cnt, 0).desc(), Tag.name.asc())
        ).all()
    else:
        # 全局计数
        rows = session.exec(
            select(Tag, func.count(WorkTagLink.work_id).label("cnt"))
            .outerjoin(WorkTagLink, WorkTagLink.tag_id == Tag.id)
            .group_by(Tag.id)
            .order_by(func.count(WorkTagLink.work_id).desc(), Tag.name.asc())
        ).all()

    out = []
    for tag, cnt in rows:
        d = TagRead.model_validate(tag).model_dump()
        d["work_count"] = int(cnt or 0)
        out.append(TagRead(**d))
    return out


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
