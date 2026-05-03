// 日期与文本格式化

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function relativeDate(dateStr) {
  if (!dateStr) return ''
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((today - target) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  if (diff > 0 && diff < 7) return `${diff} 天前`
  return formatDate(dateStr)
}

// 格式化进度区间
export function formatRange(start, end, unitLabel) {
  if (start == null || end == null) return ''
  if (start === end) return `第 ${start} ${unitLabel}`
  return `第 ${start}-${end} ${unitLabel}`
}

// 评分显示
export function formatRating(r) {
  if (r == null) return '-'
  return Number(r).toFixed(1)
}

export function classNames(...xs) {
  return xs.filter(Boolean).join(' ')
}
