import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Star, ChevronRight, Settings as Cog } from 'lucide-react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'

/**
 * 收藏夹页（主要给移动端用）
 *
 * 桌面端依然走左侧 sidebar 列表;但手机底部 Tab 点"收藏夹"会进到这个页面,
 * 而不是再弹一个抽屉。在 PC 上访问这个 URL 也能 work,这样路由和 deep link 一致。
 */
export default function FavoritesPage() {
  const t = useT()
  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: api.listCollections,
  })

  return (
    <div className="max-w-[800px] mx-auto">
      <h1 className="text-2xl font-semibold mb-1 text-ink-900">{t('favorites.title')}</h1>
      <div className="text-sm text-ink-500 mb-5">{t('favorites.subtitle')}</div>

      {isLoading ? (
        <div className="text-ink-400 py-12 text-center text-sm">{t('common.loading')}</div>
      ) : collections.length === 0 ? (
        <div className="card p-8 flex flex-col items-center text-center gap-3">
          <Star size={28} className="text-ink-300" strokeWidth={1.5} />
          <div className="text-sm text-ink-500">{t('favorites.empty')}</div>
          <div className="text-xs text-ink-400">{t('favorites.emptyHint')}</div>
          <Link
            to="/settings?tab=collections"
            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium bg-brand-600 hover:bg-brand-700 !text-white hover:!text-white transition-colors"
          >
            <Cog size={14} /> {t('favorites.gotoSettings')}
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-paper-200 overflow-hidden">
          {collections.map(c => (
            <Link
              key={c.id}
              to={`/library?collection=${c.id}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-paper-50 transition-colors"
              style={{ borderLeft: `4px solid ${c.border_color}` }}
            >
              <span className="flex-1 text-base font-semibold text-ink-900 truncate">
                {c.name}
              </span>
              <span className="text-xs text-ink-400 tabular-nums flex-shrink-0">
                {t('favorites.workCount', { n: c.work_count })}
              </span>
              <ChevronRight size={16} className="text-ink-400 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
