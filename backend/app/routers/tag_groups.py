"""标签组 CRUD。"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import update
from sqlmodel import Session, func, select


from ..db import get_session
from ..models import Tag, TagGroup
from ..schemas import TagGroupCreate, TagGroupRead, TagGroupUpdate
from .tags import _get_default_group_id

router = APIRouter(prefix="/api/tag-groups", tags=["tag_groups"])


class TagGroupReorderIn(BaseModel):
    order: List[int]


def _validate_group_name_unique(
    session: Session,
    name: str,
    exclude_group_id: int | None = None,
) -> None:
    """校验标签组名唯一。"""
    stmt = select(TagGroup).where(TagGroup.name == name)
    if exclude_group_id is not None:
        stmt = stmt.where(TagGroup.id != exclude_group_id)

    if session.exec(stmt).first():
        raise HTTPException(400, "标签组已存在")


@router.get("", response_model=List[TagGroupRead])
def list_tag_groups(session: Session = Depends(get_session)):
    """列出所有标签组：sort_order 升序，相同时 created_at 升序。"""
    groups = session.exec(
        select(TagGroup).order_by(TagGroup.sort_order.asc(), TagGroup.created_at.asc())
    ).all()
    return groups


@router.post("", response_model=TagGroupRead)
def create_tag_group(data: TagGroupCreate, session: Session = Depends(get_session)):
    """新增标签组。API 不允许创建默认组。"""
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "标签组名不能为空")

    _validate_group_name_unique(session, name)

    result = session.exec(select(func.max(TagGroup.sort_order))).first()
    max_order = (result[0] if isinstance(result, tuple) else result) or 0
    next_order = (
        max_order + 1
        if data.sort_order is None or data.sort_order == 0
        else data.sort_order
    )

    group = TagGroup(
        name=name,
        sort_order=next_order,
        is_default=False,  # 不允许通过 API 创建默认组
    )
    session.add(group)
    session.commit()
    session.refresh(group)
    return TagGroupRead.model_validate(group)


@router.patch("/{group_id}", response_model=TagGroupRead)
def update_tag_group(
    group_id: int,
    data: TagGroupUpdate,
    session: Session = Depends(get_session),
):
    """更新标签组。

    默认组允许改 name 和 sort_order。
    is_default 不从 PATCH body 读取/写入，即使客户端传了也不会生效。
    """
    group = session.get(TagGroup, group_id)
    if not group:
        raise HTTPException(404, "标签组不存在")

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(400, "标签组名不能为空")
        _validate_group_name_unique(session, name, exclude_group_id=group_id)
        group.name = name

    if data.sort_order is not None:
        group.sort_order = data.sort_order

    session.add(group)
    session.commit()
    session.refresh(group)
    return TagGroupRead.model_validate(group)


@router.delete("/{group_id}")
def delete_tag_group(group_id: int, session: Session = Depends(get_session)):
    """删除标签组。

    删除前把该组下所有标签移动到默认组，同一事务提交。
    """
    group = session.get(TagGroup, group_id)
    if not group:
        raise HTTPException(404, "标签组不存在")

    if group.is_default:
        raise HTTPException(400, "默认标签组不可删除")

    default_group_id = _get_default_group_id(session)

    moved_tags = len(session.exec(select(Tag).where(Tag.group_id == group_id)).all())

    # 先用 SQL 批量更新，避免 ORM 删除父对象时把子 tag.group_id 置空
    session.exec(
        update(Tag)
        .where(Tag.group_id == group_id)
        .values(group_id=default_group_id)
    )
    session.flush()

    session.delete(group)
    session.commit()

    return {"ok": True, "moved_tags": moved_tags}


@router.post("/reorder")
def reorder_tag_groups(
    data: TagGroupReorderIn,
    session: Session = Depends(get_session),
):
    """按传入 id 顺序重排全部标签组。"""
    groups = session.exec(select(TagGroup)).all()
    group_by_id = {g.id: g for g in groups}
    existing_ids = set(group_by_id.keys())
    order_ids = set(data.order)

    if not order_ids.issubset(existing_ids):
        raise HTTPException(400, "ID 不存在")

    if len(order_ids) != len(data.order) or order_ids != existing_ids:
        raise HTTPException(400, "排序列表必须包含所有标签组")

    for sort_order, group_id in enumerate(data.order):
        group = group_by_id[group_id]
        group.sort_order = sort_order
        session.add(group)

    session.commit()
    return {"ok": True}