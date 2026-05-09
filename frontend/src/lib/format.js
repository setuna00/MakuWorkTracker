// 日期与文本格式化 / date + text formatting

import { useLocaleStore } from './i18n'

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 相对日期。从 store 同步读 locale —— 这样普通函数也能用，无需做成 hook。
export function relativeDate(dateStr) {
  if (!dateStr) return ''
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((today - target) / 86400000)
  const locale = useLocaleStore.getState().locale
  if (locale === 'en') {
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff === 2) return '2 days ago'
    if (diff > 0 && diff < 7) return `${diff} days ago`
    return formatDate(dateStr)
  }
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  if (diff > 0 && diff < 7) return `${diff} 天前`
  return formatDate(dateStr)
}

/**
 * 格式化进度区间。
 *   中文: 第 5 集 / 第 5-7 集
 *   英文: ep 5    / ep 5-7
 * 词序不一样,所以直接分支拼字串。空 unitLabel 时只显示数字。
 */
export function formatRange(start, end, unitLabel) {
  if (start == null || end == null) return ''
  const locale = useLocaleStore.getState().locale
  if (locale === 'en') {
    const u = unitLabel || ''
    if (start === end) return u ? `${u} ${start}` : `${start}`
    return u ? `${u} ${start}-${end}` : `${start}-${end}`
  }
  if (start === end) return `第 ${start} ${unitLabel}`
  return `第 ${start}-${end} ${unitLabel}`
}

export function formatRating(r) {
  if (r == null) return '-'
  return Number(r).toFixed(1)
}

export function resolveUnitLabel(work, typesMeta) {
  if (work?.unit_label) return work.unit_label
  const t = typesMeta?.types?.find(x => x.value === work?.type)
  return t?.unit_label || '集'
}

export function classNames(...xs) {
  return xs.filter(Boolean).join(' ')
}
