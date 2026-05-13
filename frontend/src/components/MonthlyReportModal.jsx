import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Star, TrendingUp, Calendar, Trophy, Sparkles, RefreshCw } from 'lucide-react'
import { Modal, Button } from './Modal'
import { api, coverUrl } from '../lib/api'
import { useT, translateType } from '../lib/i18n'

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
            className="text-xs text-ink-500 hover:text-brand-700 inline-flex items-center gap-1 transition-colors"
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
  if (!hasAnyActivity) {
    return (
      <div className="py-12 text-center text-ink-400 text-sm">
        {t('report.empty')}
      </div>
    )
  }
  return (
    <div className="space-y-6">
      {/* A. 顶部大数字 */}
      <StatsRow stats={data.stats} />

      {/* G. 文字总结 (放在上面,给整体一个 narrative 开场) */}
      {data.summary_text && (
        <div className="rounded-lg bg-gradient-to-br from-brand-50 to-paper-50 border border-brand-100 px-4 py-3">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-brand-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-ink-800 leading-relaxed">{data.summary_text}</p>
          </div>
        </div>
      )}

      {/* B + C 并列 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TypeDistribution items={data.type_distribution} />
        <TopTags items={data.top_tags} />
      </div>

      {/* D. 评分洞察 */}
      {data.rating_insight && <RatingInsight insight={data.rating_insight} />}

      {/* E. 月历热力图 */}
      <Heatmap year={data.year} month={data.month} heatmap={data.heatmap} />

      {/* F. 完成的作品 */}
      {data.completed_list.length > 0 && <CompletedList items={data.completed_list} />}
    </div>
  )
}


function StatsRow({ stats }) {
  const t = useT()
  const items = [
    { label: t('report.stats.entries'), value: stats.entries_count, icon: TrendingUp },
    { label: t('report.stats.activeWorks'), value: stats.active_works, icon: Calendar },
    { label: t('report.stats.newWorks'), value: stats.new_works, icon: Sparkles },
    { label: t('report.stats.completedWorks'), value: stats.completed_works, icon: Trophy },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-lg border border-paper-200 bg-white px-3 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-500 mb-1">
            <Icon size={11} />
            <span>{label}</span>
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{value}</div>
        </div>
      ))}
    </div>
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
          <div key={type} className="flex items-center gap-2 text-xs">
            <span className="w-14 text-ink-700 flex-shrink-0">{translateType(type, t)}</span>
            <div className="flex-1 bg-paper-100 rounded h-4 overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-ink-600 tabular-nums">{count}</span>
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
            className="flex items-center gap-2 text-xs hover:bg-paper-50 -mx-1 px-1 py-0.5 rounded transition-colors"
          >
            <span className="w-16 text-ink-700 flex-shrink-0 truncate" title={tag_name}>{tag_name}</span>
            <div className="flex-1 bg-paper-100 rounded h-4 overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-ink-600 tabular-nums">{count}</span>
          </Link>
        ))}
      </div>
    </SectionCard>
  )
}


function RatingInsight({ insight }) {
  const t = useT()
  return (
    <SectionCard title={t('report.ratingInsight')}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] text-ink-500 mb-1">{t('report.ratedCount')}</div>
          <div className="text-lg font-semibold tabular-nums">{insight.rated_count}</div>
        </div>
        <div>
          <div className="text-[10px] text-ink-500 mb-1">{t('report.averageRating')}</div>
          <div className="text-lg font-semibold tabular-nums text-amber-700 flex items-center justify-center gap-0.5">
            <Star size={13} className="fill-amber-400 text-amber-400" />
            {insight.average}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-ink-500 mb-1">{t('report.highest')}</div>
          <Link
            to={`/works/${insight.highest.work_id}`}
            className="text-xs font-medium hover:text-brand-700 transition-colors block truncate"
            title={insight.highest.title}
          >
            {insight.highest.title}
            <span className="text-amber-700 ml-1 tabular-nums">{insight.highest.rating}</span>
          </Link>
        </div>
      </div>
    </SectionCard>
  )
}


function Heatmap({ year, month, heatmap }) {
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
    cells.push({ day: d, count: heatmap[dateStr] || 0 })
  }
  // 补齐到 7 的倍数
  while (cells.length % 7) cells.push(null)

  const weekHeads = [t('report.mon'), t('report.tue'), t('report.wed'), t('report.thu'), t('report.fri'), t('report.sat'), t('report.sun')]

  return (
    <SectionCard title={t('report.heatmap')}>
      <div className="grid grid-cols-7 gap-1 text-[10px]">
        {weekHeads.map(h => (
          <div key={h} className="text-center text-ink-400">{h}</div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            className={`aspect-square rounded ${c ? colorFor(c.count) : 'bg-transparent'} flex items-center justify-center`}
            title={c ? `${year}-${month}-${c.day}: ${c.count}` : ''}
          >
            {c && (
              <span className={`text-[9px] ${c.count > 4 ? 'text-white' : 'text-ink-500'}`}>
                {c.day}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-400 justify-end">
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


function CompletedList({ items }) {
  const t = useT()
  return (
    <SectionCard title={t('report.completed', { n: items.length })}>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {items.slice(0, 12).map(w => (
          <Link key={w.work_id} to={`/works/${w.work_id}`} className="block group">
            <div className="aspect-[3/4] rounded-md bg-paper-100 overflow-hidden border border-paper-200 group-hover:border-brand-400 transition-colors">
              {w.cover_thumb_path ? (
                <img src={coverUrl(w.cover_thumb_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-300 text-xl">📺</div>
              )}
            </div>
            <div className="text-[11px] mt-1 line-clamp-2 group-hover:text-brand-700 transition-colors">{w.title}</div>
            {w.rating != null && (
              <div className="text-[10px] text-amber-700 mt-0.5 inline-flex items-center gap-0.5 tabular-nums">
                <Star size={9} className="fill-amber-400 text-amber-400" />
                {Number(w.rating).toFixed(1)}
              </div>
            )}
          </Link>
        ))}
      </div>
      {items.length > 12 && (
        <div className="text-[10px] text-ink-400 mt-2 text-center">
          {t('report.completedAndMore', { n: items.length - 12 })}
        </div>
      )}
    </SectionCard>
  )
}


function SectionCard({ title, children }) {
  return (
    <div className="rounded-lg border border-paper-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider mb-2.5">
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
