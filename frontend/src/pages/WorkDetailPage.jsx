import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Edit2, Trash2, Plus, MoreHorizontal } from 'lucide-react'
import { api, coverUrl } from '../lib/api'
import { relativeDate } from '../lib/format'
import { Button, Modal, ConfirmDialog } from '../components/Modal'
import { QuickRecordModal } from '../components/QuickRecordModal'
import { StarRating } from '../components/StarRating'
import { CoverCropper } from '../components/CoverCropper'
import { TagChip, SelectableTagChip } from '../components/TagChip'

export default function WorkDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeRound, setActiveRound] = useState(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [confirmDeleteWork, setConfirmDeleteWork] = useState(false)
  const [confirmDeleteRound, setConfirmDeleteRound] = useState(false)
  const [editMetaOpen, setEditMetaOpen] = useState(false)

  const { data: work, isLoading } = useQuery({
    queryKey: ['work', id],
    queryFn: () => api.getWork(id),
  })
  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })

  useEffect(() => {
    if (work && activeRound == null) {
      setActiveRound(1)
    }
  }, [work, activeRound])

  const typeMeta = typesMeta.types.find(t => t.value === work?.type)
  const unitLabel = typeMeta?.unit_label || '集'
  const isMovie = work?.type === 'movie'

  const currentWatching = work?.watchings.find(w => w.round_number === activeRound)
  const canDeleteRound = work?.watchings?.length > 1 && activeRound !== 1

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', currentWatching?.id],
    queryFn: () => api.listEntries(currentWatching.id),
    enabled: !!currentWatching,
  })

  const groupedEntries = useMemo(() => {
    const byDate = {}
    for (const e of entries) {
      if (!byDate[e.date]) byDate[e.date] = []
      byDate[e.date].push(e)
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, list]) => {
        const ranges = list.filter(x => x.range_start != null)
        const merged_start = ranges.length ? Math.min(...ranges.map(x => x.range_start)) : null
        const merged_end = ranges.length ? Math.max(...ranges.map(x => x.range_end)) : null
        return { date, list, merged_start, merged_end, isMulti: list.length > 1 }
      })
  }, [entries])

  const deleteWorkMut = useMutation({
    mutationFn: () => api.deleteWork(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['works'] })
      navigate('/library')
    },
  })

  const deleteRoundMut = useMutation({
    mutationFn: () => api.deleteWatching(currentWatching.id),
    onSuccess: () => {
      setConfirmDeleteRound(false)
      setActiveRound(1)  // 删除后切回 main
      queryClient.invalidateQueries({ queryKey: ['work', id] })
    },
  })

  if (isLoading || !work) return <div className="text-ink-400 py-16 text-center">加载中...</div>

  return (
    <div className="max-w-[1100px] mx-auto pb-8">
      <div className="card p-6 md:p-7 relative">
        {/* 右上角操作区 */}
        <div className="absolute top-5 right-5 flex items-center gap-2">
          {currentWatching && (
            <RoundSwitcher
              work={work}
              activeRound={activeRound}
              onSwitch={setActiveRound}
            />
          )}
          <WorkActionsMenu
            canDeleteRound={canDeleteRound}
            onEdit={() => setEditMetaOpen(true)}
            onDeleteRound={() => setConfirmDeleteRound(true)}
            onDelete={() => setConfirmDeleteWork(true)}
          />
        </div>

        {/* Hero 区 */}
        <div className="flex flex-col sm:flex-row gap-6 pr-32 mb-6">
          <div className="w-36 sm:w-44 flex-shrink-0">
            <div className="aspect-[3/4] bg-paper-100 rounded-lg overflow-hidden border border-paper-200 shadow-card">
              {work.cover_path && (
                <img src={coverUrl(work.cover_path)} className="w-full h-full object-cover" alt={work.title} />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-brand-600 font-medium uppercase tracking-wider mb-2">
              {typeMeta?.label}
              {!isMovie && ` · ${work.release_status === 'finished' ? '完结' : '连载中'}`}
            </div>
            <h1 className="text-2xl font-semibold leading-tight mb-1.5 text-ink-900">{work.title}</h1>
            {work.original_title && (
              <div className="text-sm text-ink-500 mb-4">{work.original_title}</div>
            )}

            {typeMeta?.creator_fields?.length > 0 && (
              <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[13px] mb-4">
                {typeMeta.creator_fields.map(f => (
                  <div key={f.key} className="contents">
                    <span className="text-ink-400">{f.label}</span>
                    <span className="text-ink-700">{work.creators?.[f.key] || '-'}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {work.collections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  {work.collections.map(c => (
                    <TagChip key={`c-${c.id}`} color={c.border_color}>★ {c.name}</TagChip>
                  ))}
                </div>
              )}
              {work.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  {work.tags.map(t => (
                    <TagChip key={t.id} color={t.color}>{t.name}</TagChip>
                  ))}
                </div>
              )}
              {work.tags.length === 0 && work.collections.length === 0 && (
                <button onClick={() => setEditMetaOpen(true)}
                        className="text-[11px] text-ink-400 hover:text-brand-600 transition-colors">
                  + 添加标签或加入收藏夹
                </button>
              )}
            </div>
          </div>
        </div>

        {work.description && (
          <div className="bg-paper-50 border border-paper-200 rounded-lg p-4 text-[13px] leading-relaxed text-ink-700 mb-6">
            {work.description}
          </div>
        )}

        {currentWatching && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatusEditor watching={currentWatching} />
              <ProgressDisplay watching={currentWatching} unitLabel={unitLabel} totalUnits={work.total_units}
                               isMovie={isMovie} />
              <RatingEditor watching={currentWatching} />
            </div>

            <ReviewEditor watching={currentWatching} />

            <div className="flex items-center justify-between mt-7 mb-3">
              <h3 className="text-sm font-medium text-ink-700">
                进度日志 · <span className="text-brand-600">{entries.length}</span> 条
              </h3>
              <Button variant="primary" onClick={() => setRecordOpen(true)}>
                <Plus size={14} /> 记录新进度
              </Button>
            </div>

            <div className="border-l-2 border-paper-200 ml-1.5 pl-5 space-y-4 pt-2">
              {groupedEntries.length === 0 && (
                <div className="text-sm text-ink-400 py-6 italic">还没有进度记录</div>
              )}
              {groupedEntries.map(g => (
                <DayEntries key={g.date} group={g} unitLabel={unitLabel}
                            isMovie={isMovie}
                            onEdit={(e) => setEditingEntry(e)} />
              ))}
            </div>
          </>
        )}
      </div>

      {recordOpen && currentWatching && (
        <QuickRecordModal
          work={work}
          watching={currentWatching}
          typesMeta={typesMeta.types}
          onClose={() => setRecordOpen(false)}
        />
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          work={work}
          typeMeta={typeMeta}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {editMetaOpen && (
        <EditWorkMetaModal
          work={work}
          typeMeta={typeMeta}
          isMovie={isMovie}
          onClose={() => setEditMetaOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteWork}
        onClose={() => setConfirmDeleteWork(false)}
        title="确认删除作品"
        message={
          <>
            将删除「<span className="font-medium">{work.title}</span>」及其所有周目和进度记录。
            <span className="block text-red-600 mt-2">此操作不可恢复。</span>
          </>
        }
        confirmText="确认删除"
        danger
        onConfirm={() => deleteWorkMut.mutate()}
      />

      <ConfirmDialog
        open={confirmDeleteRound}
        onClose={() => setConfirmDeleteRound(false)}
        title="确认删除周目"
        message={
          <>
            将删除「<span className="font-medium">{currentWatching?.label || `第 ${activeRound} 周目`}</span>」
            及其所有进度记录、评分和总评。
            <span className="block text-red-600 mt-2">此操作不可恢复。</span>
          </>
        }
        confirmText="确认删除"
        danger
        onConfirm={() => deleteRoundMut.mutate()}
      />
    </div>
  )
}

// =================== 子组件 ===================

function RoundSwitcher({ work, activeRound, onSwitch }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const current = work.watchings.find(w => w.round_number === activeRound)
  const currentLabel = current?.label || `第 ${activeRound} 周目`

  const createMut = useMutation({
    mutationFn: () => api.createWatching(work.id, { personal_status: 'want' }),
    onSuccess: (newW) => {
      queryClient.invalidateQueries({ queryKey: ['work', String(work.id)] })
      setOpen(false)
      onSwitch(newW.round_number)
    },
  })

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
              className="h-9 px-3.5 text-xs border border-paper-300 hover:border-brand-600 rounded-md flex items-center gap-2 bg-white transition-colors">
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown size={12} className="text-ink-400" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-paper-200 rounded-md shadow-xl overflow-hidden min-w-[200px] z-20">
          {work.watchings.map(w => (
            <button key={w.id}
                    onClick={() => { onSwitch(w.round_number); setOpen(false) }}
                    className={`block w-full text-left px-3 py-2 text-xs hover:bg-paper-100 transition-colors ${
                      w.round_number === activeRound ? 'bg-brand-50 text-brand-700 font-medium' : ''
                    }`}>
              {w.label || `第 ${w.round_number} 周目`}
            </button>
          ))}
          <button onClick={() => createMut.mutate()}
                  disabled={createMut.isPending}
                  className="block w-full text-left px-3 py-2.5 text-xs hover:bg-brand-50 text-brand-600 border-t border-paper-200 transition-colors">
            <Plus size={11} className="inline mr-1" />
            {createMut.isPending ? '创建中...' : '开启新周目'}
          </button>
        </div>
      )}
    </div>
  )
}

function WorkActionsMenu({ canDeleteRound, onEdit, onDeleteRound, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
              className="h-9 w-9 rounded-md hover:bg-paper-100 border border-paper-300 flex items-center justify-center text-ink-500 transition-colors">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-paper-200 rounded-md shadow-xl overflow-hidden min-w-[160px] z-20">
          <button onClick={() => { onEdit(); setOpen(false) }}
                  className="block w-full text-left px-3 py-2.5 text-xs hover:bg-paper-100 transition-colors">
            <Edit2 size={11} className="inline mr-2" /> 编辑作品信息
          </button>
          {canDeleteRound && (
            <button onClick={() => { onDeleteRound(); setOpen(false) }}
                    className="block w-full text-left px-3 py-2.5 text-xs hover:bg-red-50 text-red-700 transition-colors border-t border-paper-200">
              <Trash2 size={11} className="inline mr-2" /> 删除当前周目
            </button>
          )}
          <button onClick={() => { onDelete(); setOpen(false) }}
                  className="block w-full text-left px-3 py-2.5 text-xs hover:bg-red-50 text-red-700 transition-colors border-t border-paper-200">
            <Trash2 size={11} className="inline mr-2" /> 删除作品
          </button>
        </div>
      )}
    </div>
  )
}

function StatusEditor({ watching }) {
  const queryClient = useQueryClient()
  const STATUSES = {
    want: { label: '想看', color: '#64748b' },
    watching: { label: '在看', color: '#2563eb' },
    done: { label: '看完', color: '#16a34a' },
    dropped: { label: '弃坑', color: '#dc2626' },
  }
  const update = useMutation({
    mutationFn: (status) => api.updateWatching(watching.id, { personal_status: status }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
  return (
    <div className="bg-paper-50 border border-paper-200 rounded-lg p-4">
      <div className="text-xs text-ink-500 mb-2">追看状态</div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(STATUSES).map(([k, v]) => {
          const active = watching.personal_status === k
          return (
            <button key={k}
                    onClick={() => update.mutate(k)}
                    className="px-2.5 py-1 rounded text-xs font-medium border transition-colors"
                    style={active ? {
                      background: v.color,
                      borderColor: v.color,
                      color: '#ffffff',
                    } : {
                      background: v.color + '15',
                      borderColor: v.color + '40',
                      color: v.color,
                    }}>
              {v.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RatingEditor({ watching }) {
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (rating) => api.updateWatching(watching.id, { rating }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
  return (
    <div className="bg-paper-50 border border-paper-200 rounded-lg p-4">
      <div className="text-xs text-ink-500 mb-2">评分</div>
      <StarRating value={watching.rating} onChange={(v) => update.mutate(v)} size={24} />
    </div>
  )
}

function ProgressDisplay({ watching, unitLabel, totalUnits, isMovie }) {
  const cur = watching.current_progress
  const pct = (cur != null && totalUnits) ? Math.min(100, (cur / totalUnits) * 100) : null

  if (isMovie) {
    // 电影只显示是否看过
    const watched = watching.personal_status === 'done' || cur != null
    return (
      <div className="bg-paper-50 border border-paper-200 rounded-lg p-4">
        <div className="text-xs text-ink-500 mb-2">观看状态</div>
        <div className="text-base font-semibold">
          {watched
            ? <span className="text-green-700">已观看</span>
            : <span className="text-ink-400 font-normal">未观看</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-paper-50 border border-paper-200 rounded-lg p-4">
      <div className="text-xs text-ink-500 mb-2">进度</div>
      <div className="text-base font-semibold text-ink-900 mb-2">
        {cur != null
          ? `${cur}${totalUnits ? ' / ' + totalUnits : ''} ${unitLabel}`
          : <span className="text-ink-400 font-normal">未开始</span>}
      </div>
      {pct != null && (
        <div className="h-1.5 bg-paper-200 rounded-full overflow-hidden">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

function ReviewEditor({ watching }) {
  const queryClient = useQueryClient()
  const [val, setVal] = useState(watching.overall_review || '')
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setVal(watching.overall_review || ''); setDirty(false) }, [watching.id, watching.overall_review])
  const update = useMutation({
    mutationFn: () => api.updateWatching(watching.id, { overall_review: val }),
    onSuccess: () => { queryClient.invalidateQueries(); setDirty(false) },
  })
  return (
    <div>
      <div className="text-sm font-medium text-ink-700 mb-2 flex items-center justify-between">
        <span>总评（本周目）</span>
        {dirty && (
          <button onClick={() => update.mutate()}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            保存修改
          </button>
        )}
      </div>
      <textarea value={val}
                onChange={(e) => { setVal(e.target.value); setDirty(true) }}
                onBlur={() => dirty && update.mutate()}
                rows={3}
                placeholder="本周目的整体评价..." />
    </div>
  )
}

function DayEntries({ group, unitLabel, isMovie, onEdit }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteEntry(id),
    onSuccess: () => { queryClient.invalidateQueries(); setConfirmDel(null) },
  })

  return (
    <div className="relative">
      <div className="absolute -left-[26px] top-1.5 w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white" />
      <div className="text-[11px] text-ink-400 mb-0.5">{relativeDate(group.date)} · {group.date}</div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-sm font-semibold text-ink-900">
          {isMovie
            ? '已观看'
            : group.merged_start != null
              ? group.merged_start === group.merged_end
                ? `第 ${group.merged_start} ${unitLabel}`
                : `第 ${group.merged_start}-${group.merged_end} ${unitLabel}`
              : '已观看'}
        </span>
        {group.isMulti && (
          <button onClick={() => setExpanded(e => !e)}
                  className="text-[10px] px-2 py-0.5 bg-brand-50 text-brand-700 rounded font-medium">
            合并 {group.list.length} 条 {expanded ? '▴' : '▾'}
          </button>
        )}
      </div>

      {!expanded && group.list.filter(e => e.note).map((e) => (
        <div key={e.id} className="text-xs text-ink-500 mt-1.5 leading-relaxed italic">
          "{e.note}"
        </div>
      ))}

      {expanded && (
        <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-paper-200">
          {group.list.map(e => (
            <div key={e.id} className="text-xs flex items-start justify-between group py-1">
              <div>
                <div className="text-ink-700 font-medium">
                  {e.range_start != null
                    ? e.range_start === e.range_end
                      ? `第 ${e.range_start} ${unitLabel}`
                      : `第 ${e.range_start}-${e.range_end} ${unitLabel}`
                    : '已观看'}
                </div>
                {e.note && <div className="text-ink-500 italic mt-0.5">"{e.note}"</div>}
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                <button onClick={() => onEdit(e)} className="p-1 hover:bg-paper-100 rounded text-ink-500">
                  <Edit2 size={11} />
                </button>
                <button onClick={() => setConfirmDel(e)}
                        className="p-1 hover:bg-red-50 text-red-600 rounded">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="确认删除记录"
        message="将删除该条进度记录。"
        confirmText="删除"
        danger
        onConfirm={() => deleteMut.mutate(confirmDel.id)}
      />
    </div>
  )
}

function EditEntryModal({ entry, work, typeMeta, onClose }) {
  const queryClient = useQueryClient()
  const hasRange = typeMeta?.has_range_progress
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

  return (
    <Modal open={true} onClose={onClose} title="编辑进度记录">
      <div className="space-y-4">
        <Field label="日期">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {hasRange && (
          <Field label="进度">
            <div className="flex items-center gap-2">
              <input type="number" value={start} min={1}
                     onChange={(e) => setStart(e.target.value)} className="!w-24" />
              <span className="text-ink-400">到</span>
              <input type="number" value={end} min={1}
                     onChange={(e) => setEnd(e.target.value)} className="!w-24" />
            </div>
          </Field>
        )}
        <Field label="感想">
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-3 border-t border-paper-200">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => update.mutate()} disabled={update.isPending}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function EditWorkMetaModal({ work, typeMeta, isMovie, onClose }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(work.title)
  const [originalTitle, setOriginalTitle] = useState(work.original_title || '')
  const [description, setDescription] = useState(work.description || '')
  const [releaseStatus, setReleaseStatus] = useState(work.release_status)
  const [totalUnits, setTotalUnits] = useState(work.total_units || '')
  const [creators, setCreators] = useState({ ...work.creators })
  const [coverFile, setCoverFile] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [tagIds, setTagIds] = useState(work.tags.map(t => t.id))
  const [collectionIds, setCollectionIds] = useState(work.collections.map(c => c.id))

  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const { data: allCollections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })

  const update = useMutation({
    mutationFn: () => api.updateWork(work.id, {
      title, original_title: originalTitle || null,
      description: description || null,
      // 电影类型固定 finished，其他类型按用户选择
      release_status: isMovie ? 'finished' : releaseStatus,
      total_units: isMovie ? 1 : (totalUnits ? parseInt(totalUnits) : null),
      creators,
      tag_ids: tagIds,
      collection_ids: collectionIds,
    }, coverFile),
    onSuccess: () => { queryClient.invalidateQueries(); onClose() },
  })

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0]
    if (f) setPendingFile(f)
  }

  const handleCropConfirm = (croppedFile) => {
    setCoverFile(croppedFile)
    setPendingFile(null)
    const reader = new FileReader()
    reader.onload = () => setCoverPreview(reader.result)
    reader.readAsDataURL(croppedFile)
  }

  if (pendingFile) {
    return (
      <Modal open={true} onClose={() => setPendingFile(null)} title="裁剪封面" size="md">
        <CoverCropper
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleCropConfirm}
        />
      </Modal>
    )
  }

  return (
    <Modal open={true} onClose={onClose} title="编辑作品信息" size="lg">
      <div className="space-y-4">
        <Field label="标题">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="原文标题（可选）">
          <input value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} />
        </Field>

        {typeMeta?.creator_fields?.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {typeMeta.creator_fields.map(f => (
              <Field key={f.key} label={f.label}>
                <input value={creators[f.key] || ''}
                       onChange={(e) => setCreators(c => ({ ...c, [f.key]: e.target.value }))} />
              </Field>
            ))}
          </div>
        )}

        <Field label="简介">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {/* 电影类型不显示作品状态/总集数 */}
        {!isMovie && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="作品状态">
              <select value={releaseStatus} onChange={(e) => setReleaseStatus(e.target.value)}>
                <option value="ongoing">连载中</option>
                <option value="finished">完结</option>
              </select>
            </Field>
            {typeMeta?.has_range_progress && (
              <Field label={`总${typeMeta.unit_label}数`}>
                <input type="number" value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} />
              </Field>
            )}
          </div>
        )}

        <Field label="更换封面">
          <div className="flex items-start gap-3">
            {coverPreview && (
              <img src={coverPreview} alt="预览"
                   className="w-20 h-[107px] object-cover rounded border border-paper-200" />
            )}
            <input type="file" accept="image/*" onChange={handleFileSelect} className="flex-1" />
          </div>
        </Field>

        <Field label={`标签（${tagIds.length} 已选）`}>
          {allTags.length === 0 ? (
            <div className="text-xs text-ink-400 px-3 py-3 bg-paper-50 rounded border border-paper-200">
              还没有标签，可以去「设置 → 标签」创建
            </div>
          ) : (
            <div className="bg-paper-50 border border-paper-200 rounded-lg p-3">
              <div className="flex flex-wrap gap-1.5">
                {allTags.map(t => (
                  <SelectableTagChip key={t.id} color={t.color}
                                     selected={tagIds.includes(t.id)}
                                     onClick={() => setTagIds(ids =>
                                       ids.includes(t.id) ? ids.filter(x => x !== t.id) : [...ids, t.id]
                                     )}>
                    {t.name}
                  </SelectableTagChip>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label={`收藏夹（${collectionIds.length} 已选）`}>
          {allCollections.length === 0 ? (
            <div className="text-xs text-ink-400 px-3 py-3 bg-paper-50 rounded border border-paper-200">
              还没有收藏夹，可以去「设置 → 收藏夹」创建
            </div>
          ) : (
            <div className="bg-paper-50 border border-paper-200 rounded-lg p-3">
              <div className="flex flex-wrap gap-1.5">
                {allCollections.map(c => (
                  <SelectableTagChip key={c.id} color={c.border_color}
                                     selected={collectionIds.includes(c.id)}
                                     onClick={() => setCollectionIds(ids =>
                                       ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id]
                                     )}>
                    ★ {c.name}
                  </SelectableTagChip>
                ))}
              </div>
            </div>
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-4 border-t border-paper-200">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => update.mutate()} disabled={update.isPending}>
            保存
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
