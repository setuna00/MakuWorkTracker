"""Bangumi 查询接口：条目整理规则和错误处理。所有外网请求都被替换成假数据。"""
import pytest

from app.utils import bangumi

FRIEREN = {
    "id": 400602,
    "type": 2,
    "name": "葬送のフリーレン",
    "name_cn": "葬送的芙莉莲",
    "date": "2023-09-29",
    "platform": "TV",
    "eps": 28,
    "volumes": 0,
    "summary": "勇者一行击败魔王之后……",
    "images": {
        "large": "https://lain.bgm.tv/pic/cover/l/13/c5/400602_ZI8Y9.jpg",
        "common": "https://lain.bgm.tv/r/400/pic/cover/l/13/c5/400602_ZI8Y9.jpg",
    },
    "infobox": [
        {"key": "中文名", "value": "葬送的芙莉莲"},
        {"key": "原作", "value": "山田鐘人（小学館「週刊少年サンデー」連載中）"},
        {"key": "原作", "value": [{"v": "アベツカサ"}]},
        {"key": "动画制作", "value": "マッドハウス"},
        {"key": "製作", "value": "「葬送のフリーレン」製作委員会"},
        {"key": "放送开始", "value": "2023年9月29日"},
        {"key": "播放结束", "value": "2024年3月22日"},
    ],
}

MANGA = {
    "id": 1,
    "type": 1,
    "name": "ワンピース",
    "name_cn": "",
    "platform": "漫画",
    "eps": 0,
    "volumes": 110,
    "infobox": [{"key": "作者", "value": "尾田栄一郎"}, {"key": "发售日", "value": "1997-12-24"}],
    "images": {},
}

DUNE = {
    "id": 351322,
    "type": 6,
    "name": "Dune",
    "name_cn": "沙丘",
    "date": "2021-10-22",
    "platform": "电影",
    "eps": 1,
    "infobox": [{"key": "导演", "value": "丹尼斯·维伦纽瓦"}],
    "images": {"large": "http://lain.bgm.tv/pic/cover/l/dune.jpg"},
}


def test_normalize_anime_fills_creators_status_and_units():
    draft = bangumi.normalize_subject(FRIEREN)
    assert draft == {
        "bangumi_id": 400602,
        "type": "anime",
        "title": "葬送的芙莉莲",
        "original_title": "葬送のフリーレン",
        "release_year": 2023,
        "description": "勇者一行击败魔王之后……",
        "release_status": "finished",
        "total_units": 28,
        "unit_label": None,
        "creators": {"author": "山田鐘人、アベツカサ", "studio": "マッドハウス"},
        "has_cover": True,
    }


def test_normalize_manga_uses_volumes_and_falls_back_to_original_name():
    draft = bangumi.normalize_subject(MANGA)
    assert draft["type"] == "manga"
    assert draft["title"] == "ワンピース"
    assert draft["original_title"] is None
    assert draft["release_year"] == 1997
    assert draft["release_status"] == "ongoing"
    assert (draft["total_units"], draft["unit_label"]) == (110, "本")
    assert draft["creators"] == {"author": "尾田栄一郎"}
    assert draft["has_cover"] is False


def test_normalize_manga_without_volumes_uses_chapters_and_plain_end_date():
    subject = {
        "id": 8491, "type": 1, "name": "進撃の巨人", "name_cn": "进击的巨人", "platform": "漫画",
        "eps": 139, "volumes": 0,
        "infobox": [
            {"key": "原作", "value": "諫山創"},
            {"key": "作画", "value": "諫山創"},
            {"key": "开始", "value": "2009-09-09 (2009年10月号)"},
            {"key": "结束", "value": "2021-04-09 (2021年5月号)"},
        ],
    }
    draft = bangumi.normalize_subject(subject)
    assert draft["release_status"] == "finished"
    assert (draft["total_units"], draft["unit_label"]) == (139, "话")
    assert draft["creators"] == {"author": "諫山創"}
    assert draft["release_year"] == 2009


def test_normalize_real_movie_is_finished_with_director():
    draft = bangumi.normalize_subject(DUNE)
    assert draft["type"] == "movie"
    assert draft["release_status"] == "finished"
    assert draft["total_units"] is None
    assert draft["creators"] == {"director": "丹尼斯·维伦纽瓦"}


