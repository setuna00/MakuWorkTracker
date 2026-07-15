import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Star, TrendingUp, Calendar, Trophy, Sparkles, RefreshCw,
  Activity, Flame, BookOpen,
} from 'lucide-react'
import { Modal, Button } from './Modal'
import { api, coverUrl } from '../lib/api'
import { useT, translateType, translateStatus } from '../lib/i18n'

/**
 * 月度报告 Modal。
 *
 * 渲染 7 个模块: A 顶部数字 / B 类型分布 / C 高频 tag / D 评分洞察 /
 * E 月历热力图 / F 完成的作品列表 / G 文字总结
 */
export function MonthlyReportModal({ year, month, open, onClose, onRegenerate }) {
  const t = useT()
  const { data, isLoading, error } = useQuery({
    queryKey: ['monthlyReport', year, month],
    queryFn: () => api.getMonthlyReport(year, month),
    enabled: open,
  })

  const title = t('report.title', { year, month })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <div className="flex items-center justify-between">
          <button
            onClick={onRegenerate}
            className="text-sm text-ink-600 hover:text-brand-700 inline-flex items-center gap-1.5 transition-colors"
            title={t('report.regenerateTip')}
          >
            <RefreshCw size={12} /> {t('report.regenerate')}
          </button>
          <Button variant="primary" onClick={onClose}>{t('common.close')}</Button>
        </div>
      }
    >
      {isLoading && <div className="text-sm text-ink-400 py-8 text-center">{t('common.loading')}</div>}
      {error && <div className="text-sm text-red-600 py-8 text-center">{t('common.loadFailed')}</div>}
      {data && <ReportContent data={data} />}
    </Modal>
  )
}


