import { useState, useEffect } from 'react'
import { Modal, Button } from './Modal'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, localToday } from '../lib/api'
import { useT, translateUnit, useLocaleStore } from '../lib/i18n'

export function QuickRecordModal({ work, watching, onClose, typesMeta }) {
  const t = useT()
  const locale = useLocaleStore(s => s.locale)
  const queryClient = useQueryClient()

  const typeMeta = typesMeta?.find(ty => ty.value === work.type)
  const hasRange = typeMeta?.has_range_progress
  const rawUnit = typeMeta?.unit_label || '集'
  const unitLabel = translateUnit(rawUnit, t)

  const targetWatching = watching || work.watchings?.reduce((latest, w) => !latest || w.round_number > latest.round_number ? w : latest, null)
  const currentMax = targetWatching?.current_progress || 0

  const [start, setStart] = useState(currentMax + 1)
  const [end, setEnd] = useState(currentMax + 1)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(localToday())
  const [error, setError] = useState('')
  const [markFinished, setMarkFinished] = useState(false)

  useEffect(() => {
    setStart(currentMax + 1)
    setEnd(currentMax + 1)
  }, [currentMax])

  const submit = useMutation({
    mutationFn: () => api.createEntry(targetWatching.id, {
      date,
      range_start: hasRange ? Number(start) : null,
      range_end: hasRange ? Number(end) : null,
      note: note.trim() || null,
      mark_finished: canMarkFinished && markFinished,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
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

  // 连载作品记到目前已知的最新一集时，可以顺手勾"已看完"：作品改为完结，状态改为看完
  const canMarkFinished = hasRange && work.release_status === 'ongoing'
    && Number(end) >= 1 && Number(end) >= (work.total_units || 0)

  const progressLabel = currentMax > 0
    ? t('quickRecord.progressCurrent', { unit: unitLabel, n: currentMax })
    : t('quickRecord.progress', { unit: unitLabel })
  const toLabel = locale === 'en' ? '–' : '到'
  const roundLabel = targetWatching.label || t('workDetail.round', { n: targetWatching.round_number })

  return (
    <Modal open={true} onClose={onClose} closeOnBackdrop={false}
           title={t('quickRecord.modal.title', { title: work.title })}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {targetWatching.round_number > 1 && (
          <div className="text-xs text-brand-700 bg-brand-50 border border-brand-200 px-3 py-2 rounded-md">
            {t('quickRecord.modal.toRound', { label: roundLabel })}
          </div>
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

        {canMarkFinished && (
          <MarkFinishedCheckbox checked={markFinished} onChange={setMarkFinished} unit={unitLabel} />
        )}

        <Field label={t('quickRecord.note')}>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={t('quickRecord.notePlaceholder')} />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-paper-200">
          <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? t('common.recording') : t('quickRecord.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** 连载作品记录时的"已看完"勾选框，记录弹窗和快速记录页共用 */
export function MarkFinishedCheckbox({ checked, onChange, unit }) {
  const t = useT()
  return (
    <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border border-paper-200 bg-paper-50 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
             className="mt-0.5 cursor-pointer" />
      <span className="text-sm text-ink-700">
        {t('quickRecord.markFinished', { unit })}
        <span className="block text-xs text-ink-500 mt-0.5">{t('quickRecord.markFinishedHint')}</span>
      </span>
    </label>
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
