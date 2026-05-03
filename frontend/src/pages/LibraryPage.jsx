import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Filter, X } from 'lucide-react'
import { api } from '../lib/api'
import { WorkCard, EmptyAddCard } from '../components/WorkCard'

export default function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterOpen, setFilterOpen] = useState(false)

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })

  const filters = {
    type: searchParams.get('type') || '',
    personal_status: searchParams.get('personal_status') || '',
    tag_id: searchParams.get('tag') || '',
    collection_id: searchParams.get('collection') || '',
    q: searchParams.get('q') || '',
    sort: searchParams.get('sort') || 'updated_at',
    order: searchParams.get('order') || 'desc',
  }

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const { data: works = [] } = useQuery({
    queryKey: ['works', filters],
    queryFn: () => api.listWorks(filters),
  })

  const getUnitLabel = (type) =>
    typesMeta.types?.find(t => t.value === type)?.unit_label || '集'

  const activeFilterCount = ['personal_status', 'tag_id', 'collection_id'].filter(k => filters[k]).length

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* 类型 Tab */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-hide">
        <TypeTab active={!filters.type} onClick={() => setFilter('type', '')}>全部</TypeTab>
        {typesMeta.types.map(t => (
          <TypeTab key={t.value} active={filters.type === t.value}
                   onClick={() => setFilter('type', t.value)}>
            {t.label}
          </TypeTab>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="text-sm text-ink-500">
          <span className="font-medium text-ink-900">{works.length}</span> 部作品
          {filters.q && <span className="ml-2">· 搜索 "{filters.q}"</span>}
        </div>
        <div className="flex items-center gap-2">
          <select value={`${filters.sort}:${filters.order}`}
                  onChange={(e) => {
                    const [sort, order] = e.target.value.split(':')
                    setFilter('sort', sort)
                    setFilter('order', order)
                  }}
                  className="!w-auto input-compact">
            <option value="updated_at:desc">最近更新</option>
            <option value="created_at:desc">最近创建</option>
            <option value="title:asc">标题 A-Z</option>
            <option value="rating:desc">评分降序</option>
          </select>
          <button onClick={() => setFilterOpen(o => !o)}
                  className={`px-3 py-1.5 rounded-md text-xs border flex items-center gap-1 transition-colors ${
                    filterOpen || activeFilterCount > 0
                      ? 'border-brand-600 text-brand-700 bg-brand-50'
                      : 'border-paper-300 hover:bg-paper-100'
                  }`}>
            <Filter size={12} /> 筛选
            {activeFilterCount > 0 && (
              <span className="bg-brand-600 text-white rounded-full px-1.5 text-[10px]">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="card p-5 mb-5 space-y-4">
          <FilterRow label="个人状态">
            <FilterChip active={!filters.personal_status} onClick={() => setFilter('personal_status', '')}>全部</FilterChip>
            {['want', 'watching', 'done', 'dropped'].map(s => (
              <FilterChip key={s} active={filters.personal_status === s}
                          onClick={() => setFilter('personal_status', s)}>
                {{want: '想看', watching: '在看', done: '看完', dropped: '弃坑'}[s]}
              </FilterChip>
            ))}
          </FilterRow>

          {tags.length > 0 && (
            <FilterRow label="标签">
              <FilterChip active={!filters.tag_id} onClick={() => setFilter('tag', '')}>全部</FilterChip>
              {tags.map(t => (
                <FilterChip key={t.id} active={filters.tag_id == t.id}
                            onClick={() => setFilter('tag', t.id)} color={t.color}>
                  {t.name}
                </FilterChip>
              ))}
            </FilterRow>
          )}

          {collections.length > 0 && (
            <FilterRow label="收藏夹">
              <FilterChip active={!filters.collection_id} onClick={() => setFilter('collection', '')}>全部</FilterChip>
              {collections.map(c => (
                <FilterChip key={c.id} active={filters.collection_id == c.id}
                            onClick={() => setFilter('collection', c.id)} color={c.border_color}>
                  {c.name}
                </FilterChip>
              ))}
            </FilterRow>
          )}

          {(filters.q || activeFilterCount > 0) && (
            <button onClick={() => setSearchParams({})}
                    className="text-xs text-ink-500 hover:text-brand-700 flex items-center gap-1 transition-colors">
              <X size={11} /> 清除所有筛选
            </button>
          )}
        </div>
      )}

      {/* 网格：末尾固定一个 + 卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-x-4 gap-y-6">
        {works.map(w => (
          <div key={w.id} className="w-full">
            <WorkCard work={w} mainWatching={null} unitLabel={getUnitLabel(w.type)} size="lg" />
          </div>
        ))}
        {/* 末尾的 + 卡片 - 始终显示 */}
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

function FilterRow({ label, children }) {
  return (
    <div>
      <div className="text-[11px] text-ink-500 mb-2 font-medium uppercase tracking-wider">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function FilterChip({ active, onClick, children, color }) {
  if (active) {
    return (
      <button onClick={onClick}
              className="px-2.5 py-1 rounded text-xs font-medium border text-white transition-colors"
              style={{
                background: color || '#2563eb',
                borderColor: color || '#2563eb',
              }}>
        {children}
      </button>
    )
  }
  return (
    <button onClick={onClick}
            className="px-2.5 py-1 rounded text-xs font-medium border transition-colors hover:opacity-80"
            style={color ? {
              background: color + '1a',
              color: color,
              borderColor: color + '40',
            } : {
              background: '#ffffff',
              color: '#334155',
              borderColor: '#cbd5e1',
            }}>
      {children}
    </button>
  )
}
