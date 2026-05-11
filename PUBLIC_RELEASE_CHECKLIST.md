# Public release checklist

Before making the repository public:

## Files/data

- [ ] `data/` is not committed
- [ ] `db.sqlite` is not committed
- [ ] `covers/` is not committed
- [ ] `backups/` is not committed
- [ ] `exports/` is not committed
- [ ] `.env` or local secrets are not committed
- [ ] `node_modules/`, `.venv/`, `dist/`, `build/`, `backend/app/static/` are not committed

## Git history

- [ ] Run `git status`
- [ ] Run `git log --oneline --decorate -n 20`
- [ ] Check whether old commits ever contained private data
- [ ] If private data was committed before, clean history or create a fresh public repository

## GitHub repo settings

- [ ] Add `README.md`
- [ ] Add `LICENSE`
- [ ] Add topics: `self-hosted`, `fastapi`, `react`, `sqlite`, `docker`, `media-tracker`
- [ ] Decide whether Issues are enabled
- [ ] Decide whether Discussions are enabled

## Security note

This app is designed for single-user LAN/NAS usage and has no built-in authentication. Do not expose it directly to the public internet without a trusted reverse proxy, VPN, or authentication layer.
