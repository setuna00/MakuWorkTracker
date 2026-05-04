import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { relativeDate } from '../lib/format'
import { WorkCard } from '../components/WorkCard'
import { QuickRecordModal } from '../components/QuickRecordModal'

export default function HomePage() {
  const [recordingWork, setRecordingWork] = useState(null)
  const [recommendSeed, setRecommendSeed] = useState(0)

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })

  const { data: watching = [] } = useQuery({
    queryKey: ['works', { personal_status: 'watching' }],
    queryFn: () => api.listWorks({ personal_status: 'watching' }),
  })
  const { data: wantList = [] } = useQuery({
    queryKey: ['works', { personal_status: 'want' }],
    queryFn: () => api.listWorks({ personal_status: 'want' }),
  })

  const recommendations = useMemo(() => {
    if (!wantList.length) return []
    const shuffled = [...wantList].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantList, recommendSeed])

  const now = new Date()
  const { data: monthly } = useQuery({
    queryKey: ['monthly-overview', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => api.getMonthlyOverview(now.getFullYear(), now.getMonth() + 1),
  })

  const { data: recent } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => api.getRecentActivity(7, 10),
  })

  const { data: workForRecord } = useQuery({
    queryKey: ['work', recordingWork?.id],
    queryFn: () => api.getWork(recordingWork.id),
    enabled: !!recordingWork,
  })

  const getUnitLabel = (type) =>
    typesMeta.types?.find(t => t.value === type)?.unit_label || '集'

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      <Section
        title={`在看中 · ${watching.length}`}
        action={
          <Link to="/library?personal_status=watching"
                className="text-[12px] text-brand-600 hover:text-brand-700 flex items-center gap-1">
            查看全部 <ArrowRight size={12} />
          </Link>
        }>
        {watching.length === 0 ? (
          <EmptyHint text="还没有在看的作品" />
        ) : (
          <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-2 -mx-2 px-2">
            {watching.map(w => (
              <WorkCard key={w.id} work={w} mainWatching={null}
                        size="lg"
                        onQuickAdd={() => setRecordingWork(w)}
                        unitLabel={getUnitLabel(w.type)} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="想看推荐"
        action={
          <button onClick={() => setRecommendSeed(s => s + 1)}
                  className="text-[12px] text-ink-500 hover:text-brand-600 flex items-center gap-1 transition-colors">
            <RefreshCw size={12} /> 换一批
          </button>
        }>
        {recommendations.length === 0 ? (
          <EmptyHint text='标记为"想看"后会出现在这里' />
        ) : (
          <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-2 -mx-2 px-2">
            {recommendations.map(w => (
              <WorkCard key={w.id} work={w} mainWatching={null}
                        size="lg"
                        unitLabel={getUnitLabel(w.type)} />
            ))}
          </div>
        )}
      </Section>

      <Section title="本月概览">
        <div className="card p-6">
          <div className="grid grid-cols-3 divide-x divide-paper-200">
            <StatBlock label="本月记录" value={monthly?.entries_count ?? '-'} unit="条" />
            <StatBlock label="活跃作品" value={monthly?.active_works ?? '-'} unit="部" />
            <StatBlock label="本月新开" value={monthly?.new_works ?? '-'} unit="部" />
          </div>
        </div>
      </Section>

      <Section title="最近动态">
        {(!recent || recent.days?.length === 0) ? (
          <EmptyHint text="还没有进度记录" />
        ) : (
          <div className="card p-5">
            <div className="border-l-2 border-paper-200 ml-1.5 pl-5 space-y-4">
              {recent.days.flatMap(day =>
                day.items.map((item, i) => (
                  <div key={`${day.date}-${item.watching_id}-${i}`} className="relative">
                    <div className="absolute -left-[26px] top-1 w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white" />
                    <div className="text-[11px] text-ink-400 mb-0.5">{relativeDate(day.date)}</div>
                    <Link to={`/works/${item.work_id}`}
                          className="block text-[14px] hover:text-brand-700 font-medium transition-colors">
                      {item.work_title}
                      {item.range_start != null && (
                        <span className="text-ink-500 font-normal ml-1.5 text-[13px]">
                          · 第 {item.range_start === item.range_end
                            ? item.range_start
                            : `${item.range_start}-${item.range_end}`} {getUnitLabel(item.work_type)}
                        </span>
                      )}
                      {item.show_round && (
                        <span className="ml-2 text-[10px] text-ink-400 font-normal">
                          ({item.round_label || `第 ${item.round_number} 周目`})
                        </span>
                      )}
                    </Link>
                    {item.notes.length > 0 && (
                      <div className="text-xs text-ink-500 mt-1 italic line-clamp-2">
                        "{item.notes[0]}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
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

function StatBlock({ label, value, unit }) {
  return (
    <div className="px-4 first:pl-0 last:pr-0">
      <div className="text-xs text-ink-500 mb-1.5">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums text-brand-600">{value}</span>
        <span className="text-xs text-ink-500">{unit}</span>
      </div>
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
