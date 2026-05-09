"""枚举类型定义。"""
from enum import Enum


class WorkType(str, Enum):
    anime = "anime"
    movie = "movie"
    tv = "tv"
    manga = "manga"
    novel = "novel"
    other = "other"


class ReleaseStatus(str, Enum):
    ongoing = "ongoing"   # 连载中
    finished = "finished"  # 完结


class PersonalStatus(str, Enum):
    want = "want"        # 想看
    watching = "watching"  # 在看
    done = "done"        # 看完
    dropped = "dropped"  # 弃坑


# 类型 -> 单位显示名（中文）
UNIT_LABELS = {
    WorkType.anime: "集",
    WorkType.tv: "集",
    WorkType.manga: "章",
    WorkType.novel: "章",
    WorkType.movie: "部",
    WorkType.other: "单元",
}


# 类型 -> 用户可选的单位列表（None 表示不允许自定义，固定走 UNIT_LABELS）
UNIT_OPTIONS = {
    WorkType.manga: ["页", "话", "章", "本"],
    WorkType.novel: ["页", "话", "章", "本"],
}


# 类型 -> creators 字段定义（key + 中文标签）
CREATOR_FIELDS = {
    WorkType.anime: [("author", "作者"), ("studio", "制作")],
    WorkType.tv: [("director", "导演")],
    WorkType.movie: [("director", "导演")],
    WorkType.manga: [("author", "作者")],
    WorkType.novel: [("author", "作者")],
    WorkType.other: [],
}


# 哪些类型走"区间进度"模型
TYPES_WITH_RANGE_PROGRESS = {
    WorkType.anime, WorkType.tv, WorkType.manga, WorkType.novel
}

# 哪些类型不记区间（电影：只标"看过"）
TYPES_WITHOUT_RANGE_PROGRESS = {WorkType.movie}
