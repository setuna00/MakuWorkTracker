# v1.6 改动汇总

## P0 修复

1. **CSV 导出中文乱码** (`admin.py`)
   - 三个 CSV(works/watchings/progress_entries)输出都加了 UTF-8 BOM (`\ufeff`),Excel / WPS 直接打开不再乱码

2. **新建作品页移动端自动放大** (`NewWorkPage.jsx`)
   - `fieldControlClass` 用 `text-base md:text-sm`,移动端 16px 不再触发 iOS Safari 缩放

3. **首页"最近动态"补录过滤 + 条数上限** (`HomePage.jsx`, `timeline.py`)
   - 前端用 `filter(item => !item.is_backfill)` 做二次防御过滤
   - 限制最多显示 10 条,超出时底部提供"查看更多 →"链接到时间轴
   - 后端 `recent_activity` 显式传 `include_backfill=False`,不依赖默认值

4. **搜索框语法点击行为** (`Layout.jsx`)
   - 在作品库页面,搜索框受 URL `?q=` 控制 — 清空时自动同步 URL,不再有"幽灵 q"
   - 选 `$tag:` / `$favorites:` 的具体值时,直接走 URL filter 参数(`?tag=<id>`、`?collection=<id>`),作品库的 chip 自动激活,**不再把字面量塞进 q**
   - `$author:` / `$director:` 这种没有实体表的 creator,仍然走 q 文本语法

5. **推荐算法基于最近记录** (新增 `/api/stats/recommendations`)
   - 统计最近 60 天有 progress 记录的作品的 tag/type 频率(同一作品计一次)
   - 对 `personal_status=want` 作品打分:重合 tag × 2 + 同 type × 1
   - 同分组用 seed 打散,"换一批"会换 seed
   - 没有最近记录时退化成随机(对新用户友好)

## P1 UI 改进

6. **侧边栏字号增大** (`Layout.jsx`)
   - section 标题 11px → 12px
   - 导航项 / 收藏夹项 / 设置 13px → 14px
   - 图标 15 → 16

7. **作品卡片可读性** (`WorkCard.jsx`)
   - 集数 / 评分行 11px → 12px,颜色 ink-500 → ink-600
   - 评分用 amber-700 + font-medium,对比度更高
   - TYPE chip 11px → 12px

8. **release_status 筛选** (`works.py`, `LibraryPage.jsx`)
   - 后端 `list_works` 加 `release_status` 参数(ongoing / finished)
   - 前端 FilterChip 跟 personal_status 同一行(中间有竖分隔线),不另起一行

9. **类型 Tab 后面带数字** (新增 `/api/stats/type-counts`, `LibraryPage.jsx`)
   - 后端聚合查询返回各 type 计数和总数
   - 前端 TypeTab 接一个 TabCount 小徽章

## P2 新增

10. **tag 分组可折叠** (`LibraryPage.jsx`)
    - 每个分组标题左侧 chevron,点击折叠/展开
    - 折叠状态写入 sessionStorage,刷新保留
    - 标题尾部显示该组 tag 总数 + 已选数量

11. **收藏夹批量添加作品** (新增 `BulkAddToCollectionModal.jsx`, `collections.py`)
    - 后端新增 `POST /api/collections/{id}/works` 批量加入端点 + `DELETE /api/collections/{id}/works/{work_id}` 移出端点
    - 前端:作品库筛选了 collection 时,标题旁出现"批量添加作品"按钮,弹 Modal
    - Modal 显示所有作品的封面+标题,已在收藏夹的作品标灰不可选
    - 客户端按 title/original_title 模糊搜索

## 暂未完成 (建议放 1.7)

- **月度/年度报告 增强** — 高频 tag、作品类型分布 (需要新设计 stats 面板)
- **作者/导演面板筛选** — 已可用 `$author:` 语法,如需 chip 入口下版本做
- **Bangumi 导入** — 建议做成可选插件,本期不动
- **观看时间 vs 记录时间分离** — 需要更明确的语义定义后再动数据模型
