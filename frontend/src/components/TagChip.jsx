/**
 * Tag chip - 参考 asmr.one 风格：
 * - 圆角较小的矩形（不是椭圆）
 * - 浅色填充 + 同色调深一档的文字
 * - 边框很轻
 *
 * Props:
 *   color: 主题色（hex）
 *   children: 文字
 *   onClick: 点击事件
 *   removable: 是否显示删除按钮
 *   onRemove
 */
export function TagChip({ color = '#64748b', children, onClick, className = '' }) {
  // 用 hex 颜色生成浅色背景：bg = color + '1a' (10%), text = color
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded font-medium leading-relaxed border transition-colors ${onClick ? 'cursor-pointer hover:opacity-80' : ''} ${className}`}
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

/**
 * 可点击的 Tag chip（用在选择面板）：选中时纯色填充
 */
export function SelectableTagChip({ color = '#64748b', selected, children, onClick }) {
  if (selected) {
    return (
      <span
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded font-medium leading-tight border cursor-pointer transition-all text-white"
        style={{ background: color, borderColor: color }}
      >
        ✓ {children}
      </span>
    )
  }
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
