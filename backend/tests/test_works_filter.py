"""作品库筛选/排序的组合冒烟测试。

回归重点：personal_status 筛选 + rating 排序曾因对 Watching 表做两次未取别名的
JOIN 而触发 SQLite "ambiguous column name" 报错（接口 500）。这里对
5 个状态 × 5 个排序 + tag/type 叠加做笛卡尔积，断言永不 500，并校验关键语义。
"""
import itertools
from datetime import date

import pytest

from app.models import Work, Watching, Tag, WorkTagLink, ProgressEntry
from app.models.enums import WorkType, PersonalStatus, ReleaseStatus

STATUSES = ["", "want", "watching", "on_hold", "done", "dropped"]
SORTS = ["updated_at", "created_at", "title", "rating", "last_progress"]
ORDERS = ["asc", "desc"]


@pytest.fixture()
def seeded(session):
    """造一批覆盖各状态/评分有无的数据。返回 tag_id 方便叠加测试。"""
    tag = Tag(name="剧情")
    session.add(tag)
    session.flush()

    # (title, type, status, rating, has_tag)
    rows = [
        ("Alpha", WorkType.anime, PersonalStatus.done, 9.0, True),
        ("Beta", WorkType.anime, PersonalStatus.done, None, True),   # done 但未评分
        ("Gamma", WorkType.manga, PersonalStatus.watching, 7.5, False),
        ("Delta", WorkType.tv, PersonalStatus.want, None, True),
        ("Epsilon", WorkType.movie, PersonalStatus.dropped, 3.0, False),
        ("Zeta", WorkType.novel, PersonalStatus.on_hold, 6.0, True),
    ]
    for title, ty, status, rating, has_tag in rows:
        w = Work(title=title, type=ty, release_status=ReleaseStatus.ongoing)
        session.add(w)
        session.flush()
        watching = Watching(work_id=w.id, round_number=1,
                            personal_status=status, rating=rating)
        session.add(watching)
        session.flush()
        # 给每个加一条进度，喂饱 last_progress 排序
        session.add(ProgressEntry(watching_id=watching.id, date=date(2024, 1, 1),
                                  range_start=1, range_end=1, consumed_count=1))
        if has_tag:
            session.add(WorkTagLink(work_id=w.id, tag_id=tag.id))
    session.commit()
    return {"tag_id": tag.id}


def test_all_status_sort_combinations_never_500(client, seeded):
    """5 状态 × 5 排序 × 升降序 × {无 tag, 有 tag}，全部应 200。"""
    tag_id = seeded["tag_id"]
    for status, sort, order, with_tag in itertools.product(
        STATUSES, SORTS, ORDERS, [False, True]
    ):
        params = {"sort": sort, "order": order, "page": 1, "page_size": 60}
        if status:
            params["personal_status"] = status
        if with_tag:
            params["tag_id"] = tag_id
        resp = client.get("/api/works", params=params)
        assert resp.status_code == 200, (
            f"combo failed: status={status} sort={sort} order={order} "
            f"tag={with_tag} -> {resp.status_code} {resp.text[:200]}"
        )
        body = resp.json()
        assert "items" in body and "total" in body


def test_done_plus_tag_plus_rating_returns_expected(client, seeded):
    """复现报告中的崩溃组合：看完 + tag + 评分排序。现在应正确返回。"""
    tag_id = seeded["tag_id"]
    resp = client.get("/api/works", params={
        "personal_status": "done", "tag_id": tag_id,
        "sort": "rating", "order": "desc", "page": 1, "page_size": 60,
    })
    assert resp.status_code == 200
    titles = [it["title"] for it in resp.json()["items"]]
    # Alpha(9.0, done, tag) 和 Beta(None, done, tag) 满足；评分高的在前，未评分沉底
    assert titles == ["Alpha", "Beta"]


def test_rating_sort_puts_unrated_last(client, seeded):
    """评分排序无论升降序，未评分作品都应沉底（nullslast）。"""
    for order in ("asc", "desc"):
        resp = client.get("/api/works", params={
            "personal_status": "done", "sort": "rating", "order": order,
            "page": 1, "page_size": 60,
        })
        assert resp.status_code == 200
        items = resp.json()["items"]
        ratings = [it["main_watching"]["rating"] for it in items]
        # 未评分(None)必须排在所有有评分之后
        seen_none = False
        for r in ratings:
            if r is None:
                seen_none = True
            else:
                assert not seen_none, f"unrated work appeared before rated in order={order}"


def test_personal_status_filter_correctness(client, seeded):
    """单独的状态筛选：done 应只返回 Alpha/Beta。"""
    resp = client.get("/api/works", params={
        "personal_status": "done", "page": 1, "page_size": 60,
    })
    assert resp.status_code == 200
    titles = sorted(it["title"] for it in resp.json()["items"])
    assert titles == ["Alpha", "Beta"]
