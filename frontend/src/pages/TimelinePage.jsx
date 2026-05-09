import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Edit2, Trash2 } from 'lucide-react'
import { api, coverUrl } from '../lib/api'
import { relativeDate, formatRange } from '../lib/format'
import { useT, translateType, translateUnit } from '../lib/i18n'
import { ConfirmDialog } from '../components/Modal'
import { EditEntryModal } from '../components/EditEntryModal'

function resolveRangePreset(preset) {
  if (!preset || preset === 'all') return null
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayStr = `${yyyy}-${mm}-${dd}`

  if (preset === 'month') {
    const d = new Date(today); d.setMonth(d.getMonth() - 1)
    return { from: toISO(d), to: todayStr }
  }
  if (preset === '3month') {
    const d = new Date(today); d.setMonth(d.getMonth() - 3)
    return { from: toISO(d), to: todayStr }
  }
  if (preset === 'year') {
    return { from: `${yyyy}-01-01`, to: todayStr }
  }
  if (preset.startsWith('year:')) {
    const y = preset.split(':')[1]
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  return null
}

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function TimelinePage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [filterType, setFilterType] = useState('')
  const [rangePreset, setRangePreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [editingEntry, setEditingEntry] = useState(null)
  const [editingHasRange, setEditingHasRange] = useState(true)
  const [editingUnit, setEditingUnit] = useState('集')
  const [confirmDel, setConfirmDel] = useState(null)

  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteEntry(id),
    onSuccess: () => { queryClient.invalidateQueries(); setConfirmDel(null) },
  })

  const beginEdit = async (item) => {
    const id = item.entry_ids[0]
    const entry = await api.getEntry(id)
    const hasRange = typesMeta.types?.find(ty => ty.value === item.work_type)?.has_range_progress ?? true
    setEditingHasRange(hasRange)
    setEditingUnit(getRawUnit(item))
    setEditingEntry(entry)
  }
  const beginDelete = (item) => setConfirmDel({ id: item.entry_ids[0], item })

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })

  let dateRange = null
  if (rangePreset === 'custom') {
    if (customFrom || customTo) {
      dateRange = { from: customFrom || undefined, to: customTo || undefined }
    }
  } else {
    dateRange = resolveRangePreset(rangePreset)
  }

  const { data: timeline } = useQuery({
    queryKey: ['timeline', { type: filterType, range: dateRange }],
    queryFn: () => api.getTimeline({
      type: filterType,
      from: dateRange?.from,
      to: dateRange?.to,
      limit: 500,
    }),
  })

  // 后端原始单位（中文）—— 弹编辑框时给 EditEntryModal 用
  const getRawUnit = (item) => {
    if (item.work_unit_label) return item.work_unit_label
    return typesMeta.types?.find(ty => ty.value === item.work_type)?.unit_label || '集'
  }
  // 显示用单位（已翻译）
  const getDisplayUnit = (item) => translateUnit(getRawUnit(item), t)

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="max-w-[1200px] mx-auto">
      <h1 className="text-2xl font-semibold mb-1">{t('timeline.title')}</h1>
      <div className="text-sm text-ink-500 mb-5">{t('timeline.subtitle')}</div>

      {/* 类型筛选 */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
        <FilterTab active={!filterType} onClick={() => setFilterType('')}>{t('timeline.allTypes')}</FilterTab>
        {typesMeta.types.map(ty => (
          <FilterTab key={ty.value} active={filterType === ty.value}
                     onClick={() => setFilterType(ty.value)}>
            {translateType(ty.value, t)}
          </FilterTab>
        ))}
      </div>

      {/* 时间筛选 */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
        <FilterTab active={rangePreset === 'all'} onClick={() => setRangePreset('all')}>{t('timeline.allTime')}</FilterTab>
        <FilterTab active={rangePreset === 'month'} onClick={() => setRangePreset('month')}>{t('timeline.lastMonth')}</FilterTab>
        <FilterTab active={rangePreset === '3month'} onClick={() => setRangePreset('3month')}>{t('timeline.last3Months')}</FilterTab>
        <FilterTab active={rangePreset === 'year'} onClick={() => setRangePreset('year')}>{t('timeline.thisYear')}</FilterTab>
        {years.slice(1).map(y => (
          <FilterTab key={y} active={rangePreset === `year:${y}`}
                     onClick={() => setRangePreset(`year:${y}`)}>
            {t('timeline.year', { year: y })}
          </FilterTab>
        ))}
        <FilterTab active={rangePreset === 'custom'} onClick={() => setRangePreset('custom')}>{t('timeline.custom')}</FilterTab>
      </div>

      {rangePreset === 'custom' && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-xs text-ink-500">{t('timeline.from')}</span>
          <input type="date" className="input-compact !w-auto"
                 value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <span className="text-xs text-ink-500">{t('timeline.to')}</span>
          <input type="date" className="input-compact !w-auto"
                 value={customTo} onChange={e => setCustomTo(e.target.value)} />
          {(customFrom || customTo) && (
            <button onClick={() => { setCustomFrom(''); setCustomTo('') }}
                    className="text-xs text-ink-500 hover:text-brand-700">
              {t('common.clear')}
            </button>
          )}
        </div>
      )}
      {rangePreset !== 'custom' && <div className="mb-3" />}

      {(!timeline || timeline.days.length === 0) ? (
        <div className="text-center py-16 text-ink-400 text-sm border border-dashed border-paper-200 rounded-lg">
          {t('timeline.empty')}
        </div>
      ) : (
        <div className="space-y-8">
          {timeline.days.map(day => (
            <div key={day.date}>
              <div className="sticky top-12 bg-paper-50 z-[1] py-2 mb-3 -mx-2 px-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-base font-semibold text-ink-900">{relativeDate(day.date)}</span>
                  <span className="text-sm text-ink-400">{day.date}</span>
                  <span className="text-xs text-ink-400 ml-auto">{t('timeline.entriesCount', { n: day.items.length })}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {day.items.map((item, i) => (
                  <div key={`${day.date}-${item.watching_id}-${i}`}
                        className="relative group">
                    <Link to={`/works/${item.work_id}`}
                          className="card p-3 flex gap-3 hover:border-brand-400 hover:shadow-cardHover transition-all">
                      {item.work_cover_thumb && (
                        <img src={coverUrl(item.work_cover_thumb)}
                             className="w-14 h-[75px] object-cover rounded flex-shrink-0"
                             alt={item.work_title} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold leading-tight hover:text-brand-700 transition-colors line-clamp-2">
                          {item.work_title}
                        </div>
                        {item.show_round && (
                          <div className="text-[10px] text-ink-400 mt-0.5">
                            {item.round_label || t('workDetail.round', { n: item.round_number })}
                          </div>
                        )}
                        {item.range_start != null && (
                          <div className="text-xs text-brand-600 font-medium mt-1.5">
                            {formatRange(item.range_start, item.range_end, getDisplayUnit(item))}
                            {item.entry_ids.length > 1 && (
                              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded font-normal">
                                {t('timeline.merged', { n: item.entry_ids.length })}
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
                    {item.entry_ids.length === 1 && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                        <button onClick={(e) => { e.preventDefault(); beginEdit(item) }}
                                className="p-1.5 bg-white border border-paper-200 rounded shadow-sm text-ink-500 hover:text-brand-700 hover:border-brand-400"
                                title={t('common.edit')}>
                          <Edit2 size={12} />
                        </button>
                        <button onClick={(e) => { e.preventDefault(); beginDelete(item) }}
                                className="p-1.5 bg-white border border-paper-200 rounded shadow-sm text-red-600 hover:bg-red-50 hover:border-red-400"
                                title={t('common.delete')}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          hasRange={editingHasRange}
          unitLabel={editingUnit}
          onClose={() => setEditingEntry(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title={t('timeline.confirmDeleteEntry.title')}
        message={t('timeline.confirmDeleteEntry.message')}
        confirmText={t('common.delete')}
        danger
        onConfirm={() => deleteMut.mutate(confirmDel.id)}
      />
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
