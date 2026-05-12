import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { relativeDate, formatRange } from '../lib/format'
import { useT, translateUnit } from '../lib/i18n'
import { WorkCard } from '../components/WorkCard'
import { QuickRecordModal } from '../components/QuickRecordModal'

export default function HomePage() {
  const t = useT()
  const [recordingWork, setRecordingWork] = useState(null)
  const [recommendSeed, setRecommendSeed] = useState(() => Math.floor(Math.random() * 1_000_000))

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })

  const { data: watchingRaw = [] } = useQuery({
    queryKey: ['works', { personal_status: 'watching', sort: 'last_progress' }],
    queryFn: () => api.listWorks({ personal_status: 'watching', sort: 'last_progress', order: 'desc' }),
  })

  // 把 watching 切成两组：
  // - 真正在看的（cur < total，或没填 total）
  // - 等待更新的（连载中 + 已追平 total）
  //
  // 完结作品满进度的情况由后端自动转成 done，不会出现在这个 query 里，所以这里不处理。
  const { watching, caughtUp } = useMemo(() => {
    const onTrack = []
    const waiting = []
    for (const w of watchingRaw) {
      const total = w.total_units
      const cur = w.main_watching?.current_progress
      const isOngoing = w.release_status === 'ongoing'
      if (isOngoing && total != null && cur != null && cur >= total) {
        waiting.push(w)
      } else {
        onTrack.push(w)
      }
    }
    return { watching: onTrack, caughtUp: waiting }
  }, [watchingRaw])
  
  const { data: recommendations = [] } = useQuery({
    queryKey: ['recommendations', recommendSeed],
    queryFn: () => api.getRecommendations(7, recommendSeed),
  })

  const now = new Date()
  const { data: monthly } = useQuery({
    queryKey: ['monthly-overview', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => api.getMonthlyOverview(now.getFullYear(), now.getMonth() + 1),
  })

  const { data: recent } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => api.getRecentActivity(7, 10),
  })

  const monthQuery = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const { data: workForRecord } = useQuery({
    queryKey: ['work', recordingWork?.id],
    queryFn: () => api.getWork(recordingWork.id),
    enabled: !!recordingWork,
  })

  // 兼容两种入参:work 对象(优先 work.unit_label)或 timeline item(优先 work_unit_label)
  const getUnitLabel = (workOrItem) => {
    let raw
    if (workOrItem?.unit_label) raw = workOrItem.unit_label
    else if (workOrItem?.work_unit_label) raw = workOrItem.work_unit_label
    else {
      const ty = workOrItem?.type ?? workOrItem?.work_type
      raw = typesMeta.types?.find(x => x.value === ty)?.unit_label || '集'
    }
    return translateUnit(raw, t)
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      <Section title={t('home.monthlyOverview')}>
        <div className="card p-6">
          <div className="grid grid-cols-3 divide-x divide-paper-200">
            <StatBlock label={t('home.stat.entries')} value={monthly?.entries_count ?? '-'} unit={t('home.stat.unitEntries')} />
            <StatBlock label={t('home.stat.activeWorks')} value={monthly?.active_works ?? '-'} unit={t('home.stat.unitWorks')} href={`/library?active=${monthQuery}`} />
            <StatBlock label={t('home.stat.newWorks')} value={monthly?.new_works ?? '-'} unit={t('home.stat.unitWorks')} href={`/library?new=${monthQuery}`} />
          </div>
        </div>
      </Section>

      <Section
        title={t('home.watching', { count: watching.length })}
        action={
          <Link to="/library?personal_status=watching"
                className="text-[12px] text-brand-600 hover:text-brand-700 flex items-center gap-1">
            {t('home.viewAll')} <ArrowRight size={12} />
          </Link>
        }>
        {watching.length === 0 ? (
          <EmptyHint text={t('home.watchingEmpty')} />
        ) : (
          <div className="flex md:flex-wrap gap-4 overflow-x-auto md:overflow-visible scrollbar-thin pb-2 -mx-2 px-2">
            {watching.map(w => (
              <WorkCard key={w.id} work={w} mainWatching={w.main_watching}
                        size="lg"
                        onQuickAdd={() => setRecordingWork(w)}
                        unitLabel={getUnitLabel(w)} />
            ))}
          </div>
        )}
      </Section>

      {caughtUp.length > 0 && (
        <Section title={t('home.caughtUp', { count: caughtUp.length })}>
          <div className="flex md:flex-wrap gap-4 overflow-x-auto md:overflow-visible scrollbar-thin pb-2 -mx-2 px-2">
            {caughtUp.map(w => (
              <WorkCard key={w.id} work={w} mainWatching={w.main_watching}
                        size="lg"
                        onQuickAdd={() => setRecordingWork(w)}
                        unitLabel={getUnitLabel(w)} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title={t('home.recommend')}
        action={
          <button onClick={() => setRecommendSeed(Math.floor(Math.random() * 1_000_000))}
                  className="text-[12px] text-ink-500 hover:text-brand-600 flex items-center gap-1 transition-colors">
            <RefreshCw size={12} /> {t('home.recommendShuffle')}
          </button>
        }>
        {recommendations.length === 0 ? (
          <EmptyHint text={t('home.recommendEmpty')} />
        ) : (
          <div className="flex md:flex-wrap gap-4 overflow-x-auto md:overflow-visible scrollbar-thin pb-2 -mx-2 px-2">
            {recommendations.map(w => (
              <WorkCard key={w.id} work={w} mainWatching={w.main_watching}
                        size="lg"
                        unitLabel={getUnitLabel(w)} />
            ))}
          </div>
        )}
      </Section>



      <Section title={t('home.recentActivity')}>
        {(() => {
          // 先平铺成 (day, item) 列表;前端兜底过滤掉补录(后端已过滤,这里防御性二次过滤)
          const RECENT_MAX = 10
          const flat = (recent?.days || []).flatMap(day =>
            day.items
              .filter(item => !item.is_backfill)
              .map(item => ({ day, item }))
          )
          const visible = flat.slice(0, RECENT_MAX)
          const hasMore = flat.length > RECENT_MAX

          if (visible.length === 0) {
            return <EmptyHint text={t('home.entriesEmpty')} />
          }
          return (
            <div className="card p-5">
              <div className="border-l-2 border-paper-200 ml-1.5 pl-5 space-y-4">
                {visible.map(({ day, item }, i) => (
                  <div key={`${day.date}-${item.watching_id}-${i}`} className="relative">
                    <div className="absolute -left-[26px] top-1 w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white" />
                    <div className="text-[11px] text-ink-400 mb-0.5">{relativeDate(day.date)}</div>
                    <Link to={`/works/${item.work_id}`}
                          className="block text-[14px] hover:text-brand-700 font-medium transition-colors">
                      {item.work_title}
                      {item.range_start != null && (
                        <span className="text-ink-500 font-normal ml-1.5 text-[13px]">
                          · {formatRange(item.range_start, item.range_end, getUnitLabel(item))}
                        </span>
                      )}
                      {item.show_round && (
                        <span className="ml-2 text-[10px] text-ink-400 font-normal">
                          ({item.round_label || t('workDetail.round', { n: item.round_number })})
                        </span>
                      )}
                    </Link>
                    {item.notes.length > 0 && (
                      <div className="text-xs text-ink-500 mt-1 italic line-clamp-2">
                        "{item.notes[0]}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {hasMore && (
                <div className="mt-4 pt-3 border-t border-paper-100 text-center">
                  <Link to="/timeline" className="text-[12px] text-brand-600 hover:text-brand-700">
                    {t('home.recentMore')}
                  </Link>
                </div>
              )}
            </div>
          )
        })()}
      </Section>

      {recordingWork && workForRecord && (
        <QuickRecordModal
          work={workForRecord}
          watching={workForRecord.watchings.find(w => w.round_number === 1)}
          onClose={() => setRecordingWork(null)}
          typesMeta={typesMeta.types}
        />
      )}
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-xl font-semibold text-ink-800 tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function StatBlock({ label, value, unit, href }) {
  const inner = (
    <>
      <div className="text-xs text-ink-500 mb-1.5">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums text-brand-600">{value}</span>
        {unit && <span className="text-xs text-ink-500">{unit}</span>}
      </div>
    </>
  )
  if (href) {
    return (
      <Link to={href}
            className="px-4 first:pl-0 last:pr-0 block hover:bg-paper-50 rounded transition-colors -my-1 py-1">
        {inner}
      </Link>
    )
  }
  return (
    <div className="px-4 first:pl-0 last:pr-0">
      {inner}
    </div>
  )
}

function EmptyHint({ text }) {
  return (
    <div className="text-xs text-ink-400 py-8 text-center bg-paper-50 border border-dashed border-paper-200 rounded-lg">
      {text}
    </div>
  )
}