import { Sparkles, Tv, Clapperboard, BookImage, BookText, Shapes } from 'lucide-react'
import { useT, translateType } from '../lib/i18n'

// 作品类型的颜色 + 图标，卡片、详情页等处共用，一眼就能区分类型。
// 避开主色蓝(brand)和评分用的琥珀色；颜色够深，白字可读
export const TYPE_STYLES = {
  anime: { color: '#D4537E', Icon: Sparkles },
  tv: { color: '#534AB7', Icon: Tv },
  movie: { color: '#185FA5', Icon: Clapperboard },
  manga: { color: '#D85A30', Icon: BookImage },
  novel: { color: '#0F6E56', Icon: BookText },
  other: { color: '#5F5E5A', Icon: Shapes },
}

export function TypeBadge({ type, size = 'md', className = '' }) {
  const t = useT()
  const { color, Icon } = TYPE_STYLES[type] || TYPE_STYLES.other
  const sizes = {
    sm: { box: 'gap-0.5 px-1.5 py-px text-[11px] leading-4', icon: 11 },
    md: { box: 'gap-1 px-1.5 py-0.5 text-[12px] leading-4', icon: 12 },
  }
  const s = sizes[size]
  return (
    <span
      className={`inline-flex items-center font-medium tracking-wide rounded text-white border border-white/35 shadow-sm whitespace-nowrap ${s.box} ${className}`}
      style={{ backgroundColor: color }}
    >
      <Icon size={s.icon} strokeWidth={2.25} className="flex-shrink-0" aria-hidden="true" />
      {translateType(type, t)}
    </span>
  )
}
