"""版本号来自配置（发布镜像时由 git tag 注入），以及导入 JSON 时的旧格式判定。"""
from app.config import settings
from app.routers.admin import _is_legacy_payload


def test_info_reports_configured_version(client, monkeypatch):
    monkeypatch.setattr(settings, "app_version", "9.8.7")
    assert client.get("/api/admin/info").json()["version"] == "9.8.7"


def test_legacy_payload_detection():
    assert _is_legacy_payload({"tag_groups": []}) is True  # 缺 version
    assert _is_legacy_payload({"version": "1.5.0"}) is True  # 缺 tag_groups
    assert _is_legacy_payload({"version": "1.2.9", "tag_groups": []}) is True
    assert _is_legacy_payload({"version": "1.5.0", "tag_groups": []}) is False
    # 按数字比较：1.10.0 不能因为字典序 "1.10.0" < "1.3.0" 被当成旧版本
    assert _is_legacy_payload({"version": "1.10.0", "tag_groups": []}) is False
    # 本地开发环境导出的版本号是 dev
    assert _is_legacy_payload({"version": "dev", "tag_groups": []}) is False
