# Maku · 作品追踪

[English](./README.en.md) | 简体中文

Maku 是一个可以部署在自己电脑或 NAS 上的个人作品追踪应用，用来记录动漫、电影、电视剧、漫画、小说和其他作品的观看/阅读进度。

它的核心目标是：**本地优先、私有可控、长期可维护**。你不需要注册账号，不依赖外部 API，所有数据都保存在你自己的数据库和文件目录里。你可以完全掌控自己的 SQLite 数据库、封面文件、标签体系和收藏夹结构。

> 灵感来自 Bangumi 一类的作品收藏/进度管理体验，但更偏向自托管、个人工作流和数据自主。

---

## 亮点

- **完全掌控自己的数据**：数据保存在本地 SQLite 数据库和本地封面目录中，可备份、导出、迁移。
- **自定义标签系统**：自由创建标签、标签分组、别名，并用标签组织作品库。
- **作品库管理**：支持动漫、电影、电视剧、漫画、小说和其他类型作品。
- **多周目模型**：一个作品可以有多个周目，例如一刷、二刷；每个周目都有独立进度、评分和总评。
- **区间式进度记录**：可以记录“第 5-7 集”这种连续进度，同一天多条记录会在显示层合并。
- **时间轴**：按日期查看所有进度记录，方便回看自己什么时候看了什么。
- **观看状态**：支持想看、在看、搁置、看完、弃坑。
- **等待更新视图**：连载中且已经追平最新进度的作品会从“在看中”分离出来。
- **补录记录**：可以登记以前看过的内容，补录不会污染时间轴和本月统计。
- **收藏夹**：用自定义收藏夹管理专题列表，例如“年度最佳”“想补的漫画”“某作者合集”。
- **移动端友好**：适合手机浏览器使用，也可以通过“添加到主屏幕”作为类 App 使用。
- **数据备份与导出**：支持自动 SQLite 备份、手动备份、JSON 含封面导出和 CSV 导出。
- **双语界面**：支持简体中文和英文界面。

---

## 未来计划

- **月度观看/阅读报告**：按月份总结活跃作品、完成作品、观看/阅读量、标签分布等。
- **年度报告**：生成全年作品统计、评分分布、最常看类型、最常用标签等。
- 更细的筛选和统计视图。
- 更完善的移动端体验。

---

## 技术栈

- **后端**：FastAPI, SQLModel, SQLite
- **前端**：React, Vite, Tailwind CSS, React Query, Zustand
- **部署**：Docker / Docker Compose
- **存储**：本地 SQLite 数据库 + 本地封面文件

---

## 快速开始

在项目根目录运行：

```bash
docker compose up -d --build
```

然后打开：

```text
http://localhost:8765
```

常用命令：

```bash
docker compose ps
docker compose logs -f works-tracker
docker compose restart
docker compose down
```

> 不要随便运行 `docker compose down -v`，除非你明确知道自己要删除 Docker volume。

---

## 部署到 QNAP NAS

### 1. 准备数据目录

在 NAS 上创建持久化数据目录：

```bash
mkdir -p /share/Container/works-tracker/data
```

你也可以使用其他路径。如果改了路径，请同步修改 `docker-compose.yml` 里的 `volumes`。

### 2. 上传项目

把项目目录上传到 NAS，例如：

```text
/share/Container/works-tracker/app/works-tracker
```

### 3. 构建并启动

SSH 进入 NAS：

```bash
cd /share/Container/works-tracker/app/works-tracker
docker compose up -d --build
```

### 4. 访问应用

```text
http://<NAS_IP>:8765
```

确保电脑或手机和 NAS 在同一局域网内。

---

## 数据与备份

容器内运行数据保存在 `/app/data`，默认映射到：

```text
/share/Container/works-tracker/data
```

典型结构：

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

### 自动备份

应用会在每天凌晨 03:00 执行 SQLite 备份，使用容器时区。默认时区在 `docker-compose.yml` 中设置：

```yaml
environment:
  - TZ=Australia/Sydney
```

可以改成自己的时区，例如：

```yaml
environment:
  - TZ=Asia/Shanghai
```

### 手动备份与导出

在 **设置 → 数据** 中可以：

- 创建手动备份
- 下载已有数据库备份
- 导出完整 JSON 数据和封面
- 导出 CSV 文件用于 Excel 或其他分析工具

### 从备份恢复

```bash
docker compose down
cp /share/Container/works-tracker/data/backups/db-YYYYMMDD-HHMMSS.sqlite \
   /share/Container/works-tracker/data/db.sqlite
docker compose up -d
```

---

## 本地开发

### 后端

需要 Python 3.12+。

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
$env:WT_DATA_DIR = "$pwd\..\data"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

需要 Node 20+。

```powershell
cd frontend
npm install
npm run dev
```

打开：

```text
http://localhost:5173
```

Vite 开发服务器会把 API 请求代理到后端。

---

## 项目结构

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

## 数据模型简介

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

说明：

- 一个作品至少有一个周目。
- 重看/重读通过新增周目实现。
- 动漫、电视剧、漫画、小说使用区间进度。
- 电影按已观看/未观看记录，不使用区间进度。
- 连载中作品如果记录进度超过当前总数，会自动扩展 `total_units`。
- 完结作品进度达到总数后，可以自动变为“看完”。
- 如果完结作品后来把总数改大，已完成的周目会自动退回“在看”。

---

## Public 前检查

如果你准备把仓库设为公开，请先确认：

- `data/`, `db.sqlite`, `covers/`, `backups/`, `exports/`, `.env`, `.venv/`, `node_modules/` 和构建产物没有被提交。
- `git status` 没有意外文件。
- 如果这个仓库以前存过私人数据，请检查 commit history。
- 如果要暴露到公网，请放在 VPN、反向代理或认证层之后。Maku 默认是单用户内网应用，不自带登录系统。
- 如果希望别人可以使用、修改和分发代码，请保留 `LICENSE` 文件。

---

## FAQ

### 数据会上传到外部服务吗？

不会。Maku 设计为本地/NAS 自托管应用，不需要登录，不使用遥测，不依赖第三方 API。

### 可以直接暴露到公网吗？

不建议。Maku 默认面向单用户局域网使用，没有内置认证。如果你要公网访问，请自行配置可信的反向代理、VPN 或认证层。

### 多个设备可以同时用吗？

可以，只要它们能访问同一个部署实例。SQLite 支持并发读取，写入会串行处理。对个人使用来说通常足够。

### 为什么默认时区是 Australia/Sydney？

默认部署配置使用 `Australia/Sydney`。可以在 `docker-compose.yml` 里修改 `TZ`。

---

## License

MIT License. See [LICENSE](./LICENSE).
