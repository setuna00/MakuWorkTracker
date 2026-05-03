import { useState, useEffect } from 'react'
import { Modal, Button } from './Modal'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, localToday } from '../lib/api'

export function QuickRecordModal({ work, watching, onClose, typesMeta }) {
  const queryClient = useQueryClient()

  const typeMeta = typesMeta?.find(t => t.value === work.type)
  const hasRange = typeMeta?.has_range_progress
  const unitLabel = typeMeta?.unit_label || '集'

  const targetWatching = watching || work.watchings?.find(w => w.round_number === 1)
  const currentMax = targetWatching?.current_progress || 0

  const [start, setStart] = useState(currentMax + 1)
  const [end, setEnd] = useState(currentMax + 1)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(localToday())
  const [error, setError] = useState('')

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
    }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      onClose()
    },
    onError: (e) => setError(e.message || '记录失败'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (hasRange) {
      const s = Number(start), ed = Number(end)
      if (!s || !ed || s < 1 || ed < s) {
        setError('请输入有效的进度区间')
        return
      }
    }
    submit.mutate()
  }

  return (
    <Modal open={true} onClose={onClose} title={`记录进度 · ${work.title}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {targetWatching.round_number > 1 && (
          <div className="text-xs text-brand-700 bg-brand-50 border border-brand-200 px-3 py-2 rounded-md">
            正在记录到「{targetWatching.label || `第 ${targetWatching.round_number} 周目`}」
          </div>
        )}

        <Field label="日期">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {hasRange && (
          <Field label={`进度（${unitLabel}）${currentMax > 0 ? ` · 当前 ${currentMax}` : ''}`}>
            <div className="flex items-center gap-2">
              <input type="number" value={start} min={1}
                     onChange={(e) => setStart(e.target.value)} className="!w-28" />
              <span className="text-ink-400">到</span>
              <input type="number" value={end} min={1}
                     onChange={(e) => setEnd(e.target.value)} className="!w-28" />
            </div>
          </Field>
        )}

        <Field label="感想（可选）">
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="本次的想法..." />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-paper-200">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? '记录中...' : '记录'}
          </Button>
        </div>
      </form>
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
