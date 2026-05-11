// 简单的 i18n / Simple i18n
//
// 只用 zustand（已经在依赖里）+ localStorage，不引第三方 i18n 库。
// Pure zustand + localStorage, no third-party i18n lib.
//
// 用法 / Usage:
//   import { useT } from '../lib/i18n'
//   const t = useT()
//   <h1>{t('nav.home')}</h1>
//
// 占位符:用 {name} 形式
//   t('confirm.deleteTag', { name: '科幻' })
//
// 注意:enum 值（例如 'want' / 'finished' / 'anime'）的人类可读标签集中放在
// translations.enum 下；后端返回的 label 就忽略,改用前端翻译。

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// =================== 翻译资源 ===================

const zh = {
  // App
  'app.name': 'Maku',
  'app.subtitle': 'Works Tracker',

  // Nav / Tabs
  'nav.section': '导航',
  'nav.home': '首页',
  'nav.library': '作品库',
  'nav.timeline': '时间轴',
  'nav.favorites': '收藏夹',
  'nav.settings': '设置',
  'nav.noFavorites': '还没有收藏夹',

  // Search
  'search.placeholder': '搜索作品',
  'search.advancedHint': '高级搜索语法（点一下自动填入）',
  'search.matchLabel': '匹配 {label}',
  'search.continueTyping': '继续输入以搜索',
  'search.grammar.tag': '标签',
  'search.grammar.favorites': '收藏夹',
  'search.grammar.author': '作者',
  'search.grammar.director': '导演',

  // Common
  'common.cancel': '取消',
  'common.save': '保存',
  'common.saveFailed': '保存失败',
  'common.delete': '删除',
  'common.confirm': '确认',
  'common.confirmDelete': '确认删除',
  'common.add': '添加',
  'common.edit': '编辑',
  'common.create': '新建',
  'common.optional': '可选',
  'common.required': '必填',
  'common.all': '全部',
  'common.loading': '加载中...',
  'common.creating': '创建中...',
  'common.saving': '保存中...',
  'common.recording': '记录中...',
  'common.processing': '处理中...',
  'common.importing': '导入中...',
  'common.backupRunning': '备份中...',
  'common.next': '下一步',
  'common.prev': '← 上一步',
  'common.clear': '清除',
  'common.sortAsc': '升序',
  'common.sortDesc': '降序',
  'common.backfillTag': '补录',

  // Home
  'home.watching': '在看中 · {count}',
  'home.caughtUp': '等待更新 · {count}',
  'home.viewAll': '查看全部',
  'home.recommend': '想看推荐',
  'home.recommendShuffle': '换一批',
  'home.recommendEmpty': '标记为"想看"后会出现在这里',
  'home.watchingEmpty': '还没有在看的作品',
  'home.monthlyOverview': '本月概览',
  'home.recentActivity': '最近动态',
  'home.entriesEmpty': '还没有进度记录',
  'home.stat.entries': '本月记录',
  'home.stat.activeWorks': '活跃作品',
  'home.stat.newWorks': '本月新开',
  'home.stat.unitEntries': '条',
  'home.stat.unitWorks': '部',

  // Library
  'library.title': '作品库',
  'library.countSuffix': '部作品',
  'library.searchSuffix': '· 搜索 "{q}"',
  'library.sort.updated': '最近更新',
  'library.sort.created': '最近创建',
  'library.sort.title': '标题',
  'library.sort.rating': '评分',
  'library.sort.lastProgress': '最近进度',
  'library.filter': '筛选',
  'library.filter.personalStatus': '个人状态',
  'library.filter.tags': '标签',
  'library.filter.tagsSelected': '标签 (已选 {n}, 同时满足)',
  'library.filter.clearAll': '清除所有筛选',
  'library.filter.activeMonth': '本月活跃作品（{month}）',
  'library.filter.newMonth': '本月新开作品（{month}）',

  // Favorites page (mobile-only entry)
  'favorites.title': '收藏夹',
  'favorites.subtitle': '把作品分组到自定义收藏夹',
  'favorites.empty': '还没有收藏夹',
  'favorites.emptyHint': '可以去「设置 → 收藏夹」创建',
  'favorites.gotoSettings': '前往设置',
  'favorites.workCount': '{n} 部作品',

  // Timeline
  'timeline.title': '时间轴',
  'timeline.subtitle': '所有进度记录按时间排列',
  'timeline.allTypes': '全部类型',
  'timeline.allTime': '全部时间',
  'timeline.lastMonth': '近 1 个月',
  'timeline.last3Months': '近 3 个月',
  'timeline.thisYear': '今年',
  'timeline.year': '{year} 年',
  'timeline.custom': '自定义',
  'timeline.from': '从',
  'timeline.to': '到',
  'timeline.empty': '没有符合条件的记录',
  'timeline.entriesCount': '{n} 条记录',
  'timeline.includeBackfill': '包含补录',
  'timeline.merged': '合并 {n}',
  'timeline.mergedExpand': '合并 {n} 条',
  'timeline.confirmDeleteEntry.title': '确认删除记录',
  'timeline.confirmDeleteEntry.message': '将删除该条进度记录。',

  // Quick record
  'quickRecord.title': '快速记录',
  'quickRecord.pickWork': '先选一个作品',
  'quickRecord.searchPlaceholder': '搜索作品...',
  'quickRecord.noMatch': '没有匹配的作品',
  'quickRecord.noWorks': '还没有作品',
  'quickRecord.reSelect': '重新选择作品',
  'quickRecord.toRound': '记录到哪个周目',
  'quickRecord.date': '日期',
  'quickRecord.progress': '进度（{unit}）',
  'quickRecord.progressCurrent': '进度（{unit}） · 当前 {n}',
  'quickRecord.note': '感想（可选）',
  'quickRecord.notePlaceholder': '本次的想法...',
  'quickRecord.submit': '记录',
  'quickRecord.invalidRange': '请输入有效的进度区间',
  'quickRecord.recordFailed': '记录失败',
  'quickRecord.modal.title': '记录进度 · {title}',
  'quickRecord.modal.toRound': '正在记录到「{label}」',

  // Edit entry
  'editEntry.title': '编辑进度记录',
  'editEntry.note': '感想',

  // Backfill
  'backfill.title': '补录《{title}》',
  'backfill.hint': '补录用于登记以前看过的内容。补录的记录不出现在时间轴和本月统计里。',
  'backfill.dateLabel': '补录日期',
  'backfill.toLabel': '看到第 ({unit})',
  'backfill.noteLabel': '备注（选填）',
  'backfill.submit': '保存补录',
  'backfill.invalidRange': '请填写有效的进度数',
  'backfill.totalHint': '共 {total} {unit}',

  // New work
  'newWork.title': '新建作品',
  'newWork.stepOf': '步骤 {step} / 3',
  'newWork.step1.title': '选择作品类型',
  'newWork.step1.unit': '单位：{unit}',
  'newWork.step2.basic': '基本信息',
  'newWork.step2.basicDesc': '作品的标题与简介',
  'newWork.step2.fieldTitle': '标题',
  'newWork.step2.titlePlaceholder': '作品名称',
  'newWork.step2.originalTitle': '原文标题',
  'newWork.step2.originalTitlePlaceholder': '原版语言的标题',
  'newWork.step2.description': '简介',
  'newWork.step2.descriptionPlaceholder': '简单介绍一下这部作品...',
  'newWork.step2.cover': '封面',
  'newWork.step2.coverDesc': '推荐 3:4 比例 · 支持 JPG / PNG / WebP',
  'newWork.step2.progress': '进度信息',
  'newWork.step2.progressDesc': '作品状态与总集数',
  'newWork.step2.releaseStatus': '作品状态',
  'newWork.step2.totalUnits': '总{unit}数',
  'newWork.step2.unitLabel': '进度单位',
  'newWork.step2.unitDefault': '默认（{unit}）',
  'newWork.step3.initialStatus': '初始追看状态',
  'newWork.step3.initialStatusDesc': '创建后可随时调整',
  'newWork.step3.tags': '标签',
  'newWork.step3.tagsSelected': '已选 {n} 个',
  'newWork.tagSuggestions': '相关推荐',
  'newWork.step3.collections': '收藏夹',
  'newWork.step3.tagsEmpty': '还没有标签，可以去「设置 → 标签」创建后再回来添加',
  'newWork.step3.collectionsEmpty': '还没有收藏夹，可以去「设置 → 收藏夹」创建后再回来添加',
  'newWork.backfill.toggle': '我以前看过',
  'newWork.backfill.toLabel': '看到第 ({unit})：',
  'newWork.backfill.movieHint': '已观看，记录后将自动标记完成。',
  'newWork.errors.titleRequired': '请输入作品名称',
  'newWork.errors.titleRequiredAlt': '请填写标题',
  'newWork.errors.totalRequired': '请输入总{unit}数',
  'newWork.errors.totalRequiredFinished': '完结作品必须填写总{unit}数',
  'newWork.errors.createFailed': '创建失败',
  'newWork.submit': '创建作品',
  'newWork.cropper.title': '裁剪封面',

  // Cover dropzone
  'cover.preview': '3:4 预览',
  'cover.selected': '封面已选择',
  'cover.selectedHint': '已裁剪为 3:4 比例。如需重新选择，可点击下方按钮。',
  'cover.replace': '更换封面',
  'cover.remove': '移除',
  'cover.uploadPrompt': '点击或拖拽图片到此处上传',
  'cover.uploadHint': '推荐 3:4 比例 · 支持 JPG / PNG / WebP',
  'cover.uploadHintAlt': '上传后可拖动裁剪',
  'cover.choose': '选择图片',
  'cover.removeTitle': '移除封面',
  'cover.cropperHint': '拖动图片调整位置 · 滚轮或滑块缩放 · 输出固定 3:4 封面比例',
  'cover.applyCrop': '应用裁剪',
  'cover.cropFailed': '裁剪失败：{msg}',
  'cover.reset': '重置',

  // Work detail
  'workDetail.loading': '加载中...',
  'workDetail.editMeta': '编辑作品信息',
  'workDetail.deleteRound': '删除当前周目',
  'workDetail.deleteWork': '删除作品',
  'workDetail.statusOngoing': '连载中',
  'workDetail.statusFinished': '完结',
  'workDetail.tagFavoriteHint': '点击查看该收藏夹的所有作品',
  'workDetail.tagTagHint': '点击查看该标签的所有作品',
  'workDetail.addTagOrFavorite': '+ 添加标签或加入收藏夹',
  'workDetail.watchStatus': '追看状态',
  'workDetail.viewStatus': '观看状态',
  'workDetail.watched': '已观看',
  'workDetail.unwatched': '未观看',
  'workDetail.rating': '评分',
  'workDetail.progress': '进度',
  'workDetail.progressDone': '已完成 {pct}%',
  'workDetail.progressNoTotal': '未设置总{unit}数',
  'workDetail.progressNotStarted': '未开始',
  'workDetail.review': '总评（本周目）',
  'workDetail.reviewSave': '保存修改',
  'workDetail.reviewPlaceholder': '本周目的整体评价...',
  'workDetail.entryLog': '进度日志',
  'workDetail.entryLogEmpty': '还没有进度记录',
  'workDetail.recordNew': '记录新进度',
  'workDetail.backfill': '补录',
  'workDetail.round': '第 {n} 周目',
  'workDetail.newRound': '开启新周目',
  'workDetail.unitProgress': '第 {n} {unit}',
  'workDetail.unitRange': '第 {start}-{end} {unit}',
  'workDetail.confirmDeleteWork.title': '确认删除作品',
  'workDetail.confirmDeleteWork.body': '将删除「{title}」及其所有周目和进度记录。',
  'workDetail.confirmDeleteWork.warn': '此操作不可恢复。',
  'workDetail.confirmDeleteRound.title': '确认删除周目',
  'workDetail.confirmDeleteRound.body': '将删除「{label}」及其所有进度记录、评分和总评。',
  'workDetail.editTitle': '编辑作品信息',
  'workDetail.editFieldOriginalTitle': '原文标题（可选）',
  'workDetail.editFieldDescription': '简介',
  'workDetail.editFieldCover': '更换封面',
  'workDetail.editFieldTagsLabel': '标签（{n} 已选）',
  'workDetail.editFieldCollectionsLabel': '收藏夹（{n} 已选）',
  'workDetail.editTagsEmpty': '还没有标签，可以去「设置 → 标签」创建',
  'workDetail.editCollectionsEmpty': '还没有收藏夹，可以去「设置 → 收藏夹」创建',
  'workDetail.expand': '展开',
  'workDetail.collapse': '收起',

  // Status enum (personal_status)
  'status.want': '想看',
  'status.watching': '在看',
  'status.on_hold': '搁置',
  'status.done': '看完',
  'status.dropped': '弃坑',

  // Release status
  'release.ongoing': '连载中',
  'release.finished': '完结',

  // Type enum
  'type.anime': '动漫',
  'type.movie': '电影',
  'type.tv': '电视剧',
  'type.manga': '漫画',
  'type.novel': '小说',
  'type.other': '其他',

  // Unit labels for built-in types
  'unit.集': '集',
  'unit.章': '章',
  'unit.部': '部',
  'unit.单元': '单元',
  'unit.页': '页',
  'unit.话': '话',
  'unit.本': '本',

  // Creator field labels
  'creator.author': '作者',
  'creator.studio': '制作',
  'creator.director': '导演',

  // Empty card
  'card.newWork': '新建作品',
  'card.notStarted': '未开始',
  'card.quickRecord': '快速记录',

  // FAB
  'fab.newWork': '新建作品',
  'fab.quickRecord': '快速记录进度',

  // Settings
  'settings.title': '设置',
  'settings.subtitle': '管理标签、收藏夹和数据',
  'settings.tab.tags': '标签',
  'settings.tab.collections': '收藏夹',
  'settings.tab.data': '数据',
  'settings.tab.about': '关于',
  'settings.tab.appearance': '外观',
  'settings.tags.new': '新建标签',
  'settings.tags.namePlaceholder': '标签名',
  'settings.tags.empty': '还没有标签',
  'settings.tags.confirmDelete.title': '确认删除标签',
  'settings.tags.confirmDelete.body': '将删除标签「{name}」。',
  'settings.tags.confirmDelete.note': '关联的作品不会受影响。',
  'settings.tagGroups.title': '标签分组',
  'settings.tagGroups.empty': '还没有分组',
  'settings.tagGroups.new': '新建分组',
  'settings.tagGroups.namePlaceholder': '分组名',
  'settings.tagGroups.defaultBadge': '默认',
  'settings.tagGroups.maxHint': '建议最多 5 个分组',
  'settings.tagGroups.moveUp': '上移',
  'settings.tagGroups.moveDown': '下移',
  'settings.tagGroups.rename': '重命名',
  'settings.tagGroups.confirmDelete.title': '确认删除分组',
  'settings.tagGroups.confirmDelete.body': '将删除分组「{name}」。',
  'settings.tagGroups.confirmDelete.note': '该分组下的标签会被移到默认分组。',
  'settings.tagGroups.cantDeleteDefault': '默认分组不可删除',
  'settings.tagGroups.tagsCount': '{count} 个标签',
  'settings.tagGroups.upgradeBanner': '标签分组功能已启用，您可以创建新分组并整理标签。',
  'settings.tagGroups.upgradeBannerDismiss': '知道了',
  'settings.tags.aliases.label': '别名',
  'settings.tags.aliases.placeholder': '用逗号分隔，如：推理, mystery, 谜',
  'settings.tags.aliases.hint': '别名仅用于搜索，不会显示在标签上',
  'settings.tags.aliases.errorEmpty': '别名不能为空',
  'settings.tags.aliases.errorDuplicate': '别名「{name}」已被其他标签使用',
  'settings.tags.aliases.errorSelfDuplicate': '别名内部重复：{name}',
  'settings.tags.groupLabel': '所属分组',
  'settings.tags.moveToGroup': '移到分组',
  'tagPicker.searchPlaceholder': '搜索标签...',
  'tagPicker.noMatch': '没有匹配的标签',
  'tagPicker.noTagsYet': '还没有标签，去设置中创建',
  'tagPicker.searchHint': '支持中文、英文、拼音、别名',
  'tagPicker.clearSearch': '清除搜索',
  'settings.collections.new': '新建收藏夹',
  'settings.collections.namePlaceholder': '收藏夹名（如：吉卜力全集）',
  'settings.collections.hint': '收藏夹添加好后，可以在作品详情页的"编辑信息"里把作品加入收藏夹。',
  'settings.collections.empty': '还没有收藏夹',
  'settings.collections.confirmDelete.title': '确认删除收藏夹',
  'settings.collections.confirmDelete.body': '将删除收藏夹「{name}」。',
  'settings.data.export.title': '导出数据',
  'settings.data.export.desc': '导出全部数据用于迁移或归档备份',
  'settings.data.export.json': '导出 JSON（含封面）',
  'settings.data.export.csv': '导出 CSV',
  'settings.data.import.title': '导入数据',
  'settings.data.import.desc': '支持导入"导出 JSON（含封面）"下载的 zip。导入会覆盖当前全部数据。',
  'settings.data.import.btn': '导入并覆盖',
  'settings.data.import.done': '导入完成，页面将刷新以加载新数据。',
  'settings.data.backup.title': '数据库备份',
  'settings.data.backup.desc': '自动每天凌晨 03:00 备份，保留最近 30 份。可立即手动备份。',
  'settings.data.backup.btn': '立即备份',
  'settings.data.backup.empty': '还没有备份',
  'settings.data.backup.download': '下载',
  'settings.about.version': '版本',
  'settings.about.worksCount': '作品数',
  'settings.about.entriesCount': '进度记录数',
  'settings.about.dbSize': '数据库大小',
  'settings.about.dataDir': '数据目录',
  'settings.about.privacy': '本应用仅运行在你自己的 NAS 上，所有数据保存在数据目录中，不上传任何外部服务。',
  'settings.appearance.language': '语言',
  'settings.appearance.languageDesc': '切换界面语言。仅作用于本设备。',
  'settings.appearance.languageZh': '简体中文',
  'settings.appearance.languageEn': 'English',
}

