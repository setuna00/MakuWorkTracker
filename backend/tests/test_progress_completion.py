"""记录进度后自动切换"看完"的规则，以及新建作品时的重名检测。

回归重点：
- 电影记录后没有变成看完（电影 range_end 为空，旧逻辑按"进度 ≥ 总数"永远判不成看完）
- 手动选了看完，再改一下记录的备注，状态又被退回在看
"""
import json

from app.models import Work, Watching
from app.models.enums import WorkType, ReleaseStatus, PersonalStatus


def _work(session, *, type=WorkType.anime, release=ReleaseStatus.finished, total=12,
          status=PersonalStatus.watching, title="Test", original_title=None):
    work = Work(title=title, original_title=original_title, type=type,
                release_status=release, total_units=total)
    session.add(work)
    session.flush()
    watching = Watching(work_id=work.id, round_number=1, personal_status=status)
    session.add(watching)
    session.commit()
    return work.id, watching.id


def _record(client, watching_id, day, start=None, end=None, **extra):
    resp = client.post(f"/api/watchings/{watching_id}/entries", json={
        "date": day, "range_start": start, "range_end": end, **extra,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _state(client, work_id):
    work = client.get(f"/api/works/{work_id}").json()
    watching = work["watchings"][0]
    return watching["personal_status"], watching["finished_at"]


def _set_status(client, watching_id, status):
    resp = client.patch(f"/api/watchings/{watching_id}", json={"personal_status": status})
    assert resp.status_code == 200, resp.text


def test_recording_a_movie_marks_it_done(client, session):
    work_id, watching_id = _work(session, type=WorkType.movie, total=1,
                                 status=PersonalStatus.want)
    _record(client, watching_id, "2026-08-20")
    assert _state(client, work_id) == ("done", "2026-08-20")


def test_editing_entry_note_keeps_manually_chosen_status(client, session):
    # 连载作品手动标看完，改备注不应退回在看
    work_id, watching_id = _work(session, release=ReleaseStatus.ongoing, total=12)
    entry_id = _record(client, watching_id, "2026-08-01", 1, 3)
    _set_status(client, watching_id, "done")
    client.patch(f"/api/entries/{entry_id}", json={"note": "补一句感想"})
    assert _state(client, work_id)[0] == "done"

    # 电影看完后用户手动改回在看（准备重看），改备注也不应被推回看完
    movie_id, movie_watching = _work(session, type=WorkType.movie, total=1, title="Movie")
    movie_entry = _record(client, movie_watching, "2026-08-02")
    _set_status(client, movie_watching, "watching")
    client.patch(f"/api/entries/{movie_entry}", json={"note": "改一下"})
    assert _state(client, movie_id)[0] == "watching"


def test_finished_anime_is_done_on_the_date_of_the_final_entry(client, session):
    work_id, watching_id = _work(session, total=12)
    _record(client, watching_id, "2026-08-01", 1, 11)
    assert _state(client, work_id) == ("watching", None)

    last_id = _record(client, watching_id, "2026-08-15", 12, 12)
    assert _state(client, work_id) == ("done", "2026-08-15")

    # 删掉最后一集的记录 → 退回在看
    client.delete(f"/api/entries/{last_id}")
    assert _state(client, work_id) == ("watching", None)


def test_mark_finished_turns_ongoing_work_finished_and_done(client, session):
    work_id, watching_id = _work(session, release=ReleaseStatus.ongoing, total=10)
    _record(client, watching_id, "2026-08-01", 1, 10)
    assert _state(client, work_id)[0] == "watching"

    _record(client, watching_id, "2026-08-08", 11, 11, mark_finished=True)
    work = client.get(f"/api/works/{work_id}").json()
    assert work["release_status"] == "finished"
    assert work["total_units"] == 11
    assert _state(client, work_id) == ("done", "2026-08-08")


def test_work_edits_only_switch_status_when_completion_flips(client, session):
    work_id, watching_id = _work(session, release=ReleaseStatus.ongoing, total=12)
    _record(client, watching_id, "2026-08-01", 1, 12)

    # 只改标题：状态不动
    _set_status(client, watching_id, "done")
    client.patch(f"/api/works/{work_id}", data={"payload": json.dumps({"title": "新标题"})})
    assert _state(client, work_id)[0] == "done"

    # 改成完结且进度已到总数：从在看推到看完
    _set_status(client, watching_id, "watching")
    client.patch(f"/api/works/{work_id}", data={"payload": json.dumps({"release_status": "finished"})})
    assert _state(client, work_id) == ("done", "2026-08-01")


def test_duplicate_check_normalizes_titles_and_includes_hidden_dropped(client, session):
    _work(session, title="ヘルモード ～やり込み好きのゲーマー～", type=WorkType.anime)
    _work(session, title="葬送的芙莉莲", original_title="葬送のフリーレン",
          type=WorkType.manga, status=PersonalStatus.dropped)
    client.patch("/api/preferences", json={"show_dropped": False})

    def dup_titles(**params):
        resp = client.get("/api/works/duplicates", params=params)
        assert resp.status_code == 200, resp.text
        return [item["title"] for item in resp.json()]

    assert dup_titles(title="ヘルモード~やり込み好きのゲーマー~") == ["ヘルモード ～やり込み好きのゲーマー～"]
    assert dup_titles(title="Frieren", original_title="葬送のフリーレン") == ["葬送的芙莉莲"]
    assert dup_titles(title="完全不同的作品") == []
    assert dup_titles(title="  ") == []
