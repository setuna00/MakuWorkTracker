import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
import { Home, Library, Clock, Settings as Cog, Plus, ChevronDown, Search, Star } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'

const SIDEBAR_W = 220
const NAME_MAX_CHARS = 6  // 与 LibraryPage 保持一致

function truncate(s) {
  if (!s) return s
  return [...s].length > NAME_MAX_CHARS ? [...s].slice(0, NAME_MAX_CHARS).join('') + '…' : s
}

export function Layout({ children }) {
  const t = useT()
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [fabOpen, setFabOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  // 在二级页面（详情、创建、录入、设置）隐藏右下浮球，避免重复入口干扰
  const hideFab =
    location.pathname.startsWith('/works/') ||      // /works/new + /works/:id
    location.pathname === '/quick-record' ||
    location.pathname === '/settings'
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
    staleTime: 60 * 60 * 1000,
  })

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper-50">
      {/* ============ 桌面端左侧 sidebar ============ */}
      {/* PC 行为完全保持原样:导航 + 收藏夹折叠列表 + 底部设置入口 */}
      <aside
        className="hidden md:flex md:flex-col flex-shrink-0 border-r border-paper-200 bg-white sticky top-0 h-screen"
        style={{ width: SIDEBAR_W }}
      >
        <div className="h-[52px] px-5 flex items-center border-b border-paper-200">
          <Link to="/" className="font-semibold text-base text-brand-600 flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-brand-600 text-white flex items-center justify-center text-xs font-bold">作</span>
            {t('app.name')}
          </Link>
        </div>
        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <div className="text-[11px] text-ink-400 px-2 mb-2 uppercase tracking-wider">{t('nav.section')}</div>
          <NavItem to="/" icon={<Home size={15} />}>{t('nav.home')}</NavItem>
          <NavItem to="/library" icon={<Library size={15} />}>{t('nav.library')}</NavItem>
          <NavItem to="/timeline" icon={<Clock size={15} />}>{t('nav.timeline')}</NavItem>

          <div className="flex items-center justify-between px-2 mt-5 mb-2">
            <span className="text-[11px] text-ink-400 uppercase tracking-wider">{t('nav.favorites')}</span>
            <button onClick={() => setCollectionsOpen(o => !o)} className="text-ink-400 hover:text-ink-700">
              <ChevronDown size={12} className={collectionsOpen ? '' : '-rotate-90'} />
            </button>
          </div>
          {collectionsOpen && <>
            {collections.length === 0 && (
              <div className="px-2 text-[11px] text-ink-400 italic">{t('nav.noFavorites')}</div>
            )}
            {collections.map(c => (
              <Link
                key={c.id}
                to={`/library?collection=${c.id}`}
                title={c.name}
                className="block py-1.5 px-2 text-[13px] text-ink-700 rounded hover:bg-brand-50 hover:text-brand-700 transition-colors mb-0.5 truncate"
                style={{ borderLeft: `3px solid ${c.border_color}` }}
              >
                {c.name}
              </Link>
            ))}
          </>}
        </div>
        <div className="border-t border-paper-200 px-3 py-3">
          <NavLink to="/settings" className="flex items-center gap-2 px-2 py-2 rounded-md text-[13px] transition-colors text-ink-700 hover:bg-paper-100">
            <Cog size={15} /> {t('nav.settings')}
          </NavLink>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-paper-200 h-[52px] px-4 md:px-8 lg:px-10 flex items-center gap-3">
          <Link to="/" className="md:hidden font-medium text-brand-600">{t('app.name')}</Link>
          <div className="flex-1 flex items-center justify-end">
            <LibrarySearch navigate={navigate} tags={tags} collections={collections} typesMeta={typesMeta} />
          </div>
        </div>
        <div className="px-4 md:px-8 lg:px-10 py-5 md:py-6 mobile-content-bottom-pad md:pb-6 flex-1">{children}</div>
      </main>

      {/*
       * ============ 移动端底部 Tab Bar ============
       * 之前:收藏夹是一个按钮 (TabButton),会弹出侧边抽屉,而且因为不是 NavLink
       *      所以它无法显示 active 高亮 —— 这就是图里"颜色和其他不一样"的由来。
       * 现在:全部统一用 TabItem (NavLink),收藏夹去自己的 /favorites 页。
       * 桌面端那个 sidebar 折叠列表完全没动,所以 PC 行为不受影响。
       */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-paper-200 z-30 mobile-bottom-nav">
        <div className="mobile-bottom-nav-inner grid grid-cols-5">
          <TabItem to="/" icon={<Home size={22} />} label={t('nav.home')} />
          <TabItem to="/library" icon={<Library size={22} />} label={t('nav.library')} />
          <TabItem to="/favorites" icon={<Star size={22} />} label={t('nav.favorites')} />
          <TabItem to="/timeline" icon={<Clock size={22} />} label={t('nav.timeline')} />
          <TabItem to="/settings" icon={<Cog size={22} />} label={t('nav.settings')} />
        </div>
      </nav>

      {!hideFab && (
        <div className="fixed right-5 mobile-fab-bottom md:bottom-6 z-40">
          {fabOpen && (
            <div className="absolute bottom-full mb-2 right-0 bg-white border border-paper-200 rounded-lg shadow-xl overflow-hidden min-w-[170px]">
              <button
                onClick={() => { setFabOpen(false); navigate('/works/new') }}
                className="block w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 hover:text-brand-700 border-b border-paper-200 transition-colors"
              >
                {t('fab.newWork')}
              </button>
              <button
                onClick={() => { setFabOpen(false); navigate('/quick-record') }}
                className="block w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 hover:text-brand-700 transition-colors"
              >
                {t('fab.quickRecord')}
              </button>
            </div>
          )}
          <button
            onClick={() => setFabOpen(o => !o)}
            className="w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 flex items-center justify-center transition-all"
            style={{ transform: fabOpen ? 'rotate(45deg)' : 'none' }}
          >
            <Plus size={24} />
          </button>
        </div>
      )}
    </div>
  )
}

