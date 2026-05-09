import { useState } from 'react'
import { Star } from 'lucide-react'

/**
 * 1-10 颗星评分，0.5 步进
 *
 * Props:
 *   value:         当前分数（null/undefined 表示未评分）
 *   onChange:      分数变化回调；再次点击当前分数会清零（传 null）
 *   size:          单颗星尺寸（px）
 *   readonly:      只读模式
 *   showScore:     是否显示分数文本
 *   scorePosition: 'right' | 'bottom' | 'none'
 *                  父级如果想完全自定义布局，传 'none' 自行渲染分数
 *   className:     容器类名
 */
export function StarRating({
  value,
  onChange,
  size = 20,
  readonly = false,
  showScore = true,
  scorePosition = 'right',
  className = '',
}) {
  const [hover, setHover] = useState(null)

  const display = hover ?? value ?? 0
  const stars = []

  for (let i = 1; i <= 10; i++) {
    const filled = display >= i
    const half = !filled && display >= i - 0.5
    stars.push({ index: i, filled, half })
  }

  const handleClick = (i, isLeft) => {
    if (readonly) return
    const newVal = isLeft ? i - 0.5 : i
    if (newVal === value) {
      onChange?.(null) // 再次点击同样分数 -> 清零
    } else {
      onChange?.(newVal)
    }
  }

  const scoreNum = display > 0 ? display.toFixed(1) : '0'

  const starsRow = (
    <div
      className="flex flex-nowrap items-center gap-0.5"
      onMouseLeave={() => setHover(null)}
    >
      {stars.map(s => (
        <div key={s.index} className="relative" style={{ width: size, height: size }}>
          <Star size={size} className="absolute inset-0 text-paper-300" strokeWidth={1.5} />
          {(s.filled || s.half) && (
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: s.half ? size / 2 : size }}
            >
              <Star
                size={size}
                className="text-amber-400 fill-amber-400"
                strokeWidth={1.5}
              />
            </div>
          )}
          {!readonly && (
            <>
              <div
                className="absolute top-0 left-0 h-full cursor-pointer"
                style={{ width: size / 2 }}
                onMouseEnter={() => setHover(s.index - 0.5)}
                onClick={() => handleClick(s.index, true)}
              />
              <div
                className="absolute top-0 right-0 h-full cursor-pointer"
                style={{ width: size / 2 }}
                onMouseEnter={() => setHover(s.index)}
                onClick={() => handleClick(s.index, false)}
              />
            </>
          )}
        </div>
      ))}
    </div>
  )

  if (!showScore || scorePosition === 'none') {
    return <div className={className}>{starsRow}</div>
  }

  if (scorePosition === 'bottom') {
    return (
      <div className={`flex flex-col items-center gap-1.5 ${className}`.trim()}>
        {starsRow}
        <div className="text-base font-semibold tabular-nums">
          <span className={display > 0 ? 'text-amber-500' : 'text-ink-400'}>
            {scoreNum}
          </span>
          <span className="text-ink-400 font-medium"> / 10</span>
        </div>
      </div>
    )
  }

  // 默认 right
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      {starsRow}
      <div className="text-sm font-semibold tabular-nums text-ink-700 whitespace-nowrap">
        {scoreNum} / 10
      </div>
    </div>
  )
}
