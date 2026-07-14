import { useState, useMemo, useRef, useEffect } from 'react'
// 注：useRef + IntersectionObserver 用于移动端顶 bar 标题滚动显隐
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, Edit2, Trash2, Plus, MoreHorizontal } from 'lucide-react'
import { api, coverUrl } from '../lib/api'
import { relativeDate, formatRange } from '../lib/format'
import {
  useT,
  translateType, translateStatus, translateRelease,
  translateUnit, translateCreatorLabel,
} from '../lib/i18n'
import { Button, Modal, ConfirmDialog } from '../components/Modal'
import { QuickRecordModal } from '../components/QuickRecordModal'
import { StarRating } from '../components/StarRating'
import { CoverCropper } from '../components/CoverCropper'
import { TagChip, SelectableTagChip } from '../components/TagChip'
import { TagPicker } from '../components/TagPicker'
import { EditEntryModal } from '../components/EditEntryModal'
import { BackfillModal } from '../components/BackfillModal'

export default function WorkDetailPage() {
  const t = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeRound, setActiveRound] = useState(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
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
    setActiveRound(null)
  }, [id])

  useEffect(() => {
    if (work?.watchings?.length && activeRound == null) {
      setActiveRound(Math.max(...work.watchings.map(w => w.round_number)))
    }
  }, [work, activeRound])

  const typeMeta = typesMeta.types.find(ty => ty.value === work?.type)
  // 原始单位（中文,后端原值）—— 给 EditEntryModal、提交等 SoT 用
  const rawUnit = work?.unit_label || typeMeta?.unit_label || '集'
  // 显示用的单位（已 i18n）
  const displayUnit = translateUnit(rawUnit, t)
  const isMovie = work?.type === 'movie'

  const currentWatching = work?.watchings.find(w => w.round_number === activeRound)
  const canDeleteRound = work?.watchings?.length > 1

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
      const remainingRounds = work.watchings
        .filter(w => w.id !== currentWatching.id)
        .map(w => w.round_number)
      setActiveRound(remainingRounds.length ? Math.max(...remainingRounds) : null)
      queryClient.invalidateQueries({ queryKey: ['work', id] })
      queryClient.invalidateQueries({ queryKey: ['works'] })
    },
  })

  if (isLoading || !work) return <div className="text-ink-400 py-16 text-center">{t('workDetail.loading')}</div>

  return (
    <div className="max-w-[1100px] mx-auto pb-8">
      <div className="hidden md:block card p-6 md:p-7 relative">
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
              {translateType(work.type, t)}
              {!isMovie && ` · ${translateRelease(work.release_status, t)}`}
            </div>
            <h1 className="text-2xl font-semibold leading-tight mb-1.5 text-ink-900">{work.title}</h1>
            {work.original_title && (
              <div className="text-sm text-ink-500 mb-4">{work.original_title}</div>
            )}

            {(work.release_year || typeMeta?.creator_fields?.length > 0) && (
              <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[13px] mb-4">
                {work.release_year && (
                  <div className="contents">
                    <span className="text-ink-400">{t('workDetail.releaseYear')}</span>
                    <span className="text-ink-700 tabular-nums">{work.release_year}</span>
                  </div>
                )}
                {typeMeta?.creator_fields?.map(f => (
                  <div key={f.key} className="contents">
                    <span className="text-ink-400">{translateCreatorLabel(f, t)}</span>
                    <span className="text-ink-700">{work.creators?.[f.key] || '-'}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {work.collections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  {work.collections.map(c => (
                    <TagChip key={`c-${c.id}`} color={c.border_color} colored
                             className="!rounded-full !px-2.5 !py-1 !text-xs"
                             onClick={() => navigate(`/library?collection=${c.id}`)}
                             title={t('workDetail.tagFavoriteHint')}>
                      ★ {c.name}
                    </TagChip>
                  ))}
                </div>
              )}
              {work.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  {work.tags.map(tg => (
                    <TagChip key={tg.id}
                             className="!rounded-full !px-2.5 !py-1 !text-xs"
                             onClick={() => navigate(`/library?tag=${tg.id}`)}
                             title={t('workDetail.tagTagHint')}>
                      {tg.name}
                    </TagChip>
                  ))}
                </div>
              )}
              {work.tags.length === 0 && work.collections.length === 0 && (
                <button onClick={() => setEditMetaOpen(true)}
                        className="text-[11px] text-ink-400 hover:text-brand-600 transition-colors">
                  {t('workDetail.addTagOrFavorite')}
                </button>
              )}
            </div>
          </div>
        </div>

        {work.description && (
          <div className="bg-paper-50 border border-paper-200 rounded-lg p-4 text-[13px] leading-relaxed text-ink-700 mb-6 whitespace-pre-wrap">
            {work.description}
          </div>
        )}

        {currentWatching && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatusEditor watching={currentWatching} />
              <ProgressDisplay watching={currentWatching} unitLabel={displayUnit} totalUnits={work.total_units}
                               isMovie={isMovie} />
              <RatingEditor watching={currentWatching} />
            </div>

            <ReviewEditor watching={currentWatching} />

            <div className="flex items-center justify-between mt-7 mb-3">
              <h3 className="text-[13px] font-semibold text-ink-700">
                {t('workDetail.entryLog')} · <span className="text-brand-600">{entries.length}</span>
              </h3>
              <div className="flex gap-2">
                <Button variant="default" onClick={() => setBackfillOpen(true)}>
                  {t('workDetail.backfill')}
                </Button>
                <Button variant="primary" onClick={() => setRecordOpen(true)}>
                  <Plus size={14} /> {t('workDetail.recordNew')}
                </Button>
              </div>
            </div>

            <div className="border-l-2 border-paper-200 ml-1.5 pl-5 space-y-4 pt-2">
              {groupedEntries.length === 0 && (
                <div className="text-sm text-ink-400 py-6 italic">{t('workDetail.entryLogEmpty')}</div>
              )}
              {groupedEntries.map(g => (
                <DayEntries key={g.date} group={g} unitLabel={displayUnit}
                            isMovie={isMovie}
                            onEdit={(e) => setEditingEntry(e)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ============ 移动端 ============ */}
      <MobileWorkDetail
        work={work}
        currentWatching={currentWatching}
        activeRound={activeRound}
        setActiveRound={setActiveRound}
        canDeleteRound={canDeleteRound}
        setEditMetaOpen={setEditMetaOpen}
        setConfirmDeleteRound={setConfirmDeleteRound}
        setConfirmDeleteWork={setConfirmDeleteWork}
        setBackfillOpen={setBackfillOpen}
        setRecordOpen={setRecordOpen}
        setEditingEntry={setEditingEntry}
        displayUnit={displayUnit}
        isMovie={isMovie}
        typeMeta={typeMeta}
        entries={entries}
        groupedEntries={groupedEntries}
      />

      {/* ============ Modals（共用）============ */}
      {recordOpen && currentWatching && (
        <QuickRecordModal
          work={work}
          watching={currentWatching}
          typesMeta={typesMeta.types}
          onClose={() => setRecordOpen(false)}
        />
      )}

      {backfillOpen && currentWatching && (
        <BackfillModal
          work={work}
          watching={currentWatching}
          typesMeta={typesMeta.types}
          onClose={() => setBackfillOpen(false)}
        />
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          hasRange={typeMeta?.has_range_progress}
          unitLabel={rawUnit}
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
        title={t('workDetail.confirmDeleteWork.title')}
        message={
          <>
            {t('workDetail.confirmDeleteWork.body', { title: work.title })}
            <span className="block text-red-600 mt-2">{t('workDetail.confirmDeleteWork.warn')}</span>
          </>
        }
        confirmText={t('common.confirmDelete')}
        danger
        onConfirm={() => deleteWorkMut.mutate()}
      />

      <ConfirmDialog
        open={confirmDeleteRound}
        onClose={() => setConfirmDeleteRound(false)}
        title={t('workDetail.confirmDeleteRound.title')}
        message={
          <>
            {t('workDetail.confirmDeleteRound.body', {
              label: currentWatching?.label || t('workDetail.round', { n: activeRound })
            })}
            <span className="block text-red-600 mt-2">{t('workDetail.confirmDeleteWork.warn')}</span>
          </>
        }
        confirmText={t('common.confirmDelete')}
        danger
        onConfirm={() => deleteRoundMut.mutate()}
      />
    </div>
  )
}

// =================== 子组件 ===================

function MobileWorkDetail({
  work, currentWatching, activeRound, setActiveRound,
  canDeleteRound, setEditMetaOpen, setConfirmDeleteRound, setConfirmDeleteWork,
  setBackfillOpen, setRecordOpen, setEditingEntry,
  displayUnit, isMovie, typeMeta, entries, groupedEntries,
}) {
  const t = useT()
  const navigate = useNavigate()

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/library')
  }

  // 海报区标题滚出视区后，顶 bar 才显示标题
  const heroTitleRef = useRef(null)
  const [showTopBarTitle, setShowTopBarTitle] = useState(false)
  useEffect(() => {
    const el = heroTitleRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setShowTopBarTitle(!entry.isIntersecting),
      { rootMargin: '-48px 0px 0px 0px', threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [work.id])

  // 简介展开/收起
  const [descExpanded, setDescExpanded] = useState(false)

  return (
    <div className="md:hidden -mx-4 -my-5">
      {/* ============ 顶 bar ============ */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-paper-200 h-12 flex items-center px-2 gap-1">
        <button
          onClick={goBack}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-paper-100 text-ink-700 flex-shrink-0"
          aria-label={t('common.back') || '返回'}
        >
          <ChevronLeft size={20} />
        </button>
        <div
          className={`flex-1 min-w-0 text-[15px] font-medium text-ink-900 truncate transition-opacity duration-200 ${
            showTopBarTitle ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {work.title}
        </div>
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

      {/* ============ 海报 + 元信息（左右布局）============ */}
      <div className="relative overflow-hidden">
        {work.cover_path && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-30"
            style={{ backgroundImage: `url(${coverUrl(work.cover_path)})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/80 to-white" />
        <div className="relative px-4 pt-4 pb-5 flex gap-4">
          {/* 海报 */}
          <div className="w-[40%] max-w-[180px] flex-shrink-0">
            <div className="aspect-[3/4] bg-paper-100 rounded-xl overflow-hidden border border-paper-200 shadow-xl">
              {work.cover_path && (
                <img src={coverUrl(work.cover_path)} className="w-full h-full object-cover" alt={work.title} />
              )}
            </div>
          </div>

          {/* 元信息 */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="text-[11px] text-brand-600 font-medium uppercase tracking-wider">
              {translateType(work.type, t)}
              {!isMovie && ` · ${translateRelease(work.release_status, t)}`}
            </div>
            <h1
              ref={heroTitleRef}
              className="mt-1 text-xl font-semibold leading-tight text-ink-900 break-words"
            >
              {work.title}
            </h1>
            {work.original_title && (
              <div className="mt-0.5 text-[13px] text-ink-500 break-words">{work.original_title}</div>
            )}

            {/* 年份与制作者信息 */}
            {(work.release_year || typeMeta?.creator_fields?.length > 0) && (
              <div className="mt-2.5 space-y-1 text-[12px]">
                {work.release_year && (
                  <div className="flex gap-2">
                    <span className="text-ink-400 flex-shrink-0">{t('workDetail.releaseYear')}</span>
                    <span className="text-ink-700 tabular-nums">{work.release_year}</span>
                  </div>
                )}
                {typeMeta?.creator_fields?.map(f => (
                  <div key={f.key} className="flex gap-2">
                    <span className="text-ink-400 flex-shrink-0">{translateCreatorLabel(f, t)}</span>
                    <span className="text-ink-700 min-w-0 break-words">{work.creators?.[f.key] || '-'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* tags + 收藏夹 */}
            {(work.collections.length > 0 || work.tags.length > 0) ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                {work.collections.map(c => (
                  <TagChip
                    key={`c-${c.id}`} color={c.border_color} colored
                    className="!rounded-full !px-2 !py-0.5 !text-[11px]"
                    onClick={() => navigate(`/library?collection=${c.id}`)}
                  >
                    ★ {c.name}
                  </TagChip>
                ))}
                {work.tags.map(tg => (
                  <TagChip
                    key={tg.id}
                    className="!rounded-full !px-2 !py-0.5 !text-[11px]"
                    onClick={() => navigate(`/library?tag=${tg.id}`)}
                  >
                    {tg.name}
                  </TagChip>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setEditMetaOpen(true)}
                className="mt-2.5 text-[11px] text-ink-400 hover:text-brand-600 self-start"
              >
                {t('workDetail.addTagOrFavorite')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============ 简介（3 行截断 + fade out + 展开）============ */}
      {work.description && (
        <div className="px-4 mt-3">
          <div className="relative bg-paper-50 border border-paper-200 rounded-lg overflow-hidden">
            <div
              className={`p-3 text-[13px] leading-relaxed text-ink-700 whitespace-pre-wrap ${
                descExpanded ? '' : 'max-h-[4.8rem] overflow-hidden'
              }`}
            >
              {work.description}
            </div>
            {!descExpanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-paper-50 to-transparent" />
            )}
          </div>
          <div className="flex justify-end mt-1.5">
            <button
              onClick={() => setDescExpanded(v => !v)}
              className="text-[12px] text-brand-600 hover:text-brand-700 px-1"
            >
              {descExpanded ? t('workDetail.collapse') : t('workDetail.expand')}
            </button>
          </div>
        </div>
      )}

      {/* ============ 主操作区：状态/进度/评分 ============ */}
      {currentWatching && (
        <div className="px-4 mt-4 space-y-3">
          <StatusEditor watching={currentWatching} />
          <ProgressDisplay
            watching={currentWatching}
            unitLabel={displayUnit}
            totalUnits={work.total_units}
            isMovie={isMovie}
          />
          <RatingEditor watching={currentWatching} />
        </div>
      )}

      {/* ============ 总评 ============ */}
      {currentWatching && (
        <div className="px-4 mt-4">
          <ReviewEditor watching={currentWatching} />
        </div>
      )}

      {/* ============ 记录列表 ============ */}
      {currentWatching && (
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-ink-700">
              {t('workDetail.entryLog')} · <span className="text-brand-600">{entries.length}</span>
            </h3>
            <div className="flex gap-2">
              <Button variant="default" onClick={() => setBackfillOpen(true)}>
                {t('workDetail.backfill')}
              </Button>
              <Button variant="primary" onClick={() => setRecordOpen(true)}>
                <Plus size={14} /> {t('workDetail.recordNew')}
              </Button>
            </div>
          </div>
          <div className="border-l-2 border-paper-200 ml-1.5 pl-5 space-y-4 pt-2">
            {groupedEntries.length === 0 && (
              <div className="text-sm text-ink-400 py-6 italic">{t('workDetail.entryLogEmpty')}</div>
            )}
            {groupedEntries.map(g => (
              <DayEntries key={g.date} group={g} unitLabel={displayUnit}
                          isMovie={isMovie}
                          onEdit={(e) => setEditingEntry(e)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RoundSwitcher({ work, activeRound, onSwitch }) {
  const t = useT()
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
  const currentLabel = current?.label || t('workDetail.round', { n: activeRound })

  const createMut = useMutation({
    mutationFn: () => api.createWatching(work.id, { personal_status: 'watching' }),
    onSuccess: (newW) => {
      queryClient.invalidateQueries({ queryKey: ['work', String(work.id)] })
      queryClient.invalidateQueries({ queryKey: ['works'] })
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
          {[...work.watchings].sort((a, b) => b.round_number - a.round_number).map(w => (
            <button key={w.id}
                    onClick={() => { onSwitch(w.round_number); setOpen(false) }}
                    className={`block w-full text-left px-3 py-2 text-xs hover:bg-paper-100 transition-colors ${
                      w.round_number === activeRound ? 'bg-brand-50 text-brand-700 font-medium' : ''
                    }`}>
              {w.label || t('workDetail.round', { n: w.round_number })}
            </button>
          ))}
          <button onClick={() => createMut.mutate()}
                  disabled={createMut.isPending}
                  className="block w-full text-left px-3 py-2.5 text-xs hover:bg-brand-50 text-brand-600 border-t border-paper-200 transition-colors">
            <Plus size={11} className="inline mr-1" />
            {createMut.isPending ? t('common.creating') : t('workDetail.newRound')}
          </button>
        </div>
      )}
    </div>
  )
}

function WorkActionsMenu({ canDeleteRound, onEdit, onDeleteRound, onDelete }) {
  const t = useT()
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
        <div className="absolute top-full mt-1 right-0 bg-white border border-paper-200 rounded-md shadow-xl overflow-hidden min-w-[180px] z-20">
          <button onClick={() => { onEdit(); setOpen(false) }}
                  className="block w-full text-left px-3 py-2.5 text-xs hover:bg-paper-100 transition-colors">
            <Edit2 size={11} className="inline mr-2" /> {t('workDetail.editMeta')}
          </button>
          {canDeleteRound && (
            <button onClick={() => { onDeleteRound(); setOpen(false) }}
                    className="block w-full text-left px-3 py-2.5 text-xs hover:bg-red-50 text-red-700 transition-colors border-t border-paper-200">
              <Trash2 size={11} className="inline mr-2" /> {t('workDetail.deleteRound')}
            </button>
          )}
          <button onClick={() => { onDelete(); setOpen(false) }}
                  className="block w-full text-left px-3 py-2.5 text-xs hover:bg-red-50 text-red-700 transition-colors border-t border-paper-200">
            <Trash2 size={11} className="inline mr-2" /> {t('workDetail.deleteWork')}
          </button>
        </div>
      )}
    </div>
  )
}

const INFO_CARD_BASE =
  'h-full min-h-[112px] rounded-xl border border-paper-200 bg-white p-4 flex flex-col gap-3'
const INFO_CARD_TITLE =
  'text-[13px] font-semibold text-ink-700'

function StatusEditor({ watching }) {
  const t = useT()
  const queryClient = useQueryClient()
  const STATUSES = [
    {
      key: 'want',
      activeBg: 'bg-slate-600',
      activeRing: 'ring-slate-600',
      idleText: 'text-slate-600',
    },
    {
      key: 'watching',
      activeBg: 'bg-blue-600',
      activeRing: 'ring-blue-600',
      idleText: 'text-blue-600',
    },
    {
      key: 'on_hold',
      activeBg: 'bg-amber-600',
      activeRing: 'ring-amber-600',
      idleText: 'text-amber-600',
    },
    {
      key: 'done',
      activeBg: 'bg-green-600',
      activeRing: 'ring-green-600',
      idleText: 'text-green-700',
    },
    {
      key: 'dropped',
      activeBg: 'bg-red-600',
      activeRing: 'ring-red-600',
      idleText: 'text-red-600',
    },
  ]
  const update = useMutation({
    mutationFn: status => api.updateWatching(watching.id, { personal_status: status }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
  return (
    <div className={INFO_CARD_BASE}>
      <div className={INFO_CARD_TITLE}>{t('workDetail.watchStatus')}</div>
      <div className="grid w-full grid-cols-5 gap-1 rounded-lg bg-paper-100 p-1">
        {STATUSES.map(s => {
          const active = watching.personal_status === s.key
          return (
            <button
              key={s.key}
              onClick={() => update.mutate(s.key)}
              className={[
                'h-8 rounded-md text-[13px] font-semibold transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                active
                  ? `${s.activeBg} text-white shadow-sm ${s.activeRing}`
                  : `bg-transparent ${s.idleText} hover:bg-white/70`,
              ].join(' ')}
            >
              {translateStatus(s.key, t)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RatingEditor({ watching }) {
  const t = useT()
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: rating => api.updateWatching(watching.id, { rating }),
    onSuccess: () => queryClient.invalidateQueries(),
  })
  return (
    <div className={INFO_CARD_BASE}>
      <div className={INFO_CARD_TITLE}>{t('workDetail.rating')}</div>
      <StarRating
        value={watching.rating}
        onChange={v => update.mutate(v)}
        size={22}
        showScore
        scorePosition="bottom"
      />
    </div>
  )
}

function ProgressDisplay({ watching, unitLabel, totalUnits, isMovie }) {
  const t = useT()
  const cur = watching.current_progress
  const pct = cur != null && totalUnits ? Math.min(100, (cur / totalUnits) * 100) : null

  if (isMovie) {
    const watched = watching.personal_status === 'done' || cur != null
    return (
      <div className={INFO_CARD_BASE}>
        <div className={INFO_CARD_TITLE}>{t('workDetail.viewStatus')}</div>
        {watched ? (
          <div className="text-xl font-semibold text-green-700 leading-none">{t('workDetail.watched')}</div>
        ) : (
          <div className="text-xl font-semibold text-ink-400 leading-none">{t('workDetail.unwatched')}</div>
        )}
      </div>
    )
  }

  return (
    <div className={INFO_CARD_BASE}>
      <div className={INFO_CARD_TITLE}>{t('workDetail.progress')}</div>
      <div className="flex flex-col gap-2">
        {cur != null ? (
          <>
            <div className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-xl font-semibold text-ink-900 leading-none">
                {cur}
              </span>
              {totalUnits != null && (
                <>
                  <span className="text-sm text-ink-400 leading-none">/</span>
                  <span className="text-sm font-medium text-ink-500 leading-none">
                    {totalUnits}
                  </span>
                </>
              )}
              {unitLabel && (
                <span className="ml-1 text-xs font-medium text-ink-500 leading-none">
                  {unitLabel}
                </span>
              )}
            </div>
            {pct != null ? (
              <div className="space-y-1">
                <div className="h-1.5 bg-paper-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs text-ink-500 tabular-nums">
                  {t('workDetail.progressDone', { pct: pct.toFixed(0) })}
                </div>
              </div>
            ) : (
              <div className="text-xs text-ink-400">{t('workDetail.progressNoTotal', { unit: unitLabel })}</div>
            )}
          </>
        ) : totalUnits != null ? (
          <>
            <div className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-xl font-semibold text-ink-400 leading-none">0</span>
              <span className="text-sm text-ink-400 leading-none">/</span>
              <span className="text-sm font-medium text-ink-500 leading-none">{totalUnits}</span>
              {unitLabel && (
                <span className="ml-1 text-xs font-medium text-ink-500 leading-none">{unitLabel}</span>
              )}
            </div>
            <div className="space-y-1">
              <div className="h-1.5 bg-paper-200 rounded-full overflow-hidden">
                <div className="h-full bg-paper-300" style={{ width: '0%' }} />
              </div>
              <div className="text-xs text-ink-400 tabular-nums">{t('workDetail.progressNotStarted')}</div>
            </div>
          </>
        ) : (
          <div className="text-xl font-semibold text-ink-400 leading-none">{t('workDetail.progressNotStarted')}</div>
        )}
      </div>
    </div>
  )
}

function ReviewEditor({ watching }) {
  const t = useT()
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
      <div className="text-[13px] font-semibold text-ink-700 mb-2 flex items-center justify-between">
        <span>{t('workDetail.review')}</span>
        {dirty && (
          <button onClick={() => update.mutate()}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            {t('workDetail.reviewSave')}
          </button>
        )}
      </div>
      <textarea value={val}
                onChange={(e) => { setVal(e.target.value); setDirty(true) }}
                onBlur={() => dirty && update.mutate()}
                rows={3}
                placeholder={t('workDetail.reviewPlaceholder')} />
    </div>
  )
}

function DayEntries({ group, unitLabel, isMovie, onEdit }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const isGroupBackfill = group.list.every(e => e.is_backfill)
  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteEntry(id),
    onSuccess: () => { queryClient.invalidateQueries(); setConfirmDel(null) },
  })

  const renderRange = (start, end) => formatRange(start, end, unitLabel)

  return (
    <div className={`relative group ${isGroupBackfill ? 'opacity-70' : ''}`}>
      <div className={`absolute -left-[26px] top-1.5 w-3 h-3 rounded-full ring-4 ring-white ${
        isGroupBackfill ? 'bg-ink-400' : 'bg-brand-500'
      }`} />
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="text-[11px] text-ink-400">{relativeDate(group.date)} · {group.date}</div>
        {!group.isMulti && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
            <button onClick={() => onEdit(group.list[0])}
                    className="p-1 hover:bg-paper-100 rounded text-ink-500"
                    title={t('common.edit')}>
              <Edit2 size={12} />
            </button>
            <button onClick={() => setConfirmDel(group.list[0])}
                    className="p-1 hover:bg-red-50 text-red-600 rounded"
                    title={t('common.delete')}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-sm font-semibold text-ink-900">
          {isMovie
            ? t('workDetail.watched')
            : group.merged_start != null
              ? renderRange(group.merged_start, group.merged_end)
              : t('workDetail.watched')}
        </span>
        {isGroupBackfill && (
          <span className="text-[10px] px-1.5 py-0.5 bg-paper-200 text-ink-600 rounded font-medium">
            {t('common.backfillTag')}
          </span>
        )}
        {group.isMulti && (
          <button onClick={() => setExpanded(e => !e)}
                  className="text-[10px] px-2 py-0.5 bg-brand-50 text-brand-700 rounded font-medium">
            {t('timeline.mergedExpand', { n: group.list.length })} {expanded ? '▴' : '▾'}
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
                    ? renderRange(e.range_start, e.range_end)
                    : t('workDetail.watched')}
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
        title={t('timeline.confirmDeleteEntry.title')}
        message={t('timeline.confirmDeleteEntry.message')}
        confirmText={t('common.delete')}
        danger
        onConfirm={() => deleteMut.mutate(confirmDel.id)}
      />
    </div>
  )
}

const EDIT_FIELD_CONTROL =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-slate-50/80 px-3.5 text-sm text-ink-900 placeholder:text-ink-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none'

const EDIT_TEXTAREA_CONTROL =
  `${EDIT_FIELD_CONTROL} min-h-[120px] py-2.5 resize-y`

const EDIT_FILE_CONTROL =
  'w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border file:border-paper-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:border-brand-400'

function EditWorkMetaModal({ work, typeMeta, isMovie, onClose }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(work.title)
  const [originalTitle, setOriginalTitle] = useState(work.original_title || '')
  const [releaseYear, setReleaseYear] = useState(work.release_year || '')
  const [description, setDescription] = useState(work.description || '')
  const [releaseStatus, setReleaseStatus] = useState(work.release_status)
  const [totalUnits, setTotalUnits] = useState(work.total_units || '')
  const [unitLabel, setUnitLabel] = useState(work.unit_label || '')
  const [creators, setCreators] = useState({ ...work.creators })
  const [coverFile, setCoverFile] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [tagIds, setTagIds] = useState(work.tags.map(tg => tg.id))
  const [collectionIds, setCollectionIds] = useState(work.collections.map(c => c.id))

  const { data: allTags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const { data: tagGroups = [] } = useQuery({ queryKey: ['tagGroups'], queryFn: api.listTagGroups })
  const { data: allCollections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })
  const { data: suggestedTags = [] } = useQuery({
    queryKey: ['tag-suggestions', { tagIds: [...tagIds].sort((a, b) => a - b), workType: work.type }],
    queryFn: () => api.suggestTags({ tagIds, workType: work.type }),
    enabled: tagIds.length > 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? [],
  })

  const unitOptions = typeMeta?.unit_options || []
  const supportsCustomUnit = unitOptions.length > 0

  const effectiveUnitDisplay = translateUnit(unitLabel || typeMeta?.unit_label || '', t)

  const update = useMutation({
    mutationFn: () => api.updateWork(work.id, {
      title, original_title: originalTitle || null,
      release_year: releaseYear ? parseInt(releaseYear, 10) : null,
      description: description || null,
      release_status: isMovie ? 'finished' : releaseStatus,
      total_units: isMovie ? 1 : (totalUnits ? parseInt(totalUnits) : null),
      unit_label: supportsCustomUnit ? (unitLabel || null) : null,
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
      <Modal open={true} onClose={() => setPendingFile(null)} title={t('newWork.cropper.title')} size="md">
        <CoverCropper
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleCropConfirm}
        />
      </Modal>
    )
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={t('workDetail.editTitle')}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => update.mutate()} disabled={update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={t('newWork.step2.fieldTitle')}>
          <input
            className={EDIT_FIELD_CONTROL}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_9rem] gap-3">
          <Field label={t('workDetail.editFieldOriginalTitle')}>
            <input
              className={EDIT_FIELD_CONTROL}
              value={originalTitle}
              onChange={(e) => setOriginalTitle(e.target.value)}
            />
          </Field>
          <Field label={t('newWork.step2.releaseYear')}>
            <input
              className={`${EDIT_FIELD_CONTROL} !h-11 !px-3.5`}
              type="number"
              min={1}
              max={9999}
              inputMode="numeric"
              value={releaseYear}
              onChange={(e) => setReleaseYear(e.target.value)}
              placeholder="2024"
            />
          </Field>
        </div>

        {typeMeta?.creator_fields?.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {typeMeta.creator_fields.map(f => (
              <Field key={f.key} label={translateCreatorLabel(f, t)}>
                <input
                  className={EDIT_FIELD_CONTROL}
                  value={creators[f.key] || ''}
                  onChange={(e) => setCreators(c => ({ ...c, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        )}

        <Field label={t('workDetail.editFieldDescription')}>
          <textarea
            className={EDIT_TEXTAREA_CONTROL}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {!isMovie && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('newWork.step2.releaseStatus')}>
                <select
                  className={EDIT_FIELD_CONTROL}
                  value={releaseStatus}
                  onChange={(e) => setReleaseStatus(e.target.value)}
                >
                  <option value="ongoing">{translateRelease('ongoing', t)}</option>
                  <option value="finished">{translateRelease('finished', t)}</option>
                </select>
              </Field>
              {typeMeta?.has_range_progress && (
                <Field label={t('newWork.step2.totalUnits', { unit: effectiveUnitDisplay })}>
                  <input
                    className={EDIT_FIELD_CONTROL}
                    type="number"
                    value={totalUnits}
                    onChange={(e) => setTotalUnits(e.target.value)}
                  />
                </Field>
              )}
            </div>
            {supportsCustomUnit && (
              <Field label={t('newWork.step2.unitLabel')}>
                <select
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                  className={`${EDIT_FIELD_CONTROL} !w-32`}
                >
                  <option value="">{t('newWork.step2.unitDefault', { unit: translateUnit(typeMeta.unit_label, t) })}</option>
                  {unitOptions.map(u => (
                    <option key={u} value={u}>{translateUnit(u, t)}</option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}

        <Field label={t('workDetail.editFieldCover')}>
          <div className="flex items-start gap-3">
            {coverPreview && (
              <img src={coverPreview} alt={t('cover.preview')}
                   className="w-20 h-[107px] object-cover rounded border border-paper-200" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className={`${EDIT_FILE_CONTROL} flex-1`}
            />
          </div>
        </Field>

        <Field label={t('workDetail.editFieldTagsLabel', { n: tagIds.length })}>
          <TagPicker
            allTags={allTags}
            allGroups={tagGroups}
            selectedIds={tagIds}
            onChange={setTagIds}
            suggestedTags={suggestedTags}
          />
        </Field>

        <Field label={t('workDetail.editFieldCollectionsLabel', { n: collectionIds.length })}>
          {allCollections.length === 0 ? (
            <div className="text-xs text-ink-400 px-3 py-3 bg-paper-50 rounded border border-paper-200">
              {t('workDetail.editCollectionsEmpty')}
            </div>
          ) : (
            <div className="bg-paper-50 border border-paper-200 rounded-lg p-3">
              <div className="flex flex-wrap gap-1.5">
                {allCollections.map(c => (
                  <SelectableTagChip key={c.id} color={c.border_color} colored
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
      </div>
    </Modal>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[13px] font-semibold text-ink-700 mb-2 block">
        {label}
      </label>
      {children}
    </div>
  )
}