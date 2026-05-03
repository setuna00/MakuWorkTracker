import { useState } from 'react'
import { Star } from 'lucide-react'

/**
 * 1-10 颗星评分，0.5 步进
 */
export function StarRating({ value, onChange, size = 26, readonly = false }) {
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
      onChange?.(null)  // 再次点击同样分数 -> 清零
    } else {
      onChange?.(newVal)
    }
  }

  return (
    <div className="inline-flex items-center gap-3 flex-wrap">
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHover(null)}
      >
        {stars.map(s => (
          <div key={s.index} className="relative" style={{ width: size, height: size }}>
            <Star
              size={size}
              className="absolute inset-0 text-paper-300"
              strokeWidth={1.5}
            />
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
      {display > 0 && (
        <span className="text-base font-semibold tabular-nums text-ink-900">
          {display.toFixed(1)}<span className="text-ink-400 text-sm font-normal"> / 10</span>
        </span>
      )}
    </div>
  )
}
