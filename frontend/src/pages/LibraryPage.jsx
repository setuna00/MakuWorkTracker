import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Filter, X, ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '../lib/api'
import { resolveUnitLabel } from '../lib/format'
import { useT, translateType, translateStatus, translateUnit } from '../lib/i18n'
import { WorkCard, EmptyAddCard } from '../components/WorkCard'

// 标签/收藏夹名超过这个字数会被截断（hover 看完整）
const NAME_MAX_CHARS = 6

function truncate(s) {
  if (!s) return s
  return [...s].length > NAME_MAX_CHARS ? [...s].slice(0, NAME_MAX_CHARS).join('') + '…' : s
}

export default function LibraryPage() {
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterOpen, setFilterOpen] = useState(false)

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })
  const { data: tags = [] } = useQuery({
    queryKey: ['tags', { in_collection: searchParams.get('collection') }],
    queryFn: () => api.listTags({ in_collection: searchParams.get('collection') }),
  })
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })
  const { data: tagGroups = [] } = useQuery({ queryKey: ['tagGroups'], queryFn: api.listTagGroups })

  const tagIds = searchParams.getAll('tag').map(s => Number(s)).filter(n => !Number.isNaN(n))

  const filters = {
    type: searchParams.get('type') || '',
    personal_status: searchParams.get('personal_status') || '',
    tag_id: tagIds,
    collection_id: searchParams.get('collection') || '',
    q: searchParams.get('q') || '',
    sort: searchParams.get('sort') || 'updated_at',
    order: searchParams.get('order') || 'desc',
    active_month: searchParams.get('active') || '',
    new_month: searchParams.get('new') || '',
  }

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const toggleTag = (id) => {
    const next = new URLSearchParams(searchParams)
    const current = next.getAll('tag')
    next.delete('tag')
    if (current.includes(String(id))) {
      current.filter(x => x !== String(id)).forEach(x => next.append('tag', x))
    } else {
      current.forEach(x => next.append('tag', x))
      next.append('tag', String(id))
    }
    setSearchParams(next)
  }

  const clearTags = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('tag')
    setSearchParams(next)
  }

  const { data: works = [] } = useQuery({
    queryKey: ['works', filters],
    queryFn: () => api.listWorks(filters),
  })

  // 单位:作品的 unit_label 优先,fallback 到类型默认。然后跑 i18n 翻译。
  const getUnitLabel = (work) => translateUnit(resolveUnitLabel(work, typesMeta), t)

  const activeFilterCount =
    (filters.personal_status ? 1 : 0) +
    tagIds.length

  const activeCollection = filters.collection_id
    ? collections.find(c => String(c.id) === String(filters.collection_id))
    : null

  return (
    <div className="max-w-[1400px] mx-auto">
      <h1
        className="text-2xl font-semibold mb-5 text-ink-900"
        style={
          activeCollection ? { color: activeCollection.border_color } : undefined
        }
      >
        {activeCollection ? activeCollection.name : t('library.title')}
      </h1>

      {/* 类型 Tab */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-hide">
        <TypeTab active={!filters.type} onClick={() => setFilter('type', '')}>{t('common.all')}</TypeTab>
        {typesMeta.types.map(ty => (
          <TypeTab key={ty.value} active={filters.type === ty.value}
                   onClick={() => setFilter('type', ty.value)}>
            {translateType(ty.value, t)}
          </TypeTab>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="text-sm text-ink-500">
          <span className="font-medium text-ink-900">{works.length}</span> {t('library.countSuffix')}
          {filters.q && <span className="ml-2">{t('library.searchSuffix', { q: filters.q })}</span>}
        </div>
        <div className="flex items-center gap-2">
          <select value={filters.sort}
                  onChange={(e) => setFilter('sort', e.target.value)}
                  className="!w-auto input-compact">
            <option value="updated_at">{t('library.sort.updated')}</option>
            <option value="created_at">{t('library.sort.created')}</option>
            <option value="title">{t('library.sort.title')}</option>
            <option value="rating">{t('library.sort.rating')}</option>
            <option value="last_progress">{t('library.sort.lastProgress')}</option>
          </select>
          <button
            onClick={() => setFilter('order', filters.order === 'desc' ? 'asc' : 'desc')}
            className="p-1.5 rounded-md border border-paper-300 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            title={filters.order === 'desc' ? t('common.sortDesc') : t('common.sortAsc')}
            aria-label={filters.order === 'desc' ? t('common.sortDesc') : t('common.sortAsc')}
          >
            {filters.order === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
          </button>
          <button onClick={() => setFilterOpen(o => !o)}
                  className={`px-3 py-1.5 rounded-md text-xs border flex items-center gap-1 transition-colors ${
                    filterOpen || activeFilterCount > 0
                      ? 'border-brand-600 text-brand-700 bg-brand-50'
                      : 'border-paper-300 hover:bg-paper-100'
                  }`}>
            <Filter size={12} /> {t('library.filter')}
            {activeFilterCount > 0 && (
              <span className="bg-brand-600 text-white rounded-full px-1.5 text-[10px]">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="card p-4 md:p-6 mb-5 space-y-4 md:space-y-5">
          <FilterRow label={t('library.filter.personalStatus')}>
            <FilterChip active={!filters.personal_status} onClick={() => setFilter('personal_status', '')}>{t('common.all')}</FilterChip>
            {['want', 'watching', 'on_hold', 'done', 'dropped'].map(s => (
              <FilterChip key={s} active={filters.personal_status === s}
                          onClick={() => setFilter('personal_status', s)}>
                {translateStatus(s, t)}
              </FilterChip>
            ))}
          </FilterRow>

          {tags.length > 0 && (
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-ink-800 font-semibold">
                  {tagIds.length > 0
                    ? t('library.filter.tagsSelected', { n: tagIds.length })
                    : t('library.filter.tags')}
                </div>
              </div>
              <TagGroupedList
                tags={tags}
                tagGroups={tagGroups}
                tagIds={tagIds}
                toggleTag={toggleTag}
              />
            </div>
          )}

          {tagIds.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={clearTags}
                className="text-xs md:text-[13px] text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg px-2 py-1 md:px-2.5 md:py-1.5 flex items-center gap-1 transition-colors"
              >
                <X size={12} /> 清除筛选
              </button>
            </div>
          )}
        </div>
      )}

      {(filters.active_month || filters.new_month) && (
        <div className="mb-4 px-3 py-2 bg-brand-50 border border-brand-200 rounded text-sm text-brand-700 flex items-center justify-between">
          <span>
            {filters.active_month
              ? t('library.filter.activeMonth', { month: filters.active_month })
              : t('library.filter.newMonth', { month: filters.new_month })}
          </span>
          <Link to="/library" className="text-xs text-brand-600 hover:underline">{t('common.clear')}</Link>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-6">
        {works.map(w => (
          <div key={w.id} className="w-full">
            <WorkCard work={w} mainWatching={w.main_watching} unitLabel={getUnitLabel(w)} size="lg" />
          </div>
        ))}
        <div className="w-full">
          <EmptyAddCard />
        </div>
      </div>
    </div>
  )
}

function TypeTab({ active, children, onClick }) {
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

function FilterRow({ label, children, extra }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-ink-800 font-semibold">{label}</div>
        {extra}
      </div>
      <div className="flex flex-wrap gap-1.5 md:gap-2">{children}</div>
    </div>
  )
}

function FilterChip({ active, onClick, children, title }) {
  if (active) {
    return (
      <button onClick={onClick} title={title}
              className="px-2.5 py-1 rounded-md text-xs md:px-3 md:py-1.5 md:rounded-lg md:text-[13px] font-medium border transition-colors bg-brand-600 border-brand-600 text-white shadow-sm">
        {children}
      </button>
    )
  }
  return (
    <button onClick={onClick} title={title}
            className="px-2.5 py-1 rounded-md text-xs md:px-3 md:py-1.5 md:rounded-lg md:text-[13px] font-medium border transition-colors bg-white text-ink-700 border-paper-300 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50">
      {children}
    </button>
  )
}

function TagGroupedList({ tags, tagGroups, tagIds, toggleTag }) {
  // 按 group_id 分桶。group_id 为 null 的归入默认组。
  // 找到默认组 id 作为 null 的归属。
  const defaultGroupId = tagGroups.find(g => g.is_default)?.id ?? null

  // 按 sort_order 排序的 group 列表
  const orderedGroups = [...tagGroups].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // 把 tags 按 group_id 分桶
  const tagsByGroup = {}
  for (const ta of tags) {
    const gid = ta.group_id ?? defaultGroupId
    if (!tagsByGroup[gid]) tagsByGroup[gid] = []
    tagsByGroup[gid].push(ta)
  }

  // 如果只有一个分组（无论是不是默认组），不显示分组标题，平铺
  const showGroupLabels = orderedGroups.length > 1

  // 只渲染有 tag 的分组
  const groupsWithTags = orderedGroups.filter(g => (tagsByGroup[g.id] || []).length > 0)

  // 兜底：如果 tagGroups 还没加载（首次渲染），就把所有 tag 平铺
  if (groupsWithTags.length === 0) {
    return (
      <div className="flex flex-wrap gap-1.5 md:gap-2">
        {tags.map(ta => (
          <FilterChip
            key={ta.id}
            active={tagIds.includes(ta.id)}
            onClick={() => toggleTag(ta.id)}
            title={`${ta.name} (${ta.work_count})`}
          >
            {truncate(ta.name)}
            <span className={`ml-1 text-[10px] md:text-[11px] ${tagIds.includes(ta.id) ? 'opacity-80' : 'text-ink-400'}`}>
              {ta.work_count}
            </span>
          </FilterChip>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {groupsWithTags.map(g => (
        <div key={g.id}>
          {showGroupLabels && (
            <div className="text-xs text-ink-500 mb-1.5 md:mb-2 font-semibold">{g.name}</div>
          )}
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {(tagsByGroup[g.id] || []).map(ta => (
              <FilterChip
                key={ta.id}
                active={tagIds.includes(ta.id)}
                onClick={() => toggleTag(ta.id)}
                title={`${ta.name} (${ta.work_count})`}
              >
                {truncate(ta.name)}
                <span className={`ml-1 text-[10px] md:text-[11px] ${tagIds.includes(ta.id) ? 'opacity-80' : 'text-ink-400'}`}>
                  {ta.work_count}
                </span>
              </FilterChip>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