@pytest.mark.parametrize("subject, expected", [
    ({"type": 2, "platform": "剧场版"}, "movie"),
    ({"type": 2, "platform": "WEB"}, "anime"),
    ({"type": 6, "platform": "日剧"}, "tv"),
    ({"type": 1, "platform": "小说"}, "novel"),
    # 平台缺失时才看 infobox
    ({"type": 1, "platform": "", "infobox": [{"key": "文库", "value": "电击文库"}]}, "novel"),
    ({"type": 1, "platform": "画集"}, "other"),
    ({"type": 4, "platform": "PC"}, "other"),
])
def test_classify_type(subject, expected):
    assert bangumi.classify_type(subject, bangumi._build_infobox(subject.get("infobox"))) == expected


def test_search_endpoint_returns_summaries(client, monkeypatch):
    calls = []

    def fake_json(url, payload=None):
        calls.append((url, payload))
        return {"total": 2, "data": [FRIEREN, DUNE]}

    monkeypatch.setattr(bangumi, "_request_json", fake_json)
    res = client.get("/api/lookup/bangumi/search", params={"q": "  芙莉莲 "})
    assert res.status_code == 200, res.text
    assert calls[0][1]["keyword"] == "芙莉莲"
    assert calls[0][1]["sort"] == "heat"
    assert 3 not in calls[0][1]["filter"]["type"]
    first, second = res.json()
    assert first == {
        "id": 400602,
        "type": "anime",
        "title": "葬送的芙莉莲",
        "original_title": "葬送のフリーレン",
        "release_year": 2023,
        "platform": "TV",
        "total_units": 28,
        "thumb_url": "https://lain.bgm.tv/r/400/pic/cover/l/13/c5/400602_ZI8Y9.jpg",
    }
    assert second["type"] == "movie"


def test_search_rejects_blank_keyword(client):
    assert client.get("/api/lookup/bangumi/search", params={"q": "   "}).status_code == 422


def test_subject_endpoint_maps_errors(client, monkeypatch):
    def not_found(url, payload=None):
        raise bangumi.BangumiNotFound("Bangumi 上找不到这个条目")

    monkeypatch.setattr(bangumi, "_request_json", not_found)
    assert client.get("/api/lookup/bangumi/subjects/9").status_code == 404

    def offline(url, payload=None):
        raise bangumi.BangumiError("无法连接 Bangumi")

    monkeypatch.setattr(bangumi, "_request_json", offline)
    res = client.get("/api/lookup/bangumi/subjects/9")
    assert res.status_code == 502
    assert res.json()["detail"] == "无法连接 Bangumi"


def test_cover_endpoint_downloads_large_image(client, monkeypatch):
    monkeypatch.setattr(bangumi, "_request_json", lambda url, payload=None: FRIEREN)
    fetched = []

    def fake_bytes(url):
        fetched.append(url)
        return b"\xff\xd8fake-jpeg", "image/jpeg"

    monkeypatch.setattr(bangumi, "_request_bytes", fake_bytes)
    res = client.get("/api/lookup/bangumi/subjects/400602/cover")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    assert res.content == b"\xff\xd8fake-jpeg"
    assert fetched == [FRIEREN["images"]["large"]]


def test_cover_endpoint_404_when_subject_has_no_cover(client, monkeypatch):
    monkeypatch.setattr(bangumi, "_request_json", lambda url, payload=None: MANGA)
    assert client.get("/api/lookup/bangumi/subjects/1/cover").status_code == 404


def test_only_allowlisted_hosts_are_reachable():
    assert bangumi._check_url("http://lain.bgm.tv/pic/a.jpg") == "https://lain.bgm.tv/pic/a.jpg"
    for url in ["https://example.com/a.jpg", "https://lain.bgm.tv.evil.com/a.jpg",
                "file:///etc/passwd", "http://192.168.20.3:8765/api/works"]:
        with pytest.raises(bangumi.BangumiError):
            bangumi._check_url(url)


def test_redirect_to_other_host_is_refused():
    handler = bangumi._AllowlistRedirectHandler()
    with pytest.raises(bangumi.BangumiError):
        handler.redirect_request(None, None, 302, "Found", {}, "http://127.0.0.1:8000/api/admin")
