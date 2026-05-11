"""元信息：把 enums 和字段映射暴露给前端。"""
from fastapi import APIRouter
from ..models.enums import (
    WorkType, ReleaseStatus, PersonalStatus,
    UNIT_LABELS, UNIT_OPTIONS, CREATOR_FIELDS, TYPES_WITH_RANGE_PROGRESS,
)

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/types")
def get_types_meta():
    """每个类型的标签 / 进度单位 / creators 字段定义。"""
    type_configs = {
        "anime": {"label": "动漫", "icon": "tv"},
        "movie": {"label": "电影", "icon": "film"},
        "tv": {"label": "电视剧", "icon": "monitor"},
        "manga": {"label": "漫画", "icon": "book-open"},
        "novel": {"label": "小说", "icon": "book"},
        "other": {"label": "其他", "icon": "more-horizontal"},
    }

    result = []
    for t in WorkType:
        cfg = type_configs[t.value]
        result.append({
            "value": t.value,
            "label": cfg["label"],
            "icon": cfg["icon"],
            "unit_label": UNIT_LABELS[t],
            "unit_options": UNIT_OPTIONS.get(t, []),  # 空数组=该类型不支持自定义单位
            "has_range_progress": t in TYPES_WITH_RANGE_PROGRESS,
            "creator_fields": [
                {"key": k, "label": lbl} for k, lbl in CREATOR_FIELDS[t]
            ],
        })
    return {"types": result}


@router.get("/statuses")
def get_statuses():
    personal_status_meta = {
        PersonalStatus.want: {"label": "想看", "color": "#888780"},
        PersonalStatus.watching: {"label": "在看", "color": "#0F6E56"},
        PersonalStatus.on_hold: {"label": "搁置", "color": "#A16207"},
        PersonalStatus.done: {"label": "看完", "color": "#185FA5"},
        PersonalStatus.dropped: {"label": "弃坑", "color": "#A32D2D"},
    }

    return {
        "release_statuses": [
            {"value": ReleaseStatus.ongoing.value, "label": "连载中"},
            {"value": ReleaseStatus.finished.value, "label": "完结"},
        ],
        "personal_statuses": [
            {"value": status.value, **personal_status_meta[status]}
            for status in PersonalStatus
        ],
    }