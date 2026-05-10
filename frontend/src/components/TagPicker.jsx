import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { match as pinyinMatch } from 'pinyin-pro'
import { SelectableTagChip } from './TagChip'
import { useT } from '../lib/i18n'

/**
 * 三向匹配：
 *   1. 主名/别名直接子串（小写比较）—— 中文/英文输入直接命中
 *   2. 主名/别名的拼音匹配 —— 用 pinyin-pro 的 match 函数
 *      （match 既支持全拼也支持首字母，且自动 lowercase）
 * 任一向命中即返回 true。
 */
function tagMatchesQuery(tag, query) {
  if (!query) return true
  const q = query.trim().toLowerCase()
  if (!q) return true

  const candidates = [tag.name, ...(tag.aliases || [])]

  for (const cand of candidates) {
    if (!cand) continue
    const lower = cand.toLowerCase()

    // 1. 直接子串
    if (lower.includes(q)) return true

    // 2. 拼音匹配（pinyin-pro 的 match 对纯英文 cand 也安全：会按字母对照，结果等同子串）
    //    注意：纯 ASCII query 才走拼音（避免中文 query 时 match 内部把中文当拼音找）
    if (/^[a-z0-9]+$/i.test(q)) {
      const result = pinyinMatch(cand, q, { precision: 'any' })
      if (result !== null) return true
    }
  }

  return false
}

export function TagPicker({
  allTags = [],
  allGroups = [],
  selectedIds = [],
  onChange,
  suggestedTags = [],
}) {
  const t = useT()
  const [query, setQuery] = useState('')

  // 已选 id 集合，O(1) 查询
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // 按 group_id 分组（已 sort）
  const tagsByGroup = useMemo(() => {
    const map = {}

    for (const tg of allTags) {
      const gid = tg.group_id
      if (gid == null) continue
      if (!map[gid]) map[gid] = []
      map[gid].push(tg)
    }

    for (const gid in map) {
      map[gid].sort((a, b) => a.name.localeCompare(b.name))
    }

    return map
  }, [allTags])

  // groups 按 sort_order 排序（后端已经按 sort_order 返回，但保险再排一次）
  const sortedGroups = useMemo(
    () => [...allGroups].sort((a, b) => a.sort_order - b.sort_order),
    [allGroups]
  )

  // 推荐区：filter 掉已选，再按 query filter
  const visibleSuggested = useMemo(() => {
    return suggestedTags.filter(tg =>
      !selectedSet.has(tg.id) && tagMatchesQuery(tg, query)
    )
  }, [suggestedTags, selectedSet, query])

  // 切 tag 选中
  const toggle = (id) => {
    if (!onChange) return

    onChange(
      selectedSet.has(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id]
    )

    if (query) setQuery('')
  }

  // ESC 清空搜索
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && query) {
      e.preventDefault()
      setQuery('')
    }
  }

  // 搜索时，某组所有 chip 都不命中且没有已选的 chip 在其中 → 隐藏整组
  const isGroupVisible = (gid) => {
    const groupTags = tagsByGroup[gid] || []
    if (groupTags.length === 0) return false
    if (!query) return true

    // 有搜索时：组内有任一命中 OR 有任一已选（AK2：已选 chip 永远显示）
    return groupTags.some(tg => tagMatchesQuery(tg, query) || selectedSet.has(tg.id))
  }

  // 全空状态
  const hasAnyVisibleTag =
    sortedGroups.some(g => isGroupVisible(g.id)) ||
    visibleSuggested.length > 0

  // 整体没 tag（连推荐都没）
  if (allTags.length === 0) {
    return (
      <div className="text-sm text-ink-400 px-4 py-4 bg-paper-50 rounded-lg border border-paper-200">
        {t('tagPicker.noTagsYet')}
      </div>
    )
  }

  return (
    <div className="bg-paper-50 border border-paper-200 rounded-xl p-4">
      {/* 搜索框 */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('tagPicker.searchPlaceholder')}
          className="w-full !pl-9 !pr-9 py-2 text-sm bg-white border border-paper-300 rounded-lg focus:border-brand-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            title={t('tagPicker.clearSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-paper-200 rounded text-ink-500"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* 分组渲染 */}
      {!hasAnyVisibleTag && query && (
        <div className="text-sm text-ink-400 text-center py-6">
          {t('tagPicker.noMatch')}
        </div>
      )}

      <div className="space-y-3">
        {sortedGroups.map(g => {
          if (!isGroupVisible(g.id)) return null
          const groupTags = tagsByGroup[g.id] || []

          return (
            <div key={g.id}>
              <div className="text-[11px] text-ink-500 mb-1.5 uppercase tracking-wider">
                {g.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groupTags.map(tg => {
                  const matches = tagMatchesQuery(tg, query)
                  const isSelected = selectedSet.has(tg.id)

                  // AK2：已选 chip 永远显示
                  if (!matches && !isSelected) return null

                  return (
                    <SelectableTagChip
                      key={tg.id}
                      selected={isSelected}
                      onClick={() => toggle(tg.id)}
                    >
                      {tg.name}
                    </SelectableTagChip>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 推荐区 */}
      {suggestedTags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-paper-200">
          <div className="text-[11px] text-ink-500 mb-2 uppercase tracking-wider">
            {t('newWork.tagSuggestions')}
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {visibleSuggested.map(tg => (
              <SelectableTagChip
                key={tg.id}
                selected={false}
                onClick={() => toggle(tg.id)}
              >
                + {tg.name}
              </SelectableTagChip>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
