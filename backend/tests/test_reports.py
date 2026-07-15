from datetime import date

from app.models import Work, Watching, ProgressEntry
from app.models.enums import WorkType, ReleaseStatus, PersonalStatus
from app.routers.reports import generate_monthly_report


def _entry(
    watching_id,
    day,
    start,
    end,
    *,
    backfill=False,
):
    return ProgressEntry(
        watching_id=watching_id,
        date=day,
        range_start=start,
        range_end=end,
        consumed_count=end - start + 1,
        is_backfill=backfill,
    )


def test_monthly_report_excludes_backfill_completion_and_adds_insights(session):
    regular = Work(
        title="Regular Finish",
        type=WorkType.anime,
        release_status=ReleaseStatus.finished,
        total_units=10,
    )
    archive = Work(
        title="Archive Finish",
        type=WorkType.anime,
        release_status=ReleaseStatus.finished,
        total_units=12,
    )
    session.add(regular)
    session.add(archive)
    session.flush()

    regular_round = Watching(
        work_id=regular.id,
        round_number=1,
        personal_status=PersonalStatus.done,
        finished_at=date(2026, 6, 3),
        rating=8.5,
    )
    archive_round = Watching(
        work_id=archive.id,
        round_number=1,
        personal_status=PersonalStatus.done,
        finished_at=date(2026, 6, 20),
        rating=7.0,
    )
    session.add(regular_round)
    session.add(archive_round)
    session.flush()

    session.add(_entry(
        regular_round.id, date(2026, 5, 10), 1, 1,
    ))
    session.add(_entry(
        regular_round.id, date(2026, 6, 2), 1, 5,
    ))
    session.add(_entry(
        regular_round.id, date(2026, 6, 3), 6, 10,
    ))
    session.add(_entry(
        archive_round.id, date(2026, 6, 1), 1, 3,
    ))
    session.add(_entry(
        archive_round.id, date(2026, 6, 20), 4, 12, backfill=True,
    ))
    session.commit()

    report = generate_monthly_report(session, 2026, 6)

    assert report["stats"] == {
        "entries_count": 3,
        "active_days": 3,
        "active_works": 2,
        "new_works": 1,
        "completed_works": 1,
    }
    assert [item["title"] for item in report["completed_list"]] == [
        "Regular Finish"
    ]
    assert report["completed_list"][0]["completed_at"] == "2026-06-03"

    assert report["activity_insight"]["active_days"] == 3
    assert report["activity_insight"]["longest_streak"] == 3
    assert report["activity_insight"]["busiest_day"]["date"] == "2026-06-03"
    assert report["daily_activity"]["2026-06-01"]["consumed"] == 3

    assert report["consumption"] == [{
        "type": "anime",
        "unit_label": None,
        "count": 13,
    }]
    assert [item["title"] for item in report["work_ranking"]] == [
        "Regular Finish",
        "Archive Finish",
    ]
    assert report["work_ranking"][0]["consumed_count"] == 10
    assert report["comparison"]["has_activity"] is True
    assert report["comparison"]["previous"]["entries_count"] == 1
    assert report["comparison"]["delta"]["entries_count"] == 2


def test_monthly_report_includes_caught_up_works_and_type_order(session):
    caught_up = Work(
        title="Anime Catch Up",
        type=WorkType.anime,
        release_status=ReleaseStatus.ongoing,
        total_units=3,
    )
    larger_manga = Work(
        title="Manga Volume",
        type=WorkType.manga,
        release_status=ReleaseStatus.ongoing,
        total_units=50,
        cover_path="covers/manga.jpg",
    )
    session.add(caught_up)
    session.add(larger_manga)
    session.flush()

    anime_round = Watching(
        work_id=caught_up.id,
        personal_status=PersonalStatus.watching,
        rating=8.0,
    )
    manga_round = Watching(
        work_id=larger_manga.id,
        personal_status=PersonalStatus.watching,
        rating=10.0,
    )
    session.add(anime_round)
    session.add(manga_round)
    session.flush()

    session.add(_entry(
        anime_round.id, date(2026, 6, 5), 1, 3,
    ))
    session.add(_entry(
        manga_round.id, date(2026, 6, 6), 1, 40,
    ))
    session.commit()

    report = generate_monthly_report(session, 2026, 6)

    assert [item["title"] for item in report["caught_up_list"]] == [
        "Anime Catch Up"
    ]
    assert report["caught_up_list"][0]["progress_end"] == 3
    assert [item["type"] for item in report["consumption"]] == [
        "anime", "manga"
    ]
    assert report["consumption"][1]["count"] > report["consumption"][0]["count"]
    assert report["rating_insight"]["rated_count"] == 2
    assert report["rating_insight"]["average"] == 9.0
