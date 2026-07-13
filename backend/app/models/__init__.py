"""核心数据模型：Work / Watching / ProgressEntry / Tag / Collection。"""
from datetime import datetime, date as Date, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column, JSON
from sqlalchemy import UniqueConstraint
from .enums import WorkType, ReleaseStatus, PersonalStatus


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------- 关联表 ----------

class WorkTagLink(SQLModel, table=True):
    work_id: Optional[int] = Field(default=None, foreign_key="work.id", primary_key=True)
    tag_id: Optional[int] = Field(default=None, foreign_key="tag.id", primary_key=True)


class WorkCollectionLink(SQLModel, table=True):
    work_id: Optional[int] = Field(default=None, foreign_key="work.id", primary_key=True)
    collection_id: Optional[int] = Field(default=None, foreign_key="collection.id", primary_key=True)


# ---------- TagGroup ----------

class TagGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    sort_order: int = Field(default=0, index=True)
    is_default: bool = Field(default=False, index=True)  # 默认组标志
    created_at: datetime = Field(default_factory=utcnow)

    tags: List["Tag"] = Relationship(back_populates="group")


# ---------- Tag ----------

class Tag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    color: str = Field(default="#888780")  # 默认中性灰
    group_id: Optional[int] = Field(default=None, foreign_key="taggroup.id", index=True)
    aliases: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)

    works: List["Work"] = Relationship(back_populates="tags", link_model=WorkTagLink)
    group: Optional["TagGroup"] = Relationship(back_populates="tags")


# ---------- Collection ----------

class Collection(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    border_color: str = Field(default="#5DCAA5")
    sort_order: int = Field(default=0, index=True)
    created_at: datetime = Field(default_factory=utcnow)

    works: List["Work"] = Relationship(back_populates="collections", link_model=WorkCollectionLink)


# ---------- Work ----------

class Work(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True)
    original_title: Optional[str] = None
    release_year: Optional[int] = None
    type: WorkType = Field(index=True)
    cover_path: Optional[str] = None       # 相对 data_dir 的路径
    cover_thumb_path: Optional[str] = None
    description: Optional[str] = None
    release_status: ReleaseStatus = Field(default=ReleaseStatus.ongoing)
    total_units: Optional[int] = None       # 总集数/章数
    total_subunits: Optional[int] = None    # 总页数（可选）
    unit_label: Optional[str] = None        # 自定义进度单位（覆盖类型默认）；未设置时走 meta 默认
    creators: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    watchings: List["Watching"] = Relationship(
        back_populates="work",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    tags: List[Tag] = Relationship(back_populates="works", link_model=WorkTagLink)
    collections: List[Collection] = Relationship(back_populates="works", link_model=WorkCollectionLink)


# ---------- Watching（周目） ----------

class Watching(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("work_id", "round_number", name="uq_work_round"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    work_id: int = Field(foreign_key="work.id", index=True)
    round_number: int = Field(default=1)
    label: Optional[str] = None  # null = 自动生成"第N周目"
    personal_status: PersonalStatus = Field(default=PersonalStatus.want)
    rating: Optional[float] = None  # 1.0-10.0, 0.5 步进
    overall_review: Optional[str] = None
    started_at: Optional[Date] = None
    finished_at: Optional[Date] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    work: Optional[Work] = Relationship(back_populates="watchings")
    entries: List["ProgressEntry"] = Relationship(
        back_populates="watching",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------- ProgressEntry（进度日志） ----------

class ProgressEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    watching_id: int = Field(foreign_key="watching.id", index=True)
    date: Date = Field(index=True)            # 用户本地时区的日期
    range_start: Optional[int] = None         # 电影类为 null
    range_end: Optional[int] = None
    consumed_count: int = Field(default=1)    # 冗余：end-start+1，电影=1
    note: Optional[str] = None
    is_backfill: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    watching: Optional[Watching] = Relationship(back_populates="entries")


# ---------- MonthlyReport ----------

class MonthlyReport(SQLModel, table=True):
    """月度报告快照。每月生成一次,JSON 形式存储,后续数据变化不会改变历史报告。

    生成时机:
      - 启用功能时一次性补生所有历史月
      - 之后每月 1 号首次访问时自动生成上一月
      - 用户也可在设置里手动重新生成某月(会覆盖)
    """
    __table_args__ = (UniqueConstraint("year", "month", name="uq_report_year_month"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    year: int = Field(index=True)
    month: int = Field(index=True)              # 1-12
    data: str                                    # JSON 字符串
    generated_at: datetime = Field(default_factory=utcnow)