function LibrarySearch({ navigate, tags, collections, typesMeta }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const creatorKeys = useMemo(() => {
    const keys = new Set()
    for (const ty of typesMeta.types || []) {
      for (const f of ty.creator_fields || []) keys.add(f.key)
    }
    return [...keys]
  }, [typesMeta.types])

  const grammar = [
    { key: '$tag:', label: t('search.grammar.tag'), values: tags.map(x => x.name) },
    { key: '$favorites:', label: t('search.grammar.favorites'), values: collections.map(c => c.name) },
    { key: '$author:', label: t('search.grammar.author'), values: [] },
    { key: '$director:', label: t('search.grammar.director'), values: [] },
    ...creatorKeys
      .filter(k => !['author', 'director'].includes(k))
      .map(k => ({ key: `$${k}:`, label: k, values: [] })),
  ]

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const activeToken = query.match(/(^|\s)(\$\w+:[^\s]*)$/)?.[2] || ''
  const activeKey = activeToken.includes(':') ? activeToken.split(':')[0] + ':' : ''
  const activeValue = activeToken.includes(':') ? activeToken.split(':')[1] : ''
  const activeGrammar = grammar.find(g => g.key === activeKey)
  const valueSuggestions = (activeGrammar?.values || [])
    .filter(v => v.toLowerCase().includes(activeValue.toLowerCase()))
    .slice(0, 12)

  const submit = () => {
    if (!query.trim()) return
    navigate('/library?q=' + encodeURIComponent(query.trim()))
    setOpen(false)
  }
  const insertSyntax = (token) => {
    const trimmed = query.trimEnd()
    setQuery(trimmed + (trimmed ? ' ' : '') + token)
    setOpen(true)
  }
  const insertValue = (value) => {
    if (!activeToken) return
    const escapedKey = activeKey.replace('$', '\\$')
    const finalQuery = query.replace(new RegExp(`${escapedKey}[^\\s]*$`), `${activeKey}${value}`)
    setQuery(finalQuery + ' ')
    setOpen(false)
    if (finalQuery.trim()) {
      navigate('/library?q=' + encodeURIComponent(finalQuery.trim()))
    }
  }

  return (
    <div ref={ref} className="relative w-full max-w-xs md:max-w-md">
      <Search size={14} className="absolute left-3 top-3 text-ink-400 pointer-events-none" />
      <input
        type="search"
        placeholder={t('search.placeholder')}
        className="input-compact !pl-9"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {open && (
        <div className="absolute z-30 top-full mt-1 w-full bg-white border border-paper-200 rounded-md shadow-lg p-2 space-y-2 max-h-[70vh] overflow-y-auto">
          <div className="text-[11px] text-ink-500">{t('search.advancedHint')}</div>
          <div className="flex flex-wrap gap-1.5">
            {grammar.map(g => (
              <button
                key={g.key}
                onClick={() => insertSyntax(g.key)}
                className="px-2 py-1 text-xs rounded border border-paper-300 hover:border-brand-500 hover:text-brand-700"
              >
                {g.key} - {g.label}
              </button>
            ))}
          </div>

          {activeGrammar && (
            <div>
              <div className="text-[11px] text-ink-500 mb-1">{t('search.matchLabel', { label: activeGrammar.label })}</div>
              {valueSuggestions.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {valueSuggestions.map(v => (
                    <button
                      key={v}
                      onClick={() => insertValue(v)}
                      title={v}
                      className="w-full text-left px-2 py-1 text-xs rounded border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 truncate"
                    >
                      {truncate(v)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-ink-400">{t('search.continueTyping')}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NavItem({ to, icon, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] mb-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1 ${
          isActive
            ? 'bg-brand-600 text-white visited:text-white font-medium border border-transparent [&_svg]:text-white'
            : 'text-ink-700 visited:text-ink-700 hover:bg-paper-100 border border-transparent'
        }`
      }
    >
      {icon} {children}
    </NavLink>
  )
}

function TabItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
          isActive ? 'text-brand-600' : 'text-ink-500'
        }`
      }
    >
      {icon}
      <span className="text-[11px]">{label}</span>
    </NavLink>
  )
}