function ReportContent({ data }) {
  const t = useT()
  const hasAnyActivity = data.stats.entries_count > 0
  const activeDays = data.stats.active_days ?? Object.keys(data.heatmap || {}).length
  const activityInsight = data.activity_insight || {
    active_days: activeDays,
    longest_streak: 0,
    busiest_day: null,
  }
  const ranking = data.work_ranking || []
  const summaryLead = t('report.summary.lead', {
    days: activeDays,
    entries: data.stats.entries_count,
    works: data.stats.active_works,
  })
  const summaryHighlight = ranking.length
    ? t('report.summary.topWork', {
        title: ranking[0].title,
        days: ranking[0].active_days,
      })
    : ''
  if (!hasAnyActivity) {
    return (
      <div className="py-12 text-center text-ink-400 text-sm">
        {t('report.empty')}
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <StatsRow
        stats={{ ...data.stats, active_days: activeDays }}
        comparison={data.comparison}
      />

      <div className="rounded-xl bg-gradient-to-br from-brand-50 to-paper-50 border border-brand-100 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <Sparkles size={18} className="text-brand-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm sm:text-[15px] text-ink-800 leading-7">
            {summaryLead}{summaryHighlight && <> {summaryHighlight}</>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ActivityOverview insight={activityInsight} stats={data.stats} />
        <Consumption items={data.consumption || []} />
      </div>

      {ranking.length > 0 && <WorkRanking items={ranking} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TypeDistribution items={data.type_distribution || []} />
        <TopTags items={data.top_tags || []} />
      </div>

      {data.rating_insight && <RatingInsight insight={data.rating_insight} />}

      <Heatmap
        year={data.year}
        month={data.month}
        heatmap={data.heatmap || {}}
        dailyActivity={data.daily_activity || {}}
      />

      {((data.completed_list || []).length + (data.caught_up_list || []).length) > 0 && (
        <CompletedList
          completedItems={data.completed_list || []}
          caughtUpItems={data.caught_up_list || []}
        />
      )}
    </div>
  )
}


function StatsRow({ stats, comparison }) {
  const t = useT()
  const items = [
    { key: 'active_days', label: t('report.stats.activeDays'), value: stats.active_days, icon: Calendar },
    { key: 'active_works', label: t('report.stats.activeWorks'), value: stats.active_works, icon: BookOpen },
    { key: 'new_works', label: t('report.stats.newWorks'), value: stats.new_works, icon: Sparkles },
    { key: 'completed_works', label: t('report.stats.completedWorks'), value: stats.completed_works, icon: Trophy },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {items.map(({ key, label, value, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-paper-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-ink-600 mb-1.5">
            <Icon size={14} />
            <span>{label}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-ink-900 tabular-nums leading-tight">{value}</div>
          {comparison?.has_activity && (
            <div className="text-xs text-ink-500 mt-1.5 tabular-nums">
              {t('report.comparison', {
                value: comparison.delta?.[key] > 0
                  ? `+${comparison.delta[key]}`
                  : comparison.delta?.[key] ?? 0,
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}


function ActivityOverview({ insight, stats }) {
  const t = useT()
  const busiest = insight.busiest_day
  return (
    <SectionCard title={t('report.activityOverview')}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
        <InsightNumber icon={Activity} label={t('report.stats.entries')} value={stats.entries_count} />
        <InsightNumber
          icon={Flame}
          label={t('report.longestStreak')}
          value={insight.longest_streak}
          unit={t('report.unit.days')}
        />
        <InsightNumber
          icon={TrendingUp}
          label={t('report.busiestDay')}
          value={busiest?.date ? busiest.date.slice(5).replace('-', '/') : '—'}
          sub={busiest ? t('report.entriesShort', { n: busiest.entries }) : ''}
          className="col-span-2 sm:col-span-1"
        />
      </div>
    </SectionCard>
  )
}


function InsightNumber({ icon: Icon, label, value, unit, sub, className = '' }) {
  return (
    <div className={`rounded-lg bg-paper-50 px-2.5 py-3.5 sm:px-3 min-w-0 ${className}`}>
      <div className="text-[11px] sm:text-xs text-ink-600 flex items-center justify-center gap-1.5 mb-1.5">
        <Icon size={12} /> {label}
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-ink-900 tabular-nums truncate leading-tight">
        {value}{unit && <span className="text-xs font-normal text-ink-500 ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] sm:text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  )
}


function reportUnit(item, t) {
  return item.unit_label || t(`report.unit.${item.type}`)
}


function Consumption({ items }) {
  const t = useT()
  return (
    <SectionCard title={t('report.consumption')}>
      {items.length === 0 ? (
        <div className="text-xs text-ink-400 py-2">{t('report.noConsumption')}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map(item => (
            <div
              key={`${item.type}-${item.unit_label || 'default'}`}
              className="rounded-lg border border-paper-100 bg-paper-50 px-3.5 py-3.5 sm:px-4"
            >
              <div className="text-xs sm:text-sm text-ink-600">{translateType(item.type, t)}</div>
              <div className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900 tabular-nums leading-tight">
                {item.count}
                <span className="text-xs sm:text-sm font-normal text-ink-600 ml-1">{reportUnit(item, t)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}


function WorkRanking({ items }) {
  const t = useT()
  return (
    <SectionCard title={t('report.workRanking')}>
      <div className="text-xs sm:text-sm text-ink-500 -mt-1 mb-3.5">
        {t('report.workRankingBasis')}
      </div>
      <div className="divide-y divide-paper-100">
        {items.slice(0, 5).map((item, index) => (
          <Link
            key={item.work_id}
            to={`/works/${item.work_id}`}
            className="flex items-stretch gap-3 sm:gap-4 py-4 first:pt-0 last:pb-0 group"
          >
            <div className="w-5 sm:w-6 pt-1 text-lg font-semibold text-ink-400 tabular-nums flex-shrink-0">{index + 1}</div>
            <div className="w-16 sm:w-[72px] aspect-[3/4] rounded-lg bg-paper-100 border border-paper-200 overflow-hidden flex-shrink-0 group-hover:border-brand-400 transition-colors">
              {item.cover_thumb_path ? (
                <img src={coverUrl(item.cover_thumb_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-300"><BookOpen size={20} /></div>
              )}
            </div>
            <div className="min-w-0 flex-1 flex flex-col py-0.5">
              <div className="text-[15px] sm:text-base font-semibold text-ink-900 leading-snug line-clamp-2 group-hover:text-brand-700 transition-colors">
                {item.title}
              </div>
              <div className="text-xs sm:text-sm text-ink-500 mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span>{translateType(item.type, t)}</span>
                {item.status && <span>{translateStatus(item.status, t)}</span>}
                <span>{t('report.activeDaysShort', { n: item.active_days })}</span>
                <span>{t('report.entriesShort', { n: item.entries_count })}</span>
              </div>
              <div className="mt-auto pt-2 flex items-end justify-between gap-3">
                <div className="text-base sm:text-lg font-semibold text-brand-700 tabular-nums">
                  {item.consumed_count}
                  <span className="text-xs sm:text-sm font-normal ml-1">{reportUnit(item, t)}</span>
                </div>
                {item.progress_start != null && item.progress_end != null && (
                  <div className="text-xs sm:text-sm text-ink-500 tabular-nums">
                    {item.progress_start}–{item.progress_end}
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {items.length > 5 && (
        <div className="text-xs text-ink-500 mt-3 text-center">
          {t('report.workRankingMore', { n: items.length - 5 })}
        </div>
      )}
    </SectionCard>
  )
}


function TypeDistribution({ items }) {
  const t = useT()
  if (!items.length) return null
  const max = Math.max(...items.map(i => i.count), 1)
  return (
    <SectionCard title={t('report.typeDistribution')}>
      <div className="space-y-1.5">
        {items.map(({ type, count }) => (
          <div key={type} className="flex items-center gap-3 text-xs sm:text-sm">
            <span className="w-16 sm:w-20 text-ink-700 flex-shrink-0">{translateType(type, t)}</span>
            <div className="flex-1 bg-paper-100 rounded h-5 overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-7 text-right text-ink-700 tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}


function TopTags({ items }) {
  const t = useT()
  if (!items.length) {
    return (
      <SectionCard title={t('report.topTags')}>
        <div className="text-xs text-ink-400 py-2">{t('report.noTags')}</div>
      </SectionCard>
    )
  }
  const max = Math.max(...items.map(i => i.count), 1)
  return (
    <SectionCard title={t('report.topTags')}>
      <div className="space-y-1.5">
        {items.map(({ tag_id, tag_name, count }) => (
          <Link
            key={tag_id}
            to={`/library?tag=${tag_id}`}
            className="flex items-center gap-3 text-xs sm:text-sm hover:bg-paper-50 -mx-1 px-1 py-1 rounded transition-colors"
          >
            <span className="w-16 sm:w-20 text-ink-700 flex-shrink-0 truncate" title={tag_name}>{tag_name}</span>
            <div className="flex-1 bg-paper-100 rounded h-5 overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-7 text-right text-ink-700 tabular-nums">{count}</span>
          </Link>
        ))}
      </div>
    </SectionCard>
  )
}


function RatingInsight({ insight }) {
  const t = useT()
  const highestCover = insight.highest.cover_path || insight.highest.cover_thumb_path
  return (
    <SectionCard title={t('report.ratingInsight')}>
      <div className="text-xs sm:text-sm text-ink-500 -mt-1 mb-3.5">
        {t('report.ratingBasis')}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-[minmax(120px,0.7fr)_minmax(140px,0.8fr)_minmax(320px,2fr)] gap-3 sm:gap-4">
        <div className="rounded-lg bg-paper-50 px-3 py-4 text-center flex flex-col justify-center">
          <div className="text-xs sm:text-sm text-ink-600 mb-1.5">{t('report.ratedCount')}</div>
          <div className="text-2xl sm:text-3xl font-semibold tabular-nums">{insight.rated_count}</div>
        </div>
        <div className="rounded-lg bg-paper-50 px-3 py-4 text-center flex flex-col justify-center">
          <div className="text-xs sm:text-sm text-ink-600 mb-1.5">{t('report.averageRating')}</div>
          <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-amber-700 flex items-center justify-center gap-1.5">
            <Star size={18} className="fill-amber-400 text-amber-400" />
            {insight.average}
          </div>
        </div>
        <Link
          to={`/works/${insight.highest.work_id}`}
          className="col-span-2 sm:col-span-1 rounded-lg border border-paper-200 bg-paper-50 p-3 flex items-center gap-4 group hover:border-brand-300 transition-colors min-w-0"
        >
          <div className="w-20 sm:w-24 aspect-[3/4] rounded-lg bg-paper-100 border border-paper-200 overflow-hidden flex-shrink-0">
            {highestCover ? (
              <img src={coverUrl(highestCover)} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-ink-300"><BookOpen size={24} /></div>
            )}
          </div>
          <div className="min-w-0 text-left">
            <div className="text-xs sm:text-sm text-ink-600 mb-1.5">{t('report.highest')}</div>
            <div className="text-base sm:text-lg font-semibold text-ink-900 leading-snug line-clamp-2 group-hover:text-brand-700">
              {insight.highest.title}
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-semibold text-amber-700 inline-flex items-center gap-1.5 tabular-nums">
              <Star size={16} className="fill-amber-400 text-amber-400" />
              {Number(insight.highest.rating).toFixed(1)}
            </div>
          </div>
        </Link>
      </div>
    </SectionCard>
  )
}


function Heatmap({ year, month, heatmap, dailyActivity }) {
  const t = useT()
  // 月历:周一为头一列。先算月份第一天是周几(0=周日, 1=周一 ...)
  const firstDay = new Date(year, month - 1, 1)
  // Date.getDay(): 0=周日 .. 6=周六。我们要转成 0=周一 .. 6=周日
  const firstWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()

  // 计算颜色等级:0 / 1-2 / 3-4 / 5-9 / 10+
  const colorFor = (n) => {
    if (!n) return 'bg-paper-100'
    if (n <= 2) return 'bg-brand-200'
    if (n <= 4) return 'bg-brand-400'
    if (n <= 9) return 'bg-brand-500'
    return 'bg-brand-700'
  }

  const cells = []
  // 月初前的占位
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      day: d,
      dateStr,
      count: heatmap[dateStr] || 0,
      ...(dailyActivity[dateStr] || {}),
    })
  }
  // 补齐到 7 的倍数
  while (cells.length % 7) cells.push(null)

  const weekHeads = [t('report.mon'), t('report.tue'), t('report.wed'), t('report.thu'), t('report.fri'), t('report.sat'), t('report.sun')]

  return (
    <SectionCard title={t('report.heatmap')}>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-xs sm:text-sm">
        {weekHeads.map(h => (
          <div key={h} className="text-center text-ink-500 font-medium py-1">{h}</div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            className={`aspect-square rounded ${c ? colorFor(c.count) : 'bg-transparent'} flex items-center justify-center`}
            title={c ? t('report.heatmapDay', {
              date: c.dateStr,
              entries: c.entries ?? c.count,
              works: c.works ?? 0,
              consumed: c.consumed ?? c.count,
            }) : ''}
          >
            {c && (
              <span className={`text-[11px] sm:text-sm font-medium ${c.count > 4 ? 'text-white' : 'text-ink-600'}`}>
                {c.day}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-500 justify-end">
        <span>{t('report.heatmapLegend')}</span>
        <span className="w-3 h-3 rounded bg-paper-100" />
        <span className="w-3 h-3 rounded bg-brand-200" />
        <span className="w-3 h-3 rounded bg-brand-400" />
        <span className="w-3 h-3 rounded bg-brand-500" />
        <span className="w-3 h-3 rounded bg-brand-700" />
      </div>
    </SectionCard>
  )
}


function CompletedList({ completedItems, caughtUpItems }) {
  const t = useT()
  const items = [
    ...completedItems.map(item => ({ ...item, milestone: 'completed', milestoneAt: item.completed_at })),
    ...caughtUpItems.map(item => ({ ...item, milestone: 'caughtUp', milestoneAt: item.caught_up_at })),
  ]
  return (
    <SectionCard title={t('report.milestones', { completed: completedItems.length, caughtUp: caughtUpItems.length })}>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4">
        {items.slice(0, 12).map(w => (
          <Link key={`${w.milestone}-${w.work_id}-${w.round_number || 1}`} to={`/works/${w.work_id}`} className="block group">
            <div className="relative aspect-[3/4] rounded-md bg-paper-100 overflow-hidden border border-paper-200 group-hover:border-brand-400 transition-colors">
              {w.cover_thumb_path ? (
                <img src={coverUrl(w.cover_thumb_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-300"><BookOpen size={24} /></div>
              )}
              <span className={`absolute top-2 left-2 rounded-full px-2 py-1 text-[11px] font-medium text-white shadow-sm ${w.milestone === 'completed' ? 'bg-brand-700' : 'bg-emerald-600'}`}>
                {t(`report.milestone.${w.milestone}`)}
              </span>
            </div>
            <div className="text-xs sm:text-sm font-medium text-ink-900 mt-2 line-clamp-2 group-hover:text-brand-700 transition-colors">{w.title}</div>
            {(w.milestoneAt || w.round_number > 1 || w.round_label) && (
              <div className="text-[11px] sm:text-xs text-ink-500 mt-1">
                {w.milestoneAt?.slice(5).replace('-', '/')}
                {(w.round_number > 1 || w.round_label) && (
                  <span className="ml-1">
                    · {w.round_label || t('report.round', { n: w.round_number })}
                  </span>
                )}
              </div>
            )}
            {w.milestone === 'caughtUp' && w.progress_end != null && (
              <div className="text-[11px] sm:text-xs text-emerald-700 mt-1">
                {t('report.caughtUpProgress', { n: w.progress_end, unit: reportUnit(w, t) })}
              </div>
            )}
            {w.rating != null && (
              <div className="text-xs text-amber-700 mt-1 inline-flex items-center gap-1 tabular-nums">
                <Star size={11} className="fill-amber-400 text-amber-400" />
                {Number(w.rating).toFixed(1)}
              </div>
            )}
            {w.overall_review && (
              <div className="text-[11px] sm:text-xs text-ink-600 italic leading-relaxed mt-1.5 line-clamp-2" title={w.overall_review}>
                “{w.overall_review}”
              </div>
            )}
          </Link>
        ))}
      </div>
      {items.length > 12 && (
        <div className="text-xs text-ink-500 mt-3 text-center">
          {t('report.completedAndMore', { n: items.length - 12 })}
        </div>
      )}
    </SectionCard>
  )
}


function SectionCard({ title, children }) {
  return (
    <div className="rounded-xl border border-paper-200 bg-white px-4 py-4 sm:px-5 sm:py-5">
      <div className="text-[13px] sm:text-sm font-semibold text-ink-700 mb-3.5">
        {title}
      </div>
      {children}
    </div>
  )
}


/**
 * 启动时检测是否该弹"上月报告",自动 prompt 一次。
 * 用户关掉后 localStorage 记一笔,本月不再弹(直到下月 1 号)。
 */
export function ReportPrompt() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(null) // { year, month }

  const { data: prompt } = useQuery({
    queryKey: ['shouldPromptReport'],
    queryFn: () => api.shouldPromptReport(),
    staleTime: 60 * 60 * 1000, // 1h 内不重复问
  })

  useEffect(() => {
    if (!prompt?.should) return
    const dismissKey = `report.dismissed.${prompt.year}-${prompt.month}`
    if (localStorage.getItem(dismissKey)) return
    setPending({ year: prompt.year, month: prompt.month })
    setOpen(true)
  }, [prompt])

  const regenerate = useMutation({
    mutationFn: ({ year, month }) => api.regenerateReport(year, month),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['monthlyReport', vars.year, vars.month] })
    },
  })

  if (!open || !pending) return null
  return (
    <MonthlyReportModal
      open={open}
      year={pending.year}
      month={pending.month}
      onClose={() => {
        localStorage.setItem(`report.dismissed.${pending.year}-${pending.month}`, '1')
        setOpen(false)
      }}
      onRegenerate={() => regenerate.mutate(pending)}
    />
  )
}
