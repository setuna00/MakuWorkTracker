# 作品追踪 · Works Tracker

一个部署在自己 NAS 上的个人作品追踪应用。记录你看过的动漫、电影、电视剧、漫画、小说，按周目维度追踪进度，自动生成时间轴。

灵感来自 Bangumi，但完全私有化、无登录、无外网依赖、所有数据在自己手里。

---

## 功能

- **作品库**：按类型管理（动漫 / 电影 / 电视剧 / 漫画 / 小说），自定义封面、简介、标签、收藏夹
- **周目模型**：每个作品可有多个周目（一刷/二刷），独立的进度、评分、总评
- **进度记录**：以"区间"形式记录（例如"看了第 5-7 集"），同日的多次记录自动合并显示
- **时间轴**：所有进度按日期纵向展示，支持按类型筛选
- **首页概览**：在看横滑、想看推荐、本月统计、最近动态
- **数据安全**：每天 03:00 自动备份，保留 30 份；可随时手动备份和导出（JSON 含封面 / CSV）

---

## 部署到 QNAP NAS

### 1. 准备数据目录

通过 SSH 或 File Station 在 NAS 上准备一个数据目录：

```bash
mkdir -p /share/Container/works-tracker/data
```

> 你也可以用其他路径。如果改了路径，记得同步修改 `docker-compose.yml` 里的 `volumes`。

### 2. 上传项目

把整个项目目录（解压后的 `works-tracker/`）通过 File Station 上传到 NAS 上的某个位置，例如 `/share/Container/works-tracker/app/`。

### 3. 构建并启动

SSH 进 NAS，进入项目目录：

```bash
cd /share/Container/works-tracker/app
docker compose up -d --build
```

首次构建大约需要 3-5 分钟（要拉镜像、装依赖、构建前端）。

### 4. 访问

- 电脑浏览器：`http://<NAS_IP>:8765`
- 手机 Safari/Chrome：同上，确保手机和 NAS 在同一局域网

> 端口 `8765` 可以在 `docker-compose.yml` 的 `ports` 里改成你喜欢的。

### 5. 检查容器状态

```bash
docker compose logs -f works-tracker     # 看日志
docker compose ps                          # 看状态
docker compose restart                     # 重启
docker compose down                        # 停止
```

---

## 数据与备份

### 数据目录结构

容器内的 `/app/data`（即 NAS 上的 `/share/Container/works-tracker/data`）：

```
data/
├── db.sqlite              # 主数据库
├── covers/                # 作品封面（原图 + 缩略图）
│   ├── xxxxx.jpg
│   └── thumbs/
│       └── xxxxx.webp
├── backups/               # 自动备份的数据库副本
│   └── db-20260503-030000.sqlite
└── exports/               # （未使用，导出走流式）
```

### 自动备份

应用启动后会注册一个定时任务，每天凌晨 03:00（按容器时区 `Australia/Sydney`，在 `docker-compose.yml` 里可改）执行一次 SQLite 热备份，保留最近 30 份。

可以在「设置 → 数据」页面看到所有备份并下载，也可以点"立即备份"手动触发一次。

### 手动导出

「设置 → 数据」里可以下载：

- **JSON 导出**：完整数据 + 所有封面图，打包成 zip。用于迁移或长期归档。
- **CSV 导出**：作品 / 周目 / 进度记录三张表的 CSV。用于在 Excel 等工具里做自定义分析。

### 还原备份

如果要从备份还原：

```bash
docker compose down
cp /share/Container/works-tracker/data/backups/db-YYYYMMDD-HHMMSS.sqlite \
   /share/Container/works-tracker/data/db.sqlite
docker compose up -d
```

---

## 在 Windows 上本地预览（可选）

你不需要在 Windows 上跑应用本身——直接部署到 NAS 用浏览器访问就行。但如果你想本地试试或开发：

### 方式 A：Docker Desktop（推荐）

1. 安装 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. 在项目根目录开 PowerShell 或 cmd：
   ```powershell
   docker compose up --build
   ```
3. 访问 `http://localhost:8765`

数据会保存在 PowerShell 当前目录下的 `./data` 子目录里（如果你想用 NAS 同样路径，需要改 `docker-compose.yml`）。

### 方式 B：直接跑 Python + Node（开发模式）

需要 Python 3.12+ 和 Node 20+。

后端：
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
$env:WT_DATA_DIR = "$pwd\..\data"   # 数据目录指向项目内
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

前端（开新的 PowerShell）：
```powershell
cd frontend
npm install
npm run dev
```

然后访问 `http://localhost:5173`。前端会代理 `/api` 到 `http://localhost:8000`。

---

## 项目结构

```
works-tracker/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py            # 应用入口
│   │   ├── config.py          # 配置（环境变量 WT_*）
│   │   ├── db.py              # SQLite 引擎
│   │   ├── schemas.py         # Pydantic 请求/响应模型
│   │   ├── models/            # ORM 模型（Work / Watching / ProgressEntry / Tag / Collection）
│   │   ├── routers/           # API 路由（works/watchings/progress/tags/collections/timeline/admin/meta）
│   │   └── utils/             # 图片处理、备份调度
│   └── requirements.txt
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── App.jsx            # 路由
│   │   ├── main.jsx           # 入口
│   │   ├── lib/               # API 客户端、格式化工具
│   │   ├── components/        # 通用组件（Layout、Modal、WorkCard、QuickRecordModal）
│   │   └── pages/             # 页面（首页、作品库、详情、时间轴、新建、快速记录、设置）
│   └── package.json
├── Dockerfile                  # 多阶段：构建前端 + 打包后端
├── docker-compose.yml
└── README.md
```

---

## 数据模型简介

```
Work（作品 = main 分支）
  ├── title, type, cover, description, total_units, creators (JSON), tags, collections
  └── Watching[]（周目 = branch）
        ├── round_number, label, personal_status, rating, overall_review
        └── ProgressEntry[]（进度日志）
              └── date, range_start, range_end, note
```

- 一个作品至少有 1 个周目（创建时自动建 main 周目）
- 重看 = 创建一个新周目（round_number+1），独立追踪
- 进度记录始终以"区间"存储；同日同周目的多条记录在显示层自动合并为 `[min, max]`
- 连载中的作品如果记录的 `range_end` 超过 `total_units`，会自动扩展总数

---

## 常见问题

**Q: 为什么时区是 Australia/Sydney？**
A: 因为我在悉尼。可以在 `docker-compose.yml` 把 `TZ` 改成你所在的时区，例如 `Asia/Shanghai`。

**Q: 数据真的不会上传到任何地方吗？**
A: 是的。整个应用只在你的 NAS 上运行，没有外部 API 调用，没有遥测，没有登录。代码完全公开你可以自己审。

**Q: 一定要装 Docker 吗？**
A: 推荐用 Docker（QNAP Container Station 自带）。不想用 Docker 的话也可以参考"方式 B"直接跑 Python+Node。

**Q: 需要登录吗？**
A: 不需要。设计是单用户内网使用，无认证。如果你想暴露到公网，请自行加反向代理 + 认证（不建议）。

**Q: 多设备同时操作会不会冲突？**
A: SQLite WAL 模式支持并发读，单写。同时编辑同一条记录时是"最后写入获胜"。单用户场景下基本无感。

---

## License

私有项目，自用。
