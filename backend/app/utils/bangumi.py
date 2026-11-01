"""Bangumi 条目查询：搜索、取详情、下载封面，并把条目整理成 Maku 新建作品表单的字段。

只用标准库发请求，不引入 HTTP 客户端依赖。所有外网请求都只发往白名单域名，
跳转到白名单以外的地址会直接拒绝，避免被当成任意 URL 代理。
"""
import json
import re
import urllib.error
import urllib.request
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

from ..config import settings

API_BASE = "https://api.bgm.tv"
ALLOWED_HOSTS = {"api.bgm.tv", "lain.bgm.tv"}
TIMEOUT_SECONDS = 15
MAX_IMAGE_BYTES = 15 * 1024 * 1024

# Bangumi 要求请求带能识别应用的 User-Agent
USER_AGENT = (
    f"setuna00/MakuWorkTracker/{settings.app_version} "
    "(https://github.com/setuna00/MakuWorkTracker)"
)

# Bangumi 条目类型：1 书籍 2 动画 3 音乐 4 游戏 6 三次元
SUBJECT_TYPE_BOOK = 1
SUBJECT_TYPE_ANIME = 2
SUBJECT_TYPE_REAL = 6
SEARCH_SUBJECT_TYPES = [1, 2, 4, 6]


class BangumiError(Exception):
    """连接失败、超时或返回了无法使用的数据。"""


class BangumiNotFound(BangumiError):
    """条目不存在（NSFW 条目未登录时 Bangumi 也返回 404）。"""


# ---------- HTTP ----------

class _AllowlistRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_AllowlistRedirectHandler)


def _check_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or parts.hostname not in ALLOWED_HOSTS:
        raise BangumiError(f"不允许访问的地址：{url}")
    # 封面地址偶尔是 http，统一升级
    return urlunsplit(("https", *parts[1:]))


