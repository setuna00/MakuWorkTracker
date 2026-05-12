import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Check } from 'lucide-react'
import { Modal, Button } from './Modal'
import { api, coverUrl } from '../lib/api'
import { useT } from '../lib/i18n'

/**
 * 批量把作品加入指定收藏夹。
 *
 * - 拉所有作品(listWorks 没分页),客户端做标题/原标题模糊搜索
 * - 已在该收藏夹中的作品标灰、不可选
 * - 选中后一次性提交,使用 collections/{id}/works 批量端点
 */
export function BulkAddToCollectionModal({ collection, onClose }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [error, setError] = useState('')

  const { data: allWorks = [] } = useQuery({
    queryKey: ['works', { all: true }],
    queryFn: () => api.listWorks({}),
  })

  // 已经在该收藏夹里的 work id 集合
  const alreadyIn = useMemo(() => {
    const s = new Set()
    for (const w of allWorks) {
      if ((w.collections || []).some(c => c.id === collection.id)) s.add(w.id)
    }
    return s
  }, [allWorks, collection.id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allWorks
    return allWorks.filter(w =>
      (w.title || '').toLowerCase().includes(q) ||
      (w.original_title || '').toLowerCase().includes(q)
    )
  }, [allWorks, search])

  const toggle = (id) => {
    if (alreadyIn.has(id)) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = useMutation({
    mutationFn: () => api.bulkAddToCollection(collection.id, [...selected]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['works'] })
      onClose(selected.size)
    },
    onError: (e) => setError(e.message || t('common.saveFailed')),
  })

  return (
    <Modal
      open={true}
      onClose={() => onClose(0)}
      title={t('favorites.bulkAddTitle', { name: collection.name })}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-500 tabular-nums">
            {t('favorites.bulkAddSelected', { n: selected.size })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onClose(0)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => { setError(''); submit.mutate() }}
              disabled={selected.size === 0 || submit.isPending}
            >
              {t('favorites.bulkAddConfirm')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            type="search"
            placeholder={t('favorites.bulkAddSearchPlaceholder')}
            className="input-compact !pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-sm text-ink-400 py-8 text-center">
            {t('favorites.bulkAddNoResults')}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto scrollbar-thin -mx-1 px-1">
            {filtered.map(w => {
              const isIn = alreadyIn.has(w.id)
              const isSel = selected.has(w.id)
              return (
                <button
                  key={w.id}
                  onClick={() => toggle(w.id)}
                  disabled={isIn}
                  className={`relative text-left rounded-lg border p-2 transition-all flex gap-2 ${
                    isIn
                      ? 'opacity-50 cursor-not-allowed border-paper-200 bg-paper-50'
                      : isSel
                        ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                        : 'border-paper-200 hover:border-brand-300 hover:bg-brand-50'
                  }`}
                >
                  <div className="w-10 h-14 flex-shrink-0 rounded bg-paper-100 overflow-hidden border border-paper-200">
                    {w.cover_thumb_path ? (
                      <img src={coverUrl(w.cover_thumb_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink-300 text-lg">📺</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium line-clamp-2 leading-tight">{w.title}</div>
                    {isIn && (
                      <div className="text-[10px] text-ink-400 mt-1">{t('favorites.bulkAddAlreadyIn')}</div>
                    )}
                  </div>
                  {isSel && !isIn && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
