# Maku · Works Tracker

English | [简体中文](./README.md)

Maku is a self-hosted personal media tracking app for anime, movies, TV series, manga, novels, and other works.

It is designed around a simple idea: **local-first, private by default, and fully controlled by the user**. There is no account system, no external API dependency, and all runtime data stays in your own database and data directory. You control your SQLite database, cover files, tags, tag groups, and favorite collections.

> Inspired by Bangumi-style collection tracking, but focused on self-hosting, personal workflow, and data ownership.

---

## Highlights

- **Full control over your own database**: data is stored in local SQLite and local cover files, making it easy to back up, export, inspect, and migrate.
- **Custom tag system**: create your own tags, tag groups, aliases, and use them to organize your library.
- **Works library**: manage anime, movies, TV series, manga, novels, and custom “other” works.
- **Multiple rounds / rewatches**: each work can have multiple watching rounds with independent progress, rating, and review.
- **Range-based progress records**: record progress like “episodes 5–7”; same-day entries are merged visually.
- **Timeline**: browse your progress records chronologically and look back at what you watched or read over time.
- **Watching states**: Want, Watching, On hold, Done, and Dropped.
- **Caught-up view**: ongoing works that are already caught up are separated from actively watching works.
- **Backfill records**: log things watched in the past without polluting the timeline or monthly stats.
- **Favorite collections**: create custom collections such as “Best of the year”, “To reread”, or “By this creator”.
- **Mobile-friendly UI**: suitable for phone browsers and “Add to Home Screen” usage.
- **Data export and backup**: automatic SQLite backups, manual backups, JSON export with covers, and CSV export.
- **Bilingual UI**: Simplified Chinese and English.

---

## Roadmap

- **Monthly watching/reading reports**: summarize active works, completed works, progress count, and tag distribution by month.
- **Yearly reports**: show annual statistics, rating distribution, favorite types, frequently used tags, and long-term trends.
- More detailed filters and analytics views.
- Further mobile UX improvements.

---

## Tech stack

- **Backend**: FastAPI, SQLModel, SQLite
- **Frontend**: React, Vite, Tailwind CSS, React Query, Zustand
- **Packaging**: Docker / Docker Compose
- **Storage**: local SQLite database plus local cover files

---

## Quick start

Run this in the project root:

```bash
docker compose up -d --build
```

Then open:

```text
http://localhost:8765
```

Useful commands:

```bash
docker compose ps
docker compose logs -f works-tracker
docker compose restart
docker compose down
```

> Do not run `docker compose down -v` unless you intentionally want to remove Docker volumes.

---

## Deploy to QNAP NAS

### 1. Prepare a data directory

Create a persistent data directory on the NAS:

```bash
mkdir -p /share/Container/works-tracker/data
```

You can use another path, but remember to update the `volumes` section in `docker-compose.yml`.

### 2. Upload the project

Upload the project folder to the NAS, for example:

```text
/share/Container/works-tracker/app/works-tracker
```

### 3. Build and start

SSH into the NAS and run:

```bash
cd /share/Container/works-tracker/app/works-tracker
docker compose up -d --build
```

### 4. Visit the app

```text
http://<NAS_IP>:8765
```

Make sure your phone or computer is on the same local network as the NAS.

---

## Data and backups

The container stores runtime data in `/app/data`, mapped by default to:

```text
/share/Container/works-tracker/data
```

Typical structure:

```text
data/
├── db.sqlite
├── covers/
│   ├── *.jpg / *.png / *.webp
│   └── thumbs/
│       └── *.webp
├── backups/
│   └── db-YYYYMMDD-HHMMSS.sqlite
└── exports/
```

### Automatic backups

The app runs a scheduled SQLite backup at 03:00 every day, using the container timezone. The default timezone is set in `docker-compose.yml`:

```yaml
environment:
  - TZ=Australia/Sydney
```

Change it if needed, for example:

```yaml
environment:
  - TZ=Asia/Shanghai
```

### Manual backup and export

In **Settings → Data**, you can:

- create a manual backup
- download existing database backups
- export full JSON data with covers
- export CSV files for analysis

### Restore from backup

```bash
docker compose down
cp /share/Container/works-tracker/data/backups/db-YYYYMMDD-HHMMSS.sqlite \
   /share/Container/works-tracker/data/db.sqlite
docker compose up -d
```

---

## Local development

### Backend

Requires Python 3.12+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
$env:WT_DATA_DIR = "$pwd\..\data"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

Requires Node 20+.

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The Vite dev server proxies API requests to the backend.

---

## Project structure

```text
works-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── schemas.py
│   │   ├── models/
│   │   ├── routers/
│   │   └── utils/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── lib/
│   │   ├── components/
│   │   └── pages/
│   └── package.json
├── Dockerfile
├── docker-compose.yml
├── README.md
├── README.en.md
└── LICENSE
```

---

## Data model

```text
Work
  ├── title, type, cover, description, release_status, total_units, creators
  ├── tags[]
  ├── collections[]
  └── Watching[]
        ├── round_number, label, personal_status, rating, overall_review
        └── ProgressEntry[]
              └── date, range_start, range_end, note, is_backfill
```

Notes:

- A work always has at least one watching round.
- A rewatch is represented as a new watching round.
- Range progress applies to anime, TV, manga, and novels.
- Movies are tracked as watched/unwatched rather than range progress.
- Ongoing works can auto-extend `total_units` when a new progress record exceeds the current total.
- Finished works can automatically move to `Done` when progress reaches the total.
- If a finished work’s total is later increased, a completed watching round moves back to `Watching`.

---

## Public release checklist

Before publishing the repository publicly:

- Make sure `data/`, `db.sqlite`, `covers/`, `backups/`, `exports/`, `.env`, `.venv/`, `node_modules/`, and build outputs are not committed.
- Check `git status` before pushing.
- Review the commit history if the repository was previously used with private data.
- Keep the app behind a LAN/VPN/reverse proxy with authentication if exposing it beyond your home network.
- Keep the `LICENSE` file if you want others to be allowed to use, modify, and distribute the project.

---

## FAQ

### Does this upload my data anywhere?

No. Maku is designed to run locally on your own machine or NAS. It does not require login, telemetry, or third-party APIs.

### Is this safe to expose publicly?

Not by itself. The app is designed for single-user LAN usage and does not include built-in authentication. If you expose it to the internet, put it behind a trusted reverse proxy, VPN, or authentication layer.

### Can multiple devices use it?

Yes, as long as they can access the same deployed instance. SQLite handles concurrent reads well; writes are effectively serialized. For personal use this is usually fine.

### Why does the app use `Australia/Sydney` timezone by default?

The default deployment config uses `Australia/Sydney`. Change `TZ` in `docker-compose.yml` to your own timezone.

---

## License

MIT License. See [LICENSE](./LICENSE).
