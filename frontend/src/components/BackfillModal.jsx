import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Button } from './Modal'
import { api, localToday } from '../lib/api'
import { useT, translateUnit } from '../lib/i18n'

/**
 * 补录弹窗：登记以前看过、但没记录过的内容。
 * 与正常进度记录的区别：
 *   - is_backfill=true 标记
 *   - 默认填到第几集（视为已观看 1-N 段）
 *   - 不出现在时间轴和本月统计里（后端处理）
 */
export function BackfillModal({ work, watching, typesMeta, onClose }) {
  const t = useT()
  const queryClient = useQueryClient()
  const typeMeta = typesMeta?.find(ty => ty.value === work.type)
  const hasRange = typeMeta?.has_range_progress
  const rawUnit = typeMeta?.unit_label || '集'
  const unitLabel = translateUnit(rawUnit, t)

  const [rangeEnd, setRangeEnd] = useState('')
  const [date, setDate] = useState(localToday())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const submit = useMutation({
    mutationFn: () => {
      if (hasRange) {
        const n = Number(rangeEnd)
        if (!n || n < 1) {
          throw new Error(t('backfill.invalidRange'))
        }
        return api.createEntry(watching.id, {
          date,
          range_start: 1,
          range_end: n,
          note: note.trim() || null,
          is_backfill: true,
        })
      }
      return api.createEntry(watching.id, {
        date,
        range_start: null,
        range_end: null,
        note: note.trim() || null,
        is_backfill: true,
      })
    },
    onSuccess: () => { queryClient.invalidateQueries(); onClose() },
    onError: (e) => setError(e.message || t('common.saveFailed')),
  })

  return (
    <Modal open={true} onClose={onClose} title={t('backfill.title', { title: work.title })}>
      <div className="space-y-4">
        <div className="text-xs text-ink-500 bg-paper-100 border border-paper-200 px-3 py-2 rounded leading-relaxed">
          {t('backfill.hint')}
        </div>

        <Field label={t('backfill.dateLabel')}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {hasRange && (
          <Field label={t('backfill.toLabel', { unit: unitLabel })}>
            <input
              type="number"
              min={1}
              max={work.total_units || undefined}
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="!w-32"
            />
            {work.total_units != null && (
              <div className="text-xs text-ink-400 mt-1">
                {t('backfill.totalHint', { total: work.total_units, unit: unitLabel })}
              </div>
            )}
          </Field>
        )}

        <Field label={t('backfill.noteLabel')}>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-paper-200">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary"
                  onClick={() => { setError(''); submit.mutate() }}
                  disabled={submit.isPending}>
            {t('backfill.submit')}
          </Button>
        </div>
      </div>
    </Modal>
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