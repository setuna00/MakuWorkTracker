import { Link } from 'react-router-dom'
import { Plus, Star } from 'lucide-react'
import { coverUrl } from '../lib/api'
import { useT, translateType } from '../lib/i18n'

export function WorkCard({ work, mainWatching, onQuickAdd, unitLabel, size = 'md' }) {
  const t = useT()
  const sizeMap = {
    sm: 'w-[120px]',
    md: 'w-[160px]',
    lg: 'w-[180px]',
  }

  const progress = mainWatching?.current_progress
  const total = work.total_units
  const rating = mainWatching?.rating

  const chipClass = work.cover_thumb_path
    ? "absolute top-1.5 left-1.5 z-[1] px-2 py-0.5 text-[12px] font-medium tracking-wide rounded bg-black/75 text-white border border-white/30 shadow-sm pointer-events-none"
    : "absolute top-1.5 left-1.5 z-[1] px-2 py-0.5 text-[12px] font-medium tracking-wide rounded bg-paper-200 text-ink-700 border border-paper-300 pointer-events-none"

  return (
    <div className={`flex-shrink-0 ${sizeMap[size]} relative group`}>
      <span className={chipClass}>
        {translateType(work.type, t)}
      </span>
      <Link to={`/works/${work.id}`}
            className="block hover:scale-[1.02] transition-transform">
        <div className="aspect-[3/4] bg-paper-100 rounded-lg overflow-hidden mb-2 border border-paper-200 group-hover:border-brand-300 group-hover:shadow-cardHover transition-all">
          {work.cover_thumb_path ? (
            <img src={coverUrl(work.cover_thumb_path)}
                 className="w-full h-full object-cover"
                 alt={work.title}
                 loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-300 text-2xl">
              📺
            </div>
          )}
        </div>
        <div className="text-[13px] font-medium leading-tight line-clamp-2 group-hover:text-brand-700 transition-colors">
          {work.title}
        </div>
        <div className="text-[12px] text-ink-600 mt-1 flex items-center gap-1.5">
          {progress != null && (
            <span className="tabular-nums">{progress}{total ? `/${total}` : ''}{unitLabel ? ` ${unitLabel}` : ''}</span>
          )}
          {rating != null && (
            <>
              {progress != null && <span className="text-ink-300">·</span>}
              <span className="flex items-center gap-0.5 text-amber-700 font-medium tabular-nums">
                <Star size={11} className="fill-amber-400 text-amber-400" />
                {Number(rating).toFixed(1)}
              </span>
            </>
          )}
          {progress == null && rating == null && (
            <span className="text-ink-400">{t('card.notStarted')}</span>
          )}
        </div>
      </Link>
      {onQuickAdd && (
        <button
          onClick={(e) => { e.preventDefault(); onQuickAdd() }}
          className="hidden md:flex absolute top-2 right-2 w-7 h-7 rounded-full bg-brand-600/90 hover:bg-brand-700 text-white items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          title={t('card.quickRecord')}
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}

/**
 * 作品库末尾的 + 卡片，跳转新建作品页
 */
export function EmptyAddCard() {
  const t = useT()
  return (
    <Link to="/works/new"
          className="block w-full group">
      <div className="aspect-[3/4] rounded-lg border-2 border-dashed border-paper-300 hover:border-brand-500 bg-paper-50 hover:bg-brand-50 flex flex-col items-center justify-center gap-2 text-ink-400 hover:text-brand-600 transition-all mb-2">
        <Plus size={32} strokeWidth={1.5} />
        <div className="text-xs font-medium">{t('card.newWork')}</div>
      </div>
    </Link>
  )
}

export const HorizontalCard = WorkCard
export const GridCard = WorkCard