/**
 * Tag chip - bangumi 风格简约样式
 *
 * Props:
 *   color: 主题色（hex）。默认不上色（灰底黑字）；传 colored 才使用 color
 *   colored: 是否启用颜色（收藏夹用 true，标签用 false）
 *   children: 文字
 *   onClick: 点击事件
 *   className
 */
export function TagChip({ color = '#64748b', colored = false, children, onClick, className = '', title }) {
  const interactive = !!onClick
  const baseCls = `inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded font-medium leading-relaxed border transition-colors ${interactive ? 'cursor-pointer hover:opacity-80' : ''} ${className}`

  if (colored) {
    return (
      <span
        onClick={onClick}
        title={title}
        className={baseCls}
        style={{
          background: color + '1a',
          color: color,
          borderColor: color + '40',
        }}
      >
        {children}
      </span>
    )
  }

  // 默认 bangumi 风：浅灰底 + 中性文字 + 细边框
  return (
    <span
      onClick={onClick}
      title={title}
      className={`${baseCls} bg-paper-100 text-ink-700 border-paper-300 hover:border-brand-400 hover:text-brand-700`}
    >
      {children}
    </span>
  )
}

/**
 * 可点击的 chip（用在选择面板）：选中时实心蓝底白字
 *   color: 主题色（仅未选中且 colored 时用作色相提示）
 *   colored: 同上
 *   selected
 */
export function SelectableTagChip({ color = '#64748b', colored = false, selected, children, onClick }) {
  if (selected) {
    return (
      <span
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded font-medium leading-tight border cursor-pointer transition-all bg-brand-600 border-brand-600 text-white"
      >
        ✓ {children}
      </span>
    )
  }

  if (colored) {
    return (
      <span
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded font-medium leading-tight border cursor-pointer transition-all hover:opacity-80"
        style={{
          background: color + '1a',
          color: color,
          borderColor: color + '40',
        }}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded font-medium leading-tight border cursor-pointer transition-colors bg-paper-100 text-ink-700 border-paper-300 hover:border-brand-400 hover:text-brand-700"
    >
      {children}
    </span>
  )
}
