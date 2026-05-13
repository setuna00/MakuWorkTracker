"""FastAPI 应用主入口。

承担三件事：
1. 注册所有 API 路由
2. 静态托管 /data （封面图等）和前端 SPA
3. 启动备份调度器
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_db
from .routers import works, watchings, progress, tags, tag_groups, collections, timeline, admin, meta, reports
from .utils.backup import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    init_db()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Maku - Works Tracker", version="1.5.0", lifespan=lifespan)

# CORS（开发时前端 5173，生产同源不需要但保留无害）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由
app.include_router(meta.router)
app.include_router(works.router)
app.include_router(watchings.router)
app.include_router(progress.router)
app.include_router(tags.router)
app.include_router(tag_groups.router)
app.include_router(collections.router)
app.include_router(timeline.router)
app.include_router(admin.router)
app.include_router(reports.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# 在挂载 StaticFiles 之前确保目录存在（StaticFiles 在导入时就会检查目录）
settings.ensure_dirs()

# /data/* 给封面文件
app.mount("/data", StaticFiles(directory=settings.data_dir), name="data")


# 前端 SPA：把 build 产物挂在 /assets，根路径 fallback 到 index.html
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    # 静态资源
    if (STATIC_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # FastAPI 路由按注册顺序匹配；/api/* 已先注册，所以 catch-all 不会拦到 API
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
else:
    # 没有构建产物时（开发模式纯后端启动），根路径给个提示
    @app.get("/")
    def dev_root():
        return {
            "status": "backend running",
            "hint": "前端尚未构建。如需访问完整应用，请用 docker compose 部署，或在 frontend/ 跑 npm run dev",
            "api_docs": "/docs",
        }