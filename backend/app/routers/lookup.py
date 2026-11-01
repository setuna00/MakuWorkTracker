"""外部条目查询：新建作品时从 Bangumi 搜索并自动填写。

请求由后端代发：浏览器直接下载 Bangumi 原图会被跨域拦住，后端没有这个限制，
还能带上 Bangumi 要求的 User-Agent。
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..utils import bangumi

router = APIRouter(prefix="/api/lookup", tags=["lookup"])


def _raise_http(e: bangumi.BangumiError):
    if isinstance(e, bangumi.BangumiNotFound):
        raise HTTPException(404, str(e)) from e
    raise HTTPException(502, str(e)) from e


@router.get("/bangumi/search")
def search_bangumi(q: str = Query(..., min_length=1, max_length=100)):
    keyword = q.strip()
    if not keyword:
        raise HTTPException(422, "请输入搜索关键词")
    try:
        return bangumi.search_subjects(keyword)
    except bangumi.BangumiError as e:
        _raise_http(e)


@router.get("/bangumi/subjects/{subject_id}")
def get_bangumi_subject(subject_id: int):
    try:
        return bangumi.normalize_subject(bangumi.get_subject(subject_id))
    except bangumi.BangumiError as e:
        _raise_http(e)


@router.get("/bangumi/subjects/{subject_id}/cover")
def get_bangumi_cover(subject_id: int):
    try:
        body, content_type = bangumi.download_cover(bangumi.get_subject(subject_id))
    except bangumi.BangumiError as e:
        _raise_http(e)
    return Response(content=body, media_type=content_type,
                    headers={"Cache-Control": "private, max-age=3600"})
