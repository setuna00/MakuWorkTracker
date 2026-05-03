"""元信息：把 enums 和字段映射暴露给前端。"""
from fastapi import APIRouter
from ..models.enums import (
    WorkType, ReleaseStatus, PersonalStatus,
    UNIT_LABELS, CREATOR_FIELDS, TYPES_WITH_RANGE_PROGRESS,
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
            "has_range_progress": t in TYPES_WITH_RANGE_PROGRESS,
            "creator_fields": [
                {"key": k, "label": lbl} for k, lbl in CREATOR_FIELDS[t]
            ],
        })
    return {"types": result}


@router.get("/statuses")
def get_statuses():
    return {
        "release_statuses": [
            {"value": "ongoing", "label": "连载中"},
            {"value": "finished", "label": "完结"},
        ],
        "personal_statuses": [
            {"value": "want", "label": "想看", "color": "#888780"},
            {"value": "watching", "label": "在看", "color": "#0F6E56"},
            {"value": "done", "label": "看完", "color": "#185FA5"},
            {"value": "dropped", "label": "弃坑", "color": "#A32D2D"},
        ],
    }
