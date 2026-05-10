"""标签 CRUD。"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func
from ..db import get_session
from ..models import Tag
from ..models.enums import WorkType
from ..schemas import TagCreate, TagUpdate, TagRead

router = APIRouter(prefix="/api/tags", tags=["tags"])


def _get_default_group_id(session: Session) -> int:
    """取默认组 id。按 is_default=True 查；正常迁移后必定存在一条。"""
    from ..models import TagGroup
    grp = session.exec(select(TagGroup).where(TagGroup.is_default == True)).first()
    if not grp:
        raise HTTPException(500, "默认标签组不存在，请检查数据库迁移")
    return grp.id


def _validate_alias_namespace(
    session: Session,
    name: str,
    aliases: List[str],
    exclude_tag_id: Optional[int] = None,
) -> None:
    """校验全局别名空间唯一性：name + 所有 aliases 都不能与
    其他 tag 的 name 或 aliases 冲突，自身内部也不能重复。
    """
    # 自身内部不重复（含 name 和 aliases 之间）
    candidates = [name] + list(aliases)
    seen = set()
    for c in candidates:
        c_norm = c.strip()
        if not c_norm:
            raise HTTPException(400, "标签名/别名不能为空字符串")
        if c_norm in seen:
            raise HTTPException(400, f"重复的标签名/别名：{c_norm}")
        seen.add(c_norm)

    # 跨 tag 不冲突
    all_tags = session.exec(select(Tag)).all()
    used = {}  # value -> tag_id
    for t in all_tags:
        if exclude_tag_id is not None and t.id == exclude_tag_id:
            continue
        used[t.name] = t.id
        for a in (t.aliases or []):
            used[a] = t.id

    for c in candidates:
        c_norm = c.strip()
        if c_norm in used:
            raise HTTPException(400, f"标签名/别名 \"{c_norm}\" 已被其他标签使用")


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
        out.append(TagRead.model_validate(tag).model_copy(
            update={"work_count": int(cnt or 0)}
        ))
    return out


@router.post("", response_model=TagRead)
def create_tag(data: TagCreate, session: Session = Depends(get_session)):
    name = data.name.strip()
    aliases = [a.strip() for a in (data.aliases or []) if a.strip()]

    # 重名校验（先做老的）
    if session.exec(select(Tag).where(Tag.name == name)).first():
        raise HTTPException(400, "标签已存在")

    # 别名空间唯一
    _validate_alias_namespace(session, name, aliases)

    # group_id 兜底
    group_id = data.group_id if data.group_id is not None else _get_default_group_id(session)

    # 校验 group 存在
    from ..models import TagGroup
    if not session.get(TagGroup, group_id):
        raise HTTPException(400, "指定的标签组不存在")

    tag = Tag(name=name, color=data.color, group_id=group_id, aliases=aliases)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return TagRead.model_validate(tag)


@router.patch("/{tag_id}", response_model=TagRead)
def update_tag(tag_id: int, data: TagUpdate, session: Session = Depends(get_session)):
    tag = session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(404, "Tag not found")

    update_data = data.model_dump(exclude_unset=True)

    # 如果改了 name 或 aliases，跑别名空间校验
    if "name" in update_data or "aliases" in update_data:
        new_name = (update_data.get("name") or tag.name).strip()
        new_aliases = update_data.get("aliases", tag.aliases) or []
        new_aliases = [a.strip() for a in new_aliases if a.strip()]
        _validate_alias_namespace(session, new_name, new_aliases, exclude_tag_id=tag.id)
        update_data["name"] = new_name
        update_data["aliases"] = new_aliases

    # 如果改了 group_id，校验 group 存在
    if "group_id" in update_data:
        from ..models import TagGroup
        if not session.get(TagGroup, update_data["group_id"]):
            raise HTTPException(400, "指定的标签组不存在")

    for k, v in update_data.items():
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


@router.get("/suggest", response_model=List[TagRead])
def suggest_tags(
    session: Session = Depends(get_session),
    tag_ids: List[int] = Query(..., min_length=1),
    work_type: Optional[WorkType] = None,
    limit: int = Query(7, ge=1, le=20),
):
    """根据当前已选 tag 集合，推荐相关的其他 tag。

    算法：共现频次 + 开方去偏
      score(t) = sum_over_s(co_occur(s, t)) / sqrt(global_count(t))

    fallback：当所有候选都是 0 分（即已选 tag 没有共现作品），
    退回到同 work_type 作品的热门 tag。
    """
    from ..models import WorkTagLink

    # 拿到所有 tag 的 global count（只需查一次）
    all_tag_counts = dict(session.exec(
        select(WorkTagLink.tag_id, func.count(WorkTagLink.work_id))
        .group_by(WorkTagLink.tag_id)
    ).all())

    # 找出所有"含至少一个已选 tag"的 work_id
    target_works = set(session.exec(
        select(WorkTagLink.work_id)
        .where(WorkTagLink.tag_id.in_(tag_ids))
        .distinct()
    ).all())

    if not target_works:
        return _fallback_popular_tags(session, tag_ids, work_type, limit)

    # 在这些 work 上数其他 tag 出现次数
    co_counts: dict[int, int] = {}
    for tag_id_x, work_id in session.exec(
        select(WorkTagLink.tag_id, WorkTagLink.work_id)
        .where(WorkTagLink.work_id.in_(target_works))
        .where(WorkTagLink.tag_id.not_in(tag_ids))
    ).all():
        co_counts[tag_id_x] = co_counts.get(tag_id_x, 0) + 1

    if not co_counts:
        return _fallback_popular_tags(session, tag_ids, work_type, limit)

    # 算 score 并排序
    scored = []
    for tid, co in co_counts.items():
        gc = all_tag_counts.get(tid, 1)
        score = co / (gc ** 0.5)
        scored.append((tid, score))
    scored.sort(key=lambda x: x[1], reverse=True)
    top_ids = [tid for tid, _ in scored[:limit]]

    # 取 Tag 详情，按 top_ids 顺序返回
    tags = session.exec(select(Tag).where(Tag.id.in_(top_ids))).all()
    tag_by_id = {t.id: t for t in tags}
    out = []
    for tid in top_ids:
        t = tag_by_id.get(tid)
        if t is None:
            continue
        out.append(TagRead.model_validate(t).model_copy(
            update={"work_count": all_tag_counts.get(t.id, 0)}
        ))
    return out


def _fallback_popular_tags(
    session: Session,
    excluded_ids: List[int],
    work_type: Optional[WorkType],
    limit: int,
) -> List[TagRead]:
    """fallback：返回同 work_type 下最热门的 tag（排除已选）。
    如果没传 work_type，全局热门。
    """
    from ..models import WorkTagLink, Work

    stmt = (
        select(
            WorkTagLink.tag_id,
            func.count(WorkTagLink.work_id).label("cnt"),
        )
        .group_by(WorkTagLink.tag_id)
        .order_by(func.count(WorkTagLink.work_id).desc())
        .limit(limit)
    )
    if excluded_ids:
        stmt = stmt.where(WorkTagLink.tag_id.not_in(excluded_ids))
    if work_type is not None:
        stmt = stmt.join(Work, Work.id == WorkTagLink.work_id).where(Work.type == work_type)

    rows = session.exec(stmt).all()
    if not rows:
        return []

    tag_id_to_count = {tid: cnt for tid, cnt in rows}
    tags = session.exec(select(Tag).where(Tag.id.in_(list(tag_id_to_count.keys())))).all()
    tag_by_id = {t.id: t for t in tags}

    out = []
    for tid in tag_id_to_count.keys():
        t = tag_by_id.get(tid)
        if t is None:
            continue
        out.append(TagRead.model_validate(t).model_copy(
            update={"work_count": tag_id_to_count[t.id]}
        ))
    return out