const en = {
  // App
  'app.name': 'Maku',
  'app.subtitle': 'Works Tracker',

  // Nav / Tabs
  'nav.section': 'Navigation',
  'nav.home': 'Home',
  'nav.library': 'Library',
  'nav.timeline': 'Timeline',
  'nav.favorites': 'Favorites',
  'nav.settings': 'Settings',
  'nav.noFavorites': 'No favorites yet',

  // Search
  'search.placeholder': 'Search works',
  'search.advancedHint': 'Advanced search syntax (click to insert)',
  'search.matchLabel': 'Match {label}',
  'search.continueTyping': 'Keep typing to search',
  'search.grammar.tag': 'tag',
  'search.grammar.favorites': 'favorites',
  'search.grammar.author': 'author',
  'search.grammar.director': 'director',

  // Common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saveFailed': 'Save failed',
  'common.delete': 'Delete',
  'common.confirm': 'Confirm',
  'common.confirmDelete': 'Confirm Delete',
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.create': 'Create',
  'common.optional': 'optional',
  'common.required': 'required',
  'common.all': 'All',
  'common.loading': 'Loading…',
  'common.creating': 'Creating…',
  'common.saving': 'Saving…',
  'common.recording': 'Recording…',
  'common.processing': 'Processing…',
  'common.importing': 'Importing…',
  'common.backupRunning': 'Backing up…',
  'common.next': 'Next',
  'common.prev': '← Back',
  'common.clear': 'Clear',
  'common.sortAsc': 'Ascending',
  'common.sortDesc': 'Descending',
  'common.backfillTag': 'Backfill',

  // Home
  'home.watching': 'Now Watching · {count}',
  'home.caughtUp': 'Caught up · {count}',
  'home.viewAll': 'View all',
  'home.recommend': 'From your watchlist',
  'home.recommendShuffle': 'Shuffle',
  'home.recommendEmpty': 'Works marked "Want to watch" will appear here',
  'home.watchingEmpty': 'Nothing in progress yet',
  'home.monthlyOverview': 'This Month',
  'home.recentActivity': 'Recent Activity',
  'home.entriesEmpty': 'No progress entries yet',
  'home.stat.entries': 'Entries',
  'home.stat.activeWorks': 'Active works',
  'home.stat.newWorks': 'New this month',
  'home.stat.unitEntries': '',
  'home.stat.unitWorks': '',

  // Library
  'library.title': 'Library',
  'library.countSuffix': 'works',
  'library.searchSuffix': '· searching "{q}"',
  'library.sort.updated': 'Recently updated',
  'library.sort.created': 'Recently created',
  'library.sort.title': 'Title',
  'library.sort.rating': 'Rating',
  'library.sort.lastProgress': 'Last progress',
  'library.filter': 'Filter',
  'library.filter.personalStatus': 'Status',
  'library.filter.tags': 'Tags',
  'library.filter.tagsSelected': 'Tags ({n} selected, AND)',
  'library.filter.clearAll': 'Clear all filters',
  'library.filter.activeMonth': 'Active works ({month})',
  'library.filter.newMonth': 'New works ({month})',

  // Favorites page
  'favorites.title': 'Favorites',
  'favorites.subtitle': 'Group works into custom favorite lists',
  'favorites.empty': 'No favorites yet',
  'favorites.emptyHint': 'Create one in Settings → Favorites',
  'favorites.gotoSettings': 'Go to Settings',
  'favorites.workCount': '{n} works',

  // Timeline
  'timeline.title': 'Timeline',
  'timeline.subtitle': 'All progress entries in chronological order',
  'timeline.allTypes': 'All types',
  'timeline.allTime': 'All time',
  'timeline.lastMonth': 'Last month',
  'timeline.last3Months': 'Last 3 months',
  'timeline.thisYear': 'This year',
  'timeline.year': '{year}',
  'timeline.custom': 'Custom',
  'timeline.from': 'From',
  'timeline.to': 'To',
  'timeline.empty': 'No matching entries',
  'timeline.entriesCount': '{n} entries',
  'timeline.includeBackfill': 'Include backfill',
  'timeline.merged': 'merged {n}',
  'timeline.mergedExpand': '{n} merged',
  'timeline.confirmDeleteEntry.title': 'Delete entry?',
  'timeline.confirmDeleteEntry.message': 'This progress entry will be deleted.',

  // Quick record
  'quickRecord.title': 'Quick Record',
  'quickRecord.pickWork': 'Pick a work first',
  'quickRecord.searchPlaceholder': 'Search works…',
  'quickRecord.noMatch': 'No matching works',
  'quickRecord.noWorks': 'No works yet',
  'quickRecord.reSelect': 'Pick a different work',
  'quickRecord.toRound': 'Record to which round',
  'quickRecord.date': 'Date',
  'quickRecord.progress': 'Progress ({unit})',
  'quickRecord.progressCurrent': 'Progress ({unit}) · current {n}',
  'quickRecord.note': 'Note (optional)',
  'quickRecord.notePlaceholder': 'Your thoughts…',
  'quickRecord.submit': 'Record',
  'quickRecord.invalidRange': 'Please enter a valid range',
  'quickRecord.recordFailed': 'Failed to record',
  'quickRecord.modal.title': 'Record · {title}',
  'quickRecord.modal.toRound': 'Recording to "{label}"',

  // Edit entry
  'editEntry.title': 'Edit Entry',
  'editEntry.note': 'Note',

  // Backfill
  'backfill.title': 'Backfill: {title}',
  'backfill.hint': "Backfill is for logging things you watched in the past. Backfilled entries don't show in timeline or stats.",
  'backfill.dateLabel': 'Backfill date',
  'backfill.toLabel': 'Watched up to ({unit})',
  'backfill.noteLabel': 'Note (optional)',
  'backfill.submit': 'Save backfill',
  'backfill.invalidRange': 'Please enter a valid progress number',
  'backfill.totalHint': 'Total: {total} {unit}',

  // New work
  'newWork.title': 'New Work',
  'newWork.stepOf': 'Step {step} / 3',
  'newWork.step1.title': 'Choose a work type',
  'newWork.step1.unit': 'Unit: {unit}',
  'newWork.step2.basic': 'Basic info',
  'newWork.step2.basicDesc': 'Title and description',
  'newWork.step2.fieldTitle': 'Title',
  'newWork.step2.titlePlaceholder': 'Work name',
  'newWork.step2.originalTitle': 'Original title',
  'newWork.step2.originalTitlePlaceholder': 'Title in the original language',
  'newWork.step2.description': 'Description',
  'newWork.step2.descriptionPlaceholder': 'A short description…',
  'newWork.step2.cover': 'Cover',
  'newWork.step2.coverDesc': 'Recommended 3:4 ratio · JPG / PNG / WebP',
  'newWork.step2.progress': 'Progress info',
  'newWork.step2.progressDesc': 'Release status and total {unit}s',
  'newWork.step2.releaseStatus': 'Release status',
  'newWork.step2.totalUnits': 'Total {unit}s',
  'newWork.step2.unitLabel': 'Progress unit',
  'newWork.step2.unitDefault': 'Default ({unit})',
  'newWork.step3.initialStatus': 'Initial status',
  'newWork.step3.initialStatusDesc': 'You can change this anytime',
  'newWork.step3.tags': 'Tags',
  'newWork.step3.tagsSelected': '{n} selected',
  'newWork.tagSuggestions': 'Suggested tags',
  'newWork.step3.collections': 'Favorites',
  'newWork.step3.tagsEmpty': 'No tags yet — create some in Settings → Tags',
  'newWork.step3.collectionsEmpty': 'No favorites yet — create some in Settings → Favorites',
  'newWork.backfill.toggle': "I've watched this before",
  'newWork.backfill.toLabel': 'Watched up to ({unit}):',
  'newWork.backfill.movieHint': 'Will be marked watched on save.',
  'newWork.errors.titleRequired': 'Please enter a title',
  'newWork.errors.titleRequiredAlt': 'Title is required',
  'newWork.errors.totalRequired': 'Please enter total {unit}s',
  'newWork.errors.totalRequiredFinished': 'Finished works require a total {unit} count',
  'newWork.errors.createFailed': 'Failed to create',
  'newWork.submit': 'Create',
  'newWork.cropper.title': 'Crop cover',

  // Cover dropzone
  'cover.preview': '3:4 preview',
  'cover.selected': 'Cover selected',
  'cover.selectedHint': 'Cropped to 3:4. Tap below to choose a different image.',
  'cover.replace': 'Replace',
  'cover.remove': 'Remove',
  'cover.uploadPrompt': 'Click or drag an image here',
  'cover.uploadHint': 'Recommended 3:4 ratio · JPG / PNG / WebP',
  'cover.uploadHintAlt': 'You can crop after upload',
  'cover.choose': 'Choose image',
  'cover.removeTitle': 'Remove cover',
  'cover.cropperHint': 'Drag to reposition · scroll or slide to zoom · output is fixed 3:4',
  'cover.applyCrop': 'Apply',
  'cover.cropFailed': 'Crop failed: {msg}',
  'cover.reset': 'Reset',

  // Work detail
  'workDetail.loading': 'Loading…',
  'workDetail.editMeta': 'Edit info',
  'workDetail.deleteRound': 'Delete this round',
  'workDetail.deleteWork': 'Delete work',
  'workDetail.statusOngoing': 'Ongoing',
  'workDetail.statusFinished': 'Finished',
  'workDetail.tagFavoriteHint': 'View all works in this favorite',
  'workDetail.tagTagHint': 'View all works with this tag',
  'workDetail.addTagOrFavorite': '+ Add tag or favorite',
  'workDetail.watchStatus': 'Status',
  'workDetail.viewStatus': 'Watch status',
  'workDetail.watched': 'Watched',
  'workDetail.unwatched': 'Not watched',
  'workDetail.rating': 'Rating',
  'workDetail.progress': 'Progress',
  'workDetail.progressDone': '{pct}% done',
  'workDetail.progressNoTotal': 'Total {unit}s not set',
  'workDetail.progressNotStarted': 'Not started',
  'workDetail.review': 'Review (this round)',
  'workDetail.reviewSave': 'Save',
  'workDetail.reviewPlaceholder': 'Your overall thoughts on this round…',
  'workDetail.entryLog': 'Entries',
  'workDetail.entryLogEmpty': 'No entries yet',
  'workDetail.recordNew': 'Record progress',
  'workDetail.backfill': 'Backfill',
  'workDetail.round': 'Round {n}',
  'workDetail.newRound': 'New round',
  'workDetail.unitProgress': '{unit} {n}',
  'workDetail.unitRange': '{unit} {start}-{end}',
  'workDetail.confirmDeleteWork.title': 'Delete work?',
  'workDetail.confirmDeleteWork.body': '"{title}" and all its rounds and entries will be deleted.',
  'workDetail.confirmDeleteWork.warn': 'This cannot be undone.',
  'workDetail.confirmDeleteRound.title': 'Delete round?',
  'workDetail.confirmDeleteRound.body': '"{label}" and all its entries, rating and review will be deleted.',
  'workDetail.editTitle': 'Edit work',
  'workDetail.editFieldOriginalTitle': 'Original title (optional)',
  'workDetail.editFieldDescription': 'Description',
  'workDetail.editFieldCover': 'Replace cover',
  'workDetail.editFieldTagsLabel': 'Tags ({n} selected)',
  'workDetail.editFieldCollectionsLabel': 'Favorites ({n} selected)',
  'workDetail.editTagsEmpty': 'No tags yet — create some in Settings → Tags',
  'workDetail.editCollectionsEmpty': 'No favorites yet — create some in Settings → Favorites',
  'workDetail.expand': 'Show more',
  'workDetail.collapse': 'Show less',


  // Status enum
  'status.want': 'Want',
  'status.watching': 'Watching',
  'status.on_hold': 'On hold',
  'status.done': 'Done',
  'status.dropped': 'Dropped',

  // Release status
  'release.ongoing': 'Ongoing',
  'release.finished': 'Finished',

  // Type enum
  'type.anime': 'Anime',
  'type.movie': 'Movie',
  'type.tv': 'TV',
  'type.manga': 'Manga',
  'type.novel': 'Novel',
  'type.other': 'Other',

  // Unit labels — translate the Chinese unit strings the backend returns
  'unit.集': 'ep',
  'unit.章': 'ch',
  'unit.部': '',          // movies: just "watched"
  'unit.单元': 'unit',
  'unit.页': 'pg',
  'unit.话': 'iss',
  'unit.本': 'vol',

  // Creator field labels
  'creator.author': 'Author',
  'creator.studio': 'Studio',
  'creator.director': 'Director',

  // Empty card
  'card.newWork': 'New work',
  'card.notStarted': 'Not started',
  'card.quickRecord': 'Quick record',

  // FAB
  'fab.newWork': 'New work',
  'fab.quickRecord': 'Record progress',

  // Settings
  'settings.title': 'Settings',
  'settings.subtitle': 'Manage tags, favorites and data',
  'settings.tab.tags': 'Tags',
  'settings.tab.collections': 'Favorites',
  'settings.tab.data': 'Data',
  'settings.tab.about': 'About',
  'settings.tab.appearance': 'Appearance',
  'settings.tags.new': 'New tag',
  'settings.tags.namePlaceholder': 'Tag name',
  'settings.tags.empty': 'No tags yet',
  'settings.tags.confirmDelete.title': 'Delete tag?',
  'settings.tags.confirmDelete.body': 'Tag "{name}" will be deleted.',
  'settings.tags.confirmDelete.note': 'Linked works are not affected.',
  'settings.tagGroups.title': 'Tag groups',
  'settings.tagGroups.empty': 'No tag groups',
  'settings.tagGroups.new': 'New group',
  'settings.tagGroups.namePlaceholder': 'Group name',
  'settings.tagGroups.defaultBadge': 'Default',
  'settings.tagGroups.maxHint': 'We suggest at most 5 groups',
  'settings.tagGroups.moveUp': 'Move up',
  'settings.tagGroups.moveDown': 'Move down',
  'settings.tagGroups.rename': 'Rename',
  'settings.tagGroups.confirmDelete.title': 'Delete group?',
  'settings.tagGroups.confirmDelete.body': 'Group "{name}" will be deleted.',
  'settings.tagGroups.confirmDelete.note': 'Tags in this group will be moved to the default group.',
  'settings.tagGroups.cantDeleteDefault': 'The default group cannot be deleted',
  'settings.tagGroups.tagsCount': '{count} tags',
  'settings.tagGroups.upgradeBanner': 'Tag groups are now enabled. You can create new groups and organize your tags.',
  'settings.tagGroups.upgradeBannerDismiss': 'Got it',
  'settings.tags.aliases.label': 'Aliases',
  'settings.tags.aliases.placeholder': 'Comma-separated, e.g.: mystery, suspense, whodunit',
  'settings.tags.aliases.hint': 'Aliases are used for search only and won\'t be displayed on the tag',
  'settings.tags.aliases.errorEmpty': 'Alias cannot be empty',
  'settings.tags.aliases.errorDuplicate': 'Alias "{name}" is already used by another tag',
  'settings.tags.aliases.errorSelfDuplicate': 'Duplicate alias: {name}',
  'settings.tags.groupLabel': 'Group',
  'settings.tags.moveToGroup': 'Move to group',
  'tagPicker.searchPlaceholder': 'Search tags...',
  'tagPicker.noMatch': 'No matching tags',
  'tagPicker.noTagsYet': 'No tags yet. Create some in Settings.',
  'tagPicker.searchHint': 'Supports Chinese, English, pinyin, and aliases',
  'tagPicker.clearSearch': 'Clear search',
  'settings.collections.new': 'New favorite',
  'settings.collections.namePlaceholder': 'Favorite name (e.g. Studio Ghibli)',
  'settings.collections.hint': 'Once created, you can add works to a favorite from a work\'s "Edit info" panel.',
  'settings.collections.empty': 'No favorites yet',
  'settings.collections.confirmDelete.title': 'Delete favorite?',
  'settings.collections.confirmDelete.body': 'Favorite "{name}" will be deleted.',
  'settings.data.export.title': 'Export',
  'settings.data.export.desc': 'Export everything for migration or backup',
  'settings.data.export.json': 'Export JSON (with covers)',
  'settings.data.export.csv': 'Export CSV',
  'settings.data.import.title': 'Import',
  'settings.data.import.desc': 'Import a zip downloaded from "Export JSON (with covers)". This overwrites all current data.',
  'settings.data.import.btn': 'Import and overwrite',
  'settings.data.import.done': 'Import done. The page will reload to load the new data.',
  'settings.data.backup.title': 'Database backup',
  'settings.data.backup.desc': 'Auto-backed up daily at 03:00, last 30 are kept. You can also back up manually.',
  'settings.data.backup.btn': 'Back up now',
  'settings.data.backup.empty': 'No backups yet',
  'settings.data.backup.download': 'Download',
  'settings.about.version': 'Version',
  'settings.about.worksCount': 'Works',
  'settings.about.entriesCount': 'Entries',
  'settings.about.dbSize': 'DB size',
  'settings.about.dataDir': 'Data dir',
  'settings.about.privacy': 'This app runs entirely on your own NAS. All data stays in the data directory and is never uploaded.',
  'settings.appearance.language': 'Language',
  'settings.appearance.languageDesc': 'Switch the interface language. Stored on this device.',
  'settings.appearance.languageZh': '简体中文',
  'settings.appearance.languageEn': 'English',
}

