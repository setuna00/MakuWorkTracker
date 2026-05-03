import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, coverUrl } from '../lib/api'
import { relativeDate } from '../lib/format'

export default function TimelinePage() {
  const [filterType, setFilterType] = useState('')

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })

  const { data: timeline } = useQuery({
    queryKey: ['timeline', { type: filterType }],
    queryFn: () => api.getTimeline({ type: filterType, limit: 500 }),
  })

  const getUnitLabel = (type) =>
    typesMeta.types?.find(t => t.value === type)?.unit_label || '集'

  return (
    <div className="max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-semibold mb-1">时间轴</h1>
      <div className="text-sm text-ink-500 mb-5">所有进度记录按时间排列</div>

      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto scrollbar-hide">
        <FilterTab active={!filterType} onClick={() => setFilterType('')}>全部</FilterTab>
        {typesMeta.types.map(t => (
          <FilterTab key={t.value} active={filterType === t.value}
                     onClick={() => setFilterType(t.value)}>
            {t.label}
          </FilterTab>
        ))}
      </div>

      {(!timeline || timeline.days.length === 0) ? (
        <div className="text-center py-16 text-ink-400 text-sm border border-dashed border-paper-200 rounded-lg">
          还没有进度记录
        </div>
      ) : (
        <div className="space-y-8">
          {timeline.days.map(day => (
            <div key={day.date}>
              <div className="sticky top-12 bg-paper-50 z-[1] py-2 mb-3 -mx-2 px-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-base font-semibold text-ink-900">{relativeDate(day.date)}</span>
                  <span className="text-sm text-ink-400">{day.date}</span>
                  <span className="text-xs text-ink-400 ml-auto">{day.items.length} 条记录</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {day.items.map((item, i) => (
                  <Link key={`${day.date}-${item.watching_id}-${i}`}
                        to={`/works/${item.work_id}`}
                        className="card p-3 flex gap-3 hover:border-brand-400 hover:shadow-cardHover transition-all group">
                    {item.work_cover_thumb && (
                      <img src={coverUrl(item.work_cover_thumb)}
                           className="w-14 h-[75px] object-cover rounded flex-shrink-0"
                           alt={item.work_title} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold leading-tight group-hover:text-brand-700 transition-colors line-clamp-2">
                        {item.work_title}
                      </div>
                      {item.show_round && (
                        <div className="text-[10px] text-ink-400 mt-0.5">
                          {item.round_label || `第 ${item.round_number} 周目`}
                        </div>
                      )}
                      {item.range_start != null && (
                        <div className="text-xs text-brand-600 font-medium mt-1.5">
                          第 {item.range_start === item.range_end
                            ? item.range_start
                            : `${item.range_start}-${item.range_end}`} {getUnitLabel(item.work_type)}
                          {item.entry_ids.length > 1 && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded font-normal">
                              合并 {item.entry_ids.length}
                            </span>
                          )}
                        </div>
                      )}
                      {item.notes.length > 0 && (
                        <div className="text-xs text-ink-500 italic mt-1.5 line-clamp-2">
                          "{item.notes[0]}"
                          {item.notes.length > 1 && (
                            <span className="text-ink-400 not-italic"> +{item.notes.length - 1}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterTab({ active, children, onClick }) {
  return (
    <button onClick={onClick}
            className={`px-3.5 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
              active
                ? 'bg-brand-600 text-white'
                : 'text-ink-700 hover:bg-paper-100 border border-paper-200'
            }`}>
      {children}
    </button>
  )
}
