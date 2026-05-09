import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useT, translateUnit, useLocaleStore } from '../lib/i18n'
import { Button, Modal } from './Modal'

/**
 * 编辑进度记录的弹窗,详情页与时间轴共用。
 *
 * 注意 unitLabel 的处理:调用方传进来的可能是已翻译的(显示版)
 * 也可能是原始中文(后端原值)。我们这里再走一遍 translateUnit 是幂等的:
 *   "集" → "ep"  (中→英 dict 命中)
 *   "ep" → "ep"  (key 不在 dict,直接返回原值)
 * 所以两种情况都安全。
 */
export function EditEntryModal({ entry, hasRange, unitLabel = '集', onClose }) {
  const t = useT()
  const locale = useLocaleStore(s => s.locale)
  const queryClient = useQueryClient()
  const [start, setStart] = useState(entry.range_start ?? 1)
  const [end, setEnd] = useState(entry.range_end ?? 1)
  const [note, setNote] = useState(entry.note || '')
  const [date, setDate] = useState(entry.date)
  const update = useMutation({
    mutationFn: () => api.updateEntry(entry.id, {
      date,
      range_start: hasRange ? Number(start) : null,
      range_end: hasRange ? Number(end) : null,
      note: note.trim() || null,
    }),
    onSuccess: () => { queryClient.invalidateQueries(); onClose() },
  })

  const displayUnit = translateUnit(unitLabel, t)
  const progressLabel = t('quickRecord.progress', { unit: displayUnit })
  const toLabel = locale === 'en' ? '–' : '到'

  return (
    <Modal open={true} onClose={onClose} title={t('editEntry.title')}>
      <div className="space-y-4">
        <Field label={t('quickRecord.date')}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {hasRange && (
          <Field label={progressLabel}>
            <div className="flex items-center gap-2">
              <input type="number" value={start} min={1}
                     onChange={(e) => setStart(e.target.value)} className="!w-24" />
              <span className="text-ink-400">{toLabel}</span>
              <input type="number" value={end} min={1}
                     onChange={(e) => setEnd(e.target.value)} className="!w-24" />
            </div>
          </Field>
        )}
        <Field label={t('editEntry.note')}>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-3 border-t border-paper-200">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => update.mutate()} disabled={update.isPending}>
            {t('common.save')}
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