const translations = { 'zh-CN': zh, en }

export const SUPPORTED_LOCALES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
]

// =================== zustand store ===================

function detectInitialLocale() {
  // SSR 安全 / SSR safe
  if (typeof navigator === 'undefined') return 'zh-CN'
  const lang = navigator.language || 'zh-CN'
  if (lang.toLowerCase().startsWith('zh')) return 'zh-CN'
  return 'en'
}

export const useLocaleStore = create(
  persist(
    (set) => ({
      locale: detectInitialLocale(),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'works-tracker-locale',
      // 我们只持久化 locale 一个字段
      partialize: (state) => ({ locale: state.locale }),
    },
  ),
)

// =================== 翻译工具 ===================

function interpolate(s, vars) {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`))
}

/**
 * t(key, vars?) → 直接传 locale 由 store 决定
 * 用作 React Hook 形式:const t = useT(); t('nav.home')
 */
export function useT() {
  const locale = useLocaleStore(s => s.locale)
  const dict = translations[locale] || translations['zh-CN']
  // 返回稳定的函数（依赖 locale）
  return (key, vars) => {
    const raw = dict[key]
    if (raw == null) {
      // 找不到时回退到中文,再不行就返回 key 本身
      const fallback = translations['zh-CN'][key]
      return interpolate(fallback ?? key, vars)
    }
    return interpolate(raw, vars)
  }
}

/**
 * 同步 <html lang> 属性,方便浏览器/屏幕阅读器
 */
export function syncHtmlLang(locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
}

// =================== 后端 enum 翻译辅助 ===================
//
// 后端返回的 type/status/release_status/unit_label 都是中文 label。
// 列表/详情里我们改成传 enum value（如 'anime' / 'want' / 'finished' / unit 字符串）
// 给 UI 直接用 t() 翻译即可。

export function translateType(value, t) {
  return t(`type.${value}`)
}

export function translateStatus(value, t) {
  return t(`status.${value}`)
}

export function translateRelease(value, t) {
  return t(`release.${value}`)
}

/**
 * 翻译一个 unit_label（后端固定返回的中文,如 "集"/"章"/"页"）
 * 找不到的 key 直接返回原始 label,这样用户自己起的奇怪单位也不会被替换成空。
 */
export function translateUnit(label, t) {
  if (!label) return label
  const key = `unit.${label}`
  // 检查 zh dict 里是否有这个 key（即:是不是我们已知的 unit）
  if (Object.prototype.hasOwnProperty.call(zh, key)) {
    return t(key)
  }
  return label
}

/**
 * 翻译 creator field 的 label（后端按 key 给 "作者"/"导演"等中文）
 * 优先按 key 查;查不到的话用回原始 label
 */
export function translateCreatorLabel(field, t) {
  if (!field) return ''
  const key = `creator.${field.key}`
  if (Object.prototype.hasOwnProperty.call(zh, key)) {
    return t(key)
  }
  return field.label
}