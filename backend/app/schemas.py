"""API 请求/响应模型。"""
from datetime import datetime, date
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, ConfigDict
from .models.enums import WorkType, ReleaseStatus, PersonalStatus


# ---------- Tag ----------

class TagCreate(BaseModel):
    name: str
    color: str = "#888780"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str
    created_at: datetime


# ---------- Collection ----------

class CollectionCreate(BaseModel):
    name: str
    border_color: str = "#5DCAA5"
    sort_order: int = 0


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    border_color: Optional[str] = None
    sort_order: Optional[int] = None


class CollectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    border_color: str
    sort_order: int
    created_at: datetime


# ---------- Watching ----------

class WatchingCreate(BaseModel):
    label: Optional[str] = None
    personal_status: PersonalStatus = PersonalStatus.want


class WatchingUpdate(BaseModel):
    label: Optional[str] = None
    personal_status: Optional[PersonalStatus] = None
    rating: Optional[float] = Field(None, ge=1.0, le=10.0)
    overall_review: Optional[str] = None
    started_at: Optional[date] = None
    finished_at: Optional[date] = None


class WatchingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    work_id: int
    round_number: int
    label: Optional[str]
    personal_status: PersonalStatus
    rating: Optional[float]
    overall_review: Optional[str]
    started_at: Optional[date]
    finished_at: Optional[date]
    created_at: datetime
    updated_at: datetime
    # 衍生字段（路由计算）
    current_progress: Optional[int] = None  # 当前最大 range_end
    entries_count: int = 0


# ---------- ProgressEntry ----------

class ProgressEntryCreate(BaseModel):
    """新增进度记录。
    电影类型：range_start/range_end 都传 null，仅有 date 和 note。
    其他类型：必须传 range_start 和 range_end。
    """
    date: date  # 由前端按本地时区计算并传入
    range_start: Optional[int] = None
    range_end: Optional[int] = None
    note: Optional[str] = None


class ProgressEntryUpdate(BaseModel):
    date: Optional[date] = None
    range_start: Optional[int] = None
    range_end: Optional[int] = None
    note: Optional[str] = None


class ProgressEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    watching_id: int
    date: date
    range_start: Optional[int]
    range_end: Optional[int]
    consumed_count: int
    note: Optional[str]
    created_at: datetime
    updated_at: datetime


# ---------- Work ----------

class WorkCreate(BaseModel):
    title: str
    original_title: Optional[str] = None
    type: WorkType
    description: Optional[str] = None
    release_status: ReleaseStatus = ReleaseStatus.ongoing
    total_units: Optional[int] = None
    total_subunits: Optional[int] = None
    creators: Dict[str, str] = Field(default_factory=dict)
    tag_ids: List[int] = Field(default_factory=list)
    collection_ids: List[int] = Field(default_factory=list)
    # 初始周目
    initial_status: PersonalStatus = PersonalStatus.want


class WorkUpdate(BaseModel):
    title: Optional[str] = None
    original_title: Optional[str] = None
    description: Optional[str] = None
    release_status: Optional[ReleaseStatus] = None
    total_units: Optional[int] = None
    total_subunits: Optional[int] = None
    creators: Optional[Dict[str, str]] = None
    tag_ids: Optional[List[int]] = None
    collection_ids: Optional[List[int]] = None


class WorkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    original_title: Optional[str]
    type: WorkType
    cover_path: Optional[str]
    cover_thumb_path: Optional[str]
    description: Optional[str]
    release_status: ReleaseStatus
    total_units: Optional[int]
    total_subunits: Optional[int]
    creators: Dict
    created_at: datetime
    updated_at: datetime
    tags: List[TagRead] = []
    collections: List[CollectionRead] = []


class WorkDetailRead(WorkRead):
    """详情接口：含所有周目信息。"""
    watchings: List[WatchingRead] = []


# ---------- Timeline ----------

class TimelineDayItem(BaseModel):
    """时间轴上一天里的单条事件（合并显示后的）。"""
    work_id: int
    work_title: str
    work_type: WorkType
    work_cover_thumb: Optional[str]
    watching_id: int
    round_number: int
    round_label: Optional[str]
    show_round: bool  # 该作品是否 ≥2 周目
    range_start: Optional[int]  # 合并后的最小 start
    range_end: Optional[int]    # 合并后的最大 end
    notes: List[str]            # 当日的所有非空 note，按 entry 时间序
    entry_ids: List[int]        # 合并的 entry id 列表（用于编辑）


class TimelineDay(BaseModel):
    date: date
    items: List[TimelineDayItem]


class TimelineResponse(BaseModel):
    days: List[TimelineDay]


# ---------- Stats ----------

class MonthlyOverview(BaseModel):
    year: int
    month: int
    entries_count: int      # 本月记录条数
    active_works: int       # 本月有进度记录的作品数
    new_works: int          # 本月首次出现进度的作品数
