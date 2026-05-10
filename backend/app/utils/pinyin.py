"""拼音匹配工具：搜索/filter 共用。"""
import re
from pypinyin import lazy_pinyin, Style


_ASCII_RE = re.compile(r"^[a-zA-Z0-9 ]+$")


def _to_pinyin_forms(text: str) -> tuple:
    """返回 (full_pinyin, first_letters)，例如:
       '冒险' → ('maoxian', 'mx')
       'Edge 测试' → ('edge ceshi', 'edge cs')
    都已 lowercase；非中文字符原样保留。
    """
    if not text:
        return "", ""
    full = "".join(lazy_pinyin(text)).lower()
    initials = "".join(lazy_pinyin(text, style=Style.FIRST_LETTER)).lower()
    return full, initials


def _is_ascii_query(s: str) -> bool:
    """判断查询词是否纯 ASCII（只对纯字母数字查询启用拼音匹配，避免汉字搜索时多余开销）。"""
    return bool(s) and bool(_ASCII_RE.match(s))


def _pinyin_match(haystack: str, needle: str) -> bool:
    """needle 是已 lowercase 的 ASCII 字串；haystack 是原文（含中文）。
    检查 needle 是否出现在 haystack 的全拼或首字母形式中。"""
    full, initials = _to_pinyin_forms(haystack)
    return needle in full or needle in initials
