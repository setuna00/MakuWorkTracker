import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, ChevronLeft } from 'lucide-react'
import { api, coverUrl, localToday } from '../lib/api'
import { useT, translateType, translateUnit, useLocaleStore } from '../lib/i18n'
import { Button } from '../components/Modal'

export default function QuickRecordPage() {
  const t = useT()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [query, setQuery] = useState('')
  const [selectedWorkId, setSelectedWorkId] = useState(null)

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })

  const { data: results = [] } = useQuery({
    queryKey: ['works', { q: query }],
    queryFn: () => api.listWorks({ q: query }),
  })

  const { data: selectedWork } = useQuery({
    queryKey: ['work', selectedWorkId],
    queryFn: () => api.getWork(selectedWorkId),
    enabled: !!selectedWorkId,
  })

  const getUnitLabel = (type) => {
    const raw = typesMeta.types?.find(ty => ty.value === type)?.unit_label || '集'
    return translateUnit(raw, t)
  }

  if (selectedWorkId && selectedWork) {
    return (
      <RecordForm
        work={selectedWork}
        typesMeta={typesMeta.types}
        unitLabel={getUnitLabel(selectedWork.type)}
        onBack={() => setSelectedWorkId(null)}
        onDone={() => {
          queryClient.invalidateQueries()
          navigate('/')
        }}
      />
    )
  }

  return (
    <div className="max-w-[1100px] mx-auto">
      <h1 className="text-2xl font-semibold mb-1">{t('quickRecord.title')}</h1>
      <div className="text-sm text-ink-500 mb-5">{t('quickRecord.pickWork')}</div>

      <div className="relative mb-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          autoFocus
          placeholder={t('quickRecord.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="!pl-10"
        />
      </div>

      {results.length === 0 ? (
        <div className="text-center py-16 text-ink-400 text-sm border border-dashed border-paper-200 rounded-lg">
          {query ? t('quickRecord.noMatch') : t('quickRecord.noWorks')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map(w => (
            <button
              key={w.id}
              onClick={() => setSelectedWorkId(w.id)}
              className="card p-3 flex items-center gap-3 hover:border-brand-400 hover:shadow-cardHover transition-all text-left group"
            >
              <div className="w-14 h-[75px] bg-paper-100 rounded overflow-hidden flex-shrink-0">
                {w.cover_thumb_path && (
                  <img src={coverUrl(w.cover_thumb_path)}
                       className="w-full h-full object-cover"
                       alt={w.title} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight group-hover:text-brand-700 transition-colors line-clamp-2">
                  {w.title}
                </div>
                <div className="text-[11px] text-ink-500 mt-1">
                  {translateType(w.type, t)}
                  {w.original_title && <span className="ml-1.5 text-ink-400">· {w.original_title}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RecordForm({ work, typesMeta, unitLabel, onBack, onDone }) {
  const t = useT()
  const locale = useLocaleStore(s => s.locale)
  const typeMeta = typesMeta?.find(ty => ty.value === work.type)
  const hasRange = typeMeta?.has_range_progress

  const sortedWatchings = [...work.watchings].sort((a, b) => a.round_number - b.round_number)
  const [watchingId, setWatchingId] = useState(sortedWatchings[0]?.id)
  const watching = sortedWatchings.find(w => w.id === watchingId)
  const currentMax = watching?.current_progress || 0

  const [date, setDate] = useState(localToday())
  const [start, setStart] = useState(currentMax + 1)
  const [end, setEnd] = useState(currentMax + 1)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const handleWatchingChange = (id) => {
    setWatchingId(Number(id))
    const w = sortedWatchings.find(x => x.id === Number(id))
    const cm = w?.current_progress || 0
    setStart(cm + 1)
    setEnd(cm + 1)
  }

  const submit = useMutation({
    mutationFn: () => api.createEntry(watchingId, {
      date,
      range_start: hasRange ? Number(start) : null,
      range_end: hasRange ? Number(end) : null,
      note: note.trim() || null,
    }),
    onSuccess: () => onDone(),
    onError: (e) => setError(e.message || t('quickRecord.recordFailed')),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (hasRange) {
      const s = Number(start), ed = Number(end)
      if (!s || !ed || s < 1 || ed < s) {
        setError(t('quickRecord.invalidRange'))
        return
      }
    }
    submit.mutate()
  }

  const progressLabel = currentMax > 0
    ? t('quickRecord.progressCurrent', { unit: unitLabel, n: currentMax })
    : t('quickRecord.progress', { unit: unitLabel })
  const toLabel = locale === 'en' ? '–' : '到'

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack}
              className="text-sm text-ink-500 hover:text-brand-700 flex items-center gap-1 mb-4 transition-colors">
        <ChevronLeft size={14} /> {t('quickRecord.reSelect')}
      </button>

      <div className="card p-5 mb-5 flex items-start gap-4">
        <div className="w-20 h-[107px] bg-paper-100 rounded overflow-hidden flex-shrink-0 border border-paper-200">
          {work.cover_thumb_path && (
            <img src={coverUrl(work.cover_thumb_path)}
                 className="w-full h-full object-cover" alt={work.title} />
          )}
        </div>
        <div>
          <div className="text-[11px] text-brand-600 font-medium uppercase mb-1">{translateType(work.type, t)}</div>
          <h1 className="text-lg font-semibold leading-tight">{work.title}</h1>
          {work.original_title && (
            <div className="text-sm text-ink-500 mt-0.5">{work.original_title}</div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        {sortedWatchings.length > 1 && (
          <Field label={t('quickRecord.toRound')}>
            <select value={watchingId} onChange={(e) => handleWatchingChange(e.target.value)}>
              {sortedWatchings.map(w => (
                <option key={w.id} value={w.id}>
                  {w.label || t('workDetail.round', { n: w.round_number })}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t('quickRecord.date')}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {hasRange && (
          <Field label={progressLabel}>
            <div className="flex items-center gap-2">
              <input type="number" value={start} min={1}
                     onChange={(e) => setStart(e.target.value)} className="!w-28" />
              <span className="text-ink-400">{toLabel}</span>
              <input type="number" value={end} min={1}
                     onChange={(e) => setEnd(e.target.value)} className="!w-28" />
            </div>
          </Field>
        )}

        <Field label={t('quickRecord.note')}>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={t('quickRecord.notePlaceholder')} />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-paper-200">
          <Button type="button" variant="ghost" onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? t('common.recording') : t('quickRecord.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-ink-500 mb-1.5 block font-medium">{label}</label>
      {children}
    </div>
  )
}