def _open(url: str, *, data: Optional[bytes] = None, accept: str = "application/json"):
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(_check_url(url), data=data, headers=headers)
    try:
        return _opener.open(req, timeout=TIMEOUT_SECONDS)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise BangumiNotFound("Bangumi 上找不到这个条目") from e
        raise BangumiError(f"Bangumi 返回 {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise BangumiError("无法连接 Bangumi") from e


def _request_json(url: str, payload: Optional[dict] = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    with _open(url, data=data) as resp:
        try:
            return json.loads(resp.read().decode("utf-8"))
        except ValueError as e:
            raise BangumiError("Bangumi 返回了无法解析的数据") from e


def _request_bytes(url: str) -> tuple[bytes, str]:
    with _open(url, accept="image/*") as resp:
        body = resp.read(MAX_IMAGE_BYTES + 1)
        content_type = resp.headers.get_content_type()
    if len(body) > MAX_IMAGE_BYTES:
        raise BangumiError("封面图片过大")
    if not body or not content_type.startswith("image/"):
        raise BangumiError("下载到的封面不是图片")
    return body, content_type


# ---------- 对外接口 ----------

def search_subjects(keyword: str, limit: int = 10) -> list[dict]:
    """按关键词搜索，返回给搜索结果列表用的精简条目。

    默认的 match 排序实际是按条目 ID 排，热门条目常被挤出第一页；heat（收藏人数）准得多。
    音乐条目（OST、角色歌）在 Maku 里没有对应类型，直接排除。
    """
    data = _request_json(
        f"{API_BASE}/v0/search/subjects?limit={limit}",
        {
            "keyword": keyword,
            "sort": "heat",
            "filter": {"type": SEARCH_SUBJECT_TYPES, "nsfw": False},
        },
    )
    return [summarize_subject(s) for s in data.get("data") or []]


def get_subject(subject_id: int) -> dict:
    return _request_json(f"{API_BASE}/v0/subjects/{subject_id}")


def download_cover(subject: dict) -> tuple[bytes, str]:
    url = pick_cover_url(subject)
    if not url:
        raise BangumiNotFound("这个条目没有封面")
    return _request_bytes(url)


# ---------- 整理条目 ----------

def summarize_subject(subject: dict) -> dict:
    infobox = _build_infobox(subject.get("infobox"))
    maku_type = classify_type(subject, infobox)
    title, original_title = _titles(subject)
    images = subject.get("images") or {}
    return {
        "id": subject.get("id"),
        "type": maku_type,
        "title": title,
        "original_title": original_title,
        "release_year": _year(subject.get("date")) or _year_from_infobox(infobox),
        "platform": _clean(subject.get("platform")) or None,
        "total_units": _total_units(subject, maku_type)[0],
        "thumb_url": images.get("common") or images.get("medium") or images.get("small") or None,
    }


def normalize_subject(subject: dict) -> dict:
    """把 Bangumi 条目转成新建作品第 2 步的字段。不明确的字段留空，交给用户确认。"""
    infobox = _build_infobox(subject.get("infobox"))
    maku_type = classify_type(subject, infobox)
    title, original_title = _titles(subject)
    total_units, unit_label = _total_units(subject, maku_type)
    finished = maku_type == "movie" or _has_finished_date(infobox)

    return {
        "bangumi_id": subject.get("id"),
        "type": maku_type,
        "title": title,
        "original_title": original_title,
        "release_year": _year(subject.get("date")) or _year_from_infobox(infobox),
        "description": _clean(subject.get("summary")) or None,
        "release_status": "finished" if finished else "ongoing",
        "total_units": total_units,
        "unit_label": unit_label,
        "creators": _creators(infobox, maku_type),
        "has_cover": bool(pick_cover_url(subject)),
    }


def pick_cover_url(subject: dict) -> Optional[str]:
    images = subject.get("images") or {}
    return images.get("large") or images.get("medium") or images.get("common") or None


def classify_type(subject: dict, infobox: dict[str, list[str]]) -> str:
    platform = _clean(subject.get("platform")).lower()
    subject_type = subject.get("type")

    if subject_type == SUBJECT_TYPE_BOOK:
        # 平台字段最准；缺失时才去 infobox 里找线索
        for text in (platform, _infobox_text(infobox)):
            if re.search(r"漫画|漫畫|manga|comic|コミック", text):
                return "manga"
            if re.search(r"小说|小說|novel|文库|文庫|ラノベ", text):
                return "novel"
        return "other"
    if subject_type == SUBJECT_TYPE_ANIME:
        return "movie" if re.search(r"剧场版|劇場版|映画|movie", platform) else "anime"
    if subject_type == SUBJECT_TYPE_REAL:
        return "movie" if re.search(r"电影|電影|映画|movie", platform) else "tv"
    return "other"


# 每个字段按顺序尝试几组 infobox 键，用第一组有值的。
# 不用"制作/製作"：那通常是整个制作委员会名单，不是动画公司
_CREATOR_KEYS = {
    "anime": {
        "author": [["原作"], ["作者"]],
        "studio": [["动画制作", "動畫製作", "アニメーション制作"]],
    },
    "manga": {"author": [["作者"], ["原作", "作画", "作畫"]]},
    "novel": {"author": [["作者"], ["原作"]]},
    "movie": {"director": [["导演", "導演", "監督"]]},
    "tv": {"director": [["导演", "導演", "監督"]]},
}

_END_DATE_KEYS = [
    "播放结束", "播放結束", "放送结束", "放送終了", "上映结束", "上映結束",
    "连载结束", "連載終了", "发行结束", "發行結束", "结束", "結束", "完结", "完結",
]

_START_DATE_KEYS = ["放送开始", "放送開始", "上映日", "上映年度", "开始", "開始", "发售日", "發售日"]


def _creators(infobox: dict[str, list[str]], maku_type: str) -> dict:
    result = {}
    for field, key_groups in _CREATOR_KEYS.get(maku_type, {}).items():
        for keys in key_groups:
            value = _collect(infobox, keys)
            if value:
                result[field] = value
                break
    return result


def _titles(subject: dict) -> tuple[str, Optional[str]]:
    name = _clean(subject.get("name"))
    title = _clean(subject.get("name_cn")) or name or f"Bangumi #{subject.get('id')}"
    return title, (name if name and name != title else None)


def _total_units(subject: dict, maku_type: str) -> tuple[Optional[int], Optional[str]]:
    if maku_type in ("anime", "tv"):
        return _positive_int(subject.get("eps")), None
    if maku_type in ("manga", "novel"):
        volumes = _positive_int(subject.get("volumes"))
        if volumes:
            return volumes, "本"
        # 没有卷数时用话数；小说的"话"其实是章，沿用默认单位
        chapters = _positive_int(subject.get("eps"))
        if chapters:
            return chapters, ("话" if maku_type == "manga" else None)
    return None, None


def _has_finished_date(infobox: dict[str, list[str]]) -> bool:
    return any(infobox.get(key) for key in _END_DATE_KEYS)


def _build_infobox(items) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        key = _clean(item.get("key"))
        values = _flatten_infobox_value(item.get("value"))
        if key and values:
            result.setdefault(key, []).extend(values)
    return result


def _flatten_infobox_value(value) -> list[str]:
    items = value if isinstance(value, list) else [value]
    out = []
    for item in items:
        if isinstance(item, dict):
            candidates = [item.get("v"), item.get("value"), item.get("name")]
        else:
            candidates = [item]
        out.extend(c for c in (_clean(x) for x in candidates) if c)
    return out


def _collect(infobox: dict[str, list[str]], keys: list[str]) -> str:
    wanted = {k.lower() for k in keys}
    values: list[str] = []
    for key, key_values in infobox.items():
        if key.lower() not in wanted:
            continue
        for value in key_values:
            # 去掉"（集英社「週刊少年ジャンプ」連載）"这类括号备注
            name = re.sub(r"\s*[（(][^（）()]*[）)]", "", value).strip()
            if name and name not in values:
                values.append(name)
    return "、".join(values)


def _infobox_text(infobox: dict[str, list[str]]) -> str:
    return " ".join(part for key, values in infobox.items() for part in (key, *values)).lower()


def _year(value) -> Optional[int]:
    match = re.search(r"(?:^|\D)((?:18|19|20|21)\d{2})(?:\D|$)", str(value or ""))
    return int(match.group(1)) if match else None


def _year_from_infobox(infobox: dict[str, list[str]]) -> Optional[int]:
    for key in _START_DATE_KEYS:
        for value in infobox.get(key, []):
            year = _year(value)
            if year:
                return year
    return None


def _positive_int(value) -> Optional[int]:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _clean(value) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n")
    return re.sub(r"[ \t]+", " ", text).strip()
