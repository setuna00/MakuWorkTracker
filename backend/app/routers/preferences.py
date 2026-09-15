"""应用偏好设置。

存在数据库(AppSetting 键值表)而不是浏览器 localStorage:
NAS 上只有一份数据,手机和电脑看到的作品列表应该一致。
"""
import json
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select, func

from ..db import get_session
from ..models import AppSetting, Watching
from ..models.enums import PersonalStatus

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

# 偏好项及默认值。新增偏好:这里加默认值,PreferencesUpdate 加字段
DEFAULTS = {
    # 弃坑作品是否常态显示。关闭后作品库/搜索/快速记录都不出现,只有按"弃坑"筛选时才显示
    "show_dropped": True,
}


class PreferencesUpdate(BaseModel):
    show_dropped: Optional[bool] = None


def get_preference(session: Session, key: str):
    row = session.get(AppSetting, key)
    return json.loads(row.value) if row else DEFAULTS[key]


def dropped_work_ids():
    """当前周目(round_number 最大)为弃坑的作品 id 子查询,与作品库状态筛选的口径一致。"""
    latest_rounds = (
        select(
            Watching.work_id.label("work_id"),
            func.max(Watching.round_number).label("round_number"),
        )
        .group_by(Watching.work_id)
        .subquery()
    )
    return (
        select(Watching.work_id)
        .join(
            latest_rounds,
            (Watching.work_id == latest_rounds.c.work_id)
            & (Watching.round_number == latest_rounds.c.round_number),
        )
        .where(Watching.personal_status == PersonalStatus.dropped)
    )


@router.get("")
def read_preferences(session: Session = Depends(get_session)):
    return {key: get_preference(session, key) for key in DEFAULTS}


@router.patch("")
def update_preferences(data: PreferencesUpdate, session: Session = Depends(get_session)):
    for key, value in data.model_dump(exclude_none=True).items():
        row = session.get(AppSetting, key) or AppSetting(key=key, value="null")
        row.value = json.dumps(value)
        session.add(row)
    session.commit()
    return read_preferences(session)
