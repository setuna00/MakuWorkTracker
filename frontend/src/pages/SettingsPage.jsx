import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, Save, Download, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useT, useLocaleStore, SUPPORTED_LOCALES } from '../lib/i18n'
import { Button, ConfirmDialog, Modal } from '../components/Modal'
import { TagChip } from '../components/TagChip'

const SETTINGS_SECTIONS = ['tags', 'collections', 'appearance', 'data', 'about']

function sectionFromParams(searchParams) {
  const requested = searchParams.get('tab') || searchParams.get('section')
  return SETTINGS_SECTIONS.includes(requested) ? requested : 'tags'
}

export default function SettingsPage() {
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = searchParams.toString()
  const [section, setSection] = useState(() => sectionFromParams(searchParams))

  useEffect(() => {
    setSection(sectionFromParams(searchParams))
  }, [searchKey])

  const switchSection = (nextSection) => {
    setSection(nextSection)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('section')
    if (nextSection === 'tags') nextParams.delete('tab')
    else nextParams.set('tab', nextSection)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">{t('settings.title')}</h1>
      <div className="text-sm text-ink-500 mb-6">{t('settings.subtitle')}</div>

      <div className="flex gap-1 mb-6 border-b border-paper-200 overflow-x-auto scrollbar-hide">
        <SectionTab active={section === 'tags'} onClick={() => switchSection('tags')}>{t('settings.tab.tags')}</SectionTab>
        <SectionTab active={section === 'collections'} onClick={() => switchSection('collections')}>{t('settings.tab.collections')}</SectionTab>
        <SectionTab active={section === 'appearance'} onClick={() => switchSection('appearance')}>{t('settings.tab.appearance')}</SectionTab>
        <SectionTab active={section === 'data'} onClick={() => switchSection('data')}>{t('settings.tab.data')}</SectionTab>
        <SectionTab active={section === 'about'} onClick={() => switchSection('about')}>{t('settings.tab.about')}</SectionTab>
      </div>

      {section === 'tags' && <TagsSection />}
      {section === 'collections' && <CollectionsSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'data' && <DataSection />}
      {section === 'about' && <AboutSection />}
    </div>
  )
}

function SectionTab({ active, children, onClick }) {
  return (
    <button onClick={onClick}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap ${
              active
                ? 'border-brand-600 text-brand-700 font-medium'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}>
      {children}
    </button>
  )
}

// =============== 标签管理 ===============

function TagsSection() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const { data: groups = [] } = useQuery({ queryKey: ['tagGroups'], queryFn: api.listTagGroups })

  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [confirmDelGroup, setConfirmDelGroup] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('tagGroups.upgradeBannerDismissed') === '1'
  )
  const [editingTag, setEditingTag] = useState(null)
  const [editTagError, setEditTagError] = useState('')
  const [confirmDelTag, setConfirmDelTag] = useState(null)
  const [newTagInputs, setNewTagInputs] = useState({})

  const tagCountByGroup = {}
  for (const tg of tags) {
    if (tg.group_id != null) {
      tagCountByGroup[tg.group_id] = (tagCountByGroup[tg.group_id] || 0) + 1
    }
  }

  const tagsByGroup = {}
  for (const tg of tags) {
    const gid = tg.group_id
    if (gid == null) continue
    if (!tagsByGroup[gid]) tagsByGroup[gid] = []
    tagsByGroup[gid].push(tg)
  }
  for (const gid in tagsByGroup) {
    tagsByGroup[gid].sort((a, b) => a.name.localeCompare(b.name))
  }

  const aliasStringToArray = (s) =>
    (s || '').split(',').map(x => x.trim()).filter(Boolean)

  const aliasArrayToString = (arr) =>
    (arr || []).join(', ')

  const createGroup = useMutation({
    mutationFn: () => api.createTagGroup({ name: newGroupName.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagGroups'] })
      setNewGroupName('')
    },
  })

  const updateGroup = useMutation({
    mutationFn: ({ id, data }) => api.updateTagGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagGroups'] })
      setEditingGroupId(null)
      setEditingGroupName('')
    },
  })

  const removeGroup = useMutation({
    mutationFn: (id) => api.deleteTagGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagGroups'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setConfirmDelGroup(null)
    },
  })

  const reorderGroups = useMutation({
    mutationFn: (orderedIds) => api.reorderTagGroups(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tagGroups'] })
    },
  })

  const createTag = useMutation({
    mutationFn: ({ name, group_id }) => api.createTag({ name, group_id }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setNewTagInputs(s => ({ ...s, [vars.group_id]: '' }))
    },
  })

  const updateTag = useMutation({
    mutationFn: ({ id, data }) => api.updateTag(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setEditingTag(null)
      setEditTagError('')
    },
    onError: (err) => {
      const msg = String(err.message || '')
      let detail = msg
      const m = msg.match(/^\d+:\s*(.+)$/s)
      if (m) {
        try {
          const parsed = JSON.parse(m[1])
          detail = parsed.detail || m[1]
        } catch {
          detail = m[1]
        }
      }
      setEditTagError(detail)
    },
  })

  const removeTag = useMutation({
    mutationFn: (id) => api.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setConfirmDelTag(null)
      setEditingTag(null)
      setEditTagError('')
    },
  })

  const moveGroup = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= groups.length) return
    const newOrder = [...groups]
    ;[newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]]
    reorderGroups.mutate(newOrder.map(g => g.id))
  }

  const atMaxGroups = groups.length >= 5
  const isDefault = (g) => g.is_default === true

  return (
    <div className="space-y-5">
      {!bannerDismissed && (
        <div className="card p-4 bg-blue-50 border border-blue-200 flex items-start gap-3">
          <div className="flex-1 text-sm text-blue-900">
            {t('settings.tagGroups.upgradeBanner')}
          </div>
          <button
            onClick={() => {
              localStorage.setItem('tagGroups.upgradeBannerDismissed', '1')
              setBannerDismissed(true)
            }}
            className="text-sm text-blue-700 font-medium px-2 py-1 hover:bg-blue-100 rounded"
          >
            {t('settings.tagGroups.upgradeBannerDismiss')}
          </button>
        </div>
      )}

      <div className="card p-5">
        <div className="text-sm font-medium mb-3 text-ink-700">{t('settings.tagGroups.new')}</div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <input
            type="text"
            placeholder={t('settings.tagGroups.namePlaceholder')}
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newGroupName.trim() && !atMaxGroups && createGroup.mutate()}
            disabled={atMaxGroups}
          />
          <Button
            variant="primary"
            onClick={() => newGroupName.trim() && !atMaxGroups && createGroup.mutate()}
            disabled={!newGroupName.trim() || createGroup.isPending || atMaxGroups}
          >
            <Plus size={14} /> {t('common.add')}
          </Button>
        </div>
        {atMaxGroups && (
          <div className="text-xs text-ink-500 mt-2">{t('settings.tagGroups.maxHint')}</div>
        )}
      </div>

      {groups.length === 0 && (
        <div className="card text-center py-10 text-sm text-ink-400">
          {t('settings.tagGroups.empty')}
        </div>
      )}

      {groups.map((g, idx) => (
        <div key={g.id} className="card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-paper-200 bg-paper-50">
            {editingGroupId === g.id ? (
              <>
                <input
                  type="text"
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(e.target.value)}
                  className="flex-1 input-compact"
                  autoFocus
                />
                <Button
                  variant="primary"
                  onClick={() => editingGroupName.trim() &&
                    updateGroup.mutate({ id: g.id, data: { name: editingGroupName.trim() } })}
                >
                  <Save size={13} /> {t('common.save')}
                </Button>
                <Button variant="ghost" onClick={() => { setEditingGroupId(null); setEditingGroupName('') }}>
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">{g.name}</span>
                {isDefault(g) && (
                  <span className="text-xs px-2 py-0.5 bg-paper-200 text-ink-600 rounded">
                    {t('settings.tagGroups.defaultBadge')}
                  </span>
                )}
                <span className="text-xs text-ink-500">
                  {t('settings.tagGroups.tagsCount', { count: tagCountByGroup[g.id] || 0 })}
                </span>
                <span className="flex-1" />
                <div className="flex gap-1">
                  <button
                    onClick={() => moveGroup(idx, -1)}
                    disabled={idx === 0}
                    title={t('settings.tagGroups.moveUp')}
                    className="p-2 hover:bg-paper-200 rounded-md text-ink-700 disabled:opacity-30"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    onClick={() => moveGroup(idx, 1)}
                    disabled={idx === groups.length - 1}
                    title={t('settings.tagGroups.moveDown')}
                    className="p-2 hover:bg-paper-200 rounded-md text-ink-700 disabled:opacity-30"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name) }}
                    title={t('settings.tagGroups.rename')}
                    className="p-2 hover:bg-paper-200 rounded-md text-ink-700"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => !isDefault(g) && setConfirmDelGroup(g)}
                    disabled={isDefault(g)}
                    title={isDefault(g) ? t('settings.tagGroups.cantDeleteDefault') : t('common.delete')}
                    className="p-2 hover:bg-red-50 text-red-600 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>

          <div>
            {(tagsByGroup[g.id] || []).length === 0 ? (
              <div className="px-4 py-3 text-sm text-ink-400">{t('settings.tags.empty')}</div>
            ) : (
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {(tagsByGroup[g.id] || []).map(tg => (
                  <div key={tg.id} className="inline-flex">
                    <button
                      type="button"
                      onClick={() => {
                        setEditTagError('')
                        setEditingTag({
                          id: tg.id,
                          name: tg.name,
                          group_id: tg.group_id,
                          aliases: aliasArrayToString(tg.aliases),
                        })
                      }}
                      title={
                        tg.aliases && tg.aliases.length > 0
                          ? `${tg.name} (${tg.aliases.join(', ')})`
                          : tg.name
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-paper-100 border border-paper-200 text-ink-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors cursor-pointer"
                    >
                      <span>{tg.name}</span>
                      {tg.aliases && tg.aliases.length > 0 && (
                        <span className="text-[10px] text-ink-400">
                          ·{tg.aliases.length}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-paper-50/50 border-t border-paper-200">
              <input
                type="text"
                placeholder={t('settings.tags.namePlaceholder')}
                value={newTagInputs[g.id] || ''}
                onChange={(e) => setNewTagInputs(s => ({ ...s, [g.id]: e.target.value }))}
                onKeyDown={(e) => {
                  const v = (newTagInputs[g.id] || '').trim()
                  if (e.key === 'Enter' && v) {
                    createTag.mutate({ name: v, group_id: g.id })
                  }
                }}
                className="flex-1 input-compact"
              />
              <button
                onClick={() => {
                  const v = (newTagInputs[g.id] || '').trim()
                  if (v) createTag.mutate({ name: v, group_id: g.id })
                }}
                disabled={!(newTagInputs[g.id] || '').trim() || createTag.isPending}
                className="text-xs text-brand-700 hover:text-brand-900 px-2 py-1 disabled:opacity-30"
              >
                <Plus size={12} className="inline" /> {t('common.add')}
              </button>
            </div>
          </div>
        </div>
      ))}

      <Modal
        open={!!editingTag}
        onClose={() => { setEditingTag(null); setEditTagError('') }}
        title={editingTag ? t('common.edit') + ' ' + editingTag.name : ''}
      >
        {editingTag && (
          <div className="space-y-4">
            {editTagError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {editTagError}
              </div>
            )}

            <div>
              <input
                type="text"
                placeholder={t('settings.tags.namePlaceholder')}
                value={editingTag.name}
                onChange={(e) => setEditingTag(s => ({ ...s, name: e.target.value }))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-ink-700 mb-1.5">
                {t('settings.tags.groupLabel')}
              </label>
              <select
                value={editingTag.group_id}
                onChange={(e) => setEditingTag(s => ({ ...s, group_id: parseInt(e.target.value, 10) }))}
                className="w-full"
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-ink-700 mb-1.5">
                {t('settings.tags.aliases.label')}
              </label>
              <input
                type="text"
                placeholder={t('settings.tags.aliases.placeholder')}
                value={editingTag.aliases}
                onChange={(e) => setEditingTag(s => ({ ...s, aliases: e.target.value }))}
              />
              <div className="text-xs text-ink-500 mt-1">{t('settings.tags.aliases.hint')}</div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelTag(editingTag)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
              >
                <Trash2 size={13} /> {t('common.delete')}
              </button>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setEditingTag(null); setEditTagError('') }}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  disabled={!editingTag.name.trim() || updateTag.isPending}
                  onClick={() => {
                    setEditTagError('')
                    updateTag.mutate({
                      id: editingTag.id,
                      data: {
                        name: editingTag.name.trim(),
                        group_id: editingTag.group_id,
                        aliases: aliasStringToArray(editingTag.aliases),
                      },
                    })
                  }}
                >
                  <Save size={13} /> {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelGroup}
        onClose={() => setConfirmDelGroup(null)}
        title={t('settings.tagGroups.confirmDelete.title')}
        message={
          <>
            {t('settings.tagGroups.confirmDelete.body', { name: confirmDelGroup?.name })}
            <span className="block text-ink-500 mt-1">{t('settings.tagGroups.confirmDelete.note')}</span>
          </>
        }
        confirmText={t('common.delete')}
        danger
        onConfirm={() => removeGroup.mutate(confirmDelGroup.id)}
      />

      <ConfirmDialog
        open={!!confirmDelTag}
        onClose={() => setConfirmDelTag(null)}
        title={t('settings.tags.confirmDelete.title')}
        message={
          <>
            {t('settings.tags.confirmDelete.body', { name: confirmDelTag?.name })}
            <span className="block text-ink-500 mt-1">{t('settings.tags.confirmDelete.note')}</span>
          </>
        }
        confirmText={t('common.delete')}
        danger
        onConfirm={() => removeTag.mutate(confirmDelTag.id)}
      />
    </div>
  )
}


// =============== 收藏夹管理 ===============

function CollectionsSection() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#2563eb')
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const create = useMutation({
    mutationFn: () => api.createCollection({
      name: newName.trim(),
      border_color: newColor,
      sort_order: collections.length,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      setNewName('')
    },
  })
  const update = useMutation({
    mutationFn: ({ id, data }) => api.updateCollection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      setEditing(null)
    },
  })
  const remove = useMutation({
    mutationFn: (id) => api.deleteCollection(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['collections'] }); setConfirmDel(null) },
  })

  const moveItem = async (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= collections.length) return
    const a = collections[idx], b = collections[target]
    await Promise.all([
      api.updateCollection(a.id, { sort_order: b.sort_order }),
      api.updateCollection(b.id, { sort_order: a.sort_order }),
    ])
    queryClient.invalidateQueries({ queryKey: ['collections'] })
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="text-sm font-medium mb-3 text-ink-700">{t('settings.collections.new')}</div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                 className="w-12 h-11 cursor-pointer" />
          <input type="text" placeholder={t('settings.collections.namePlaceholder')}
                 value={newName} onChange={(e) => setNewName(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create.mutate()} />
          <Button variant="primary" onClick={() => newName.trim() && create.mutate()}
                  disabled={!newName.trim() || create.isPending}>
            <Plus size={14} /> {t('common.add')}
          </Button>
        </div>
        <div className="text-xs text-ink-500 mt-2">
          {t('settings.collections.hint')}
        </div>
      </div>

      <div className="card divide-y divide-paper-200 overflow-hidden">
        {collections.length === 0 && (
          <div className="text-center py-10 text-sm text-ink-400">{t('settings.collections.empty')}</div>
        )}
        {collections.map((c, idx) => (
          <div key={c.id}
               className="flex items-center gap-3 px-4 py-3 hover:bg-paper-50 group"
               style={{ borderLeft: `4px solid ${c.border_color}` }}>
            {editing?.id === c.id ? (
              <>
                <input type="color" value={editing.border_color}
                       onChange={(e) => setEditing(s => ({ ...s, border_color: e.target.value }))}
                       className="w-10 h-9 cursor-pointer" />
                <input type="text" value={editing.name}
                       onChange={(e) => setEditing(s => ({ ...s, name: e.target.value }))}
                       className="flex-1 input-compact" />
                <Button variant="primary"
                        onClick={() => update.mutate({
                          id: c.id,
                          data: { name: editing.name, border_color: editing.border_color },
                        })}>
                  <Save size={13} /> {t('common.save')}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              </>
            ) : (
              <>
                <span className="text-base font-semibold text-ink-900 flex-1 truncate">{c.name}</span>
                <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                          className="p-2 hover:bg-paper-200 rounded-md text-ink-700 disabled:opacity-30">
                    <ArrowUp size={13} />
                  </button>
                  <button onClick={() => moveItem(idx, 1)} disabled={idx === collections.length - 1}
                          className="p-2 hover:bg-paper-200 rounded-md text-ink-700 disabled:opacity-30">
                    <ArrowDown size={13} />
                  </button>
                  <button onClick={() => setEditing({ id: c.id, name: c.name, border_color: c.border_color })}
                          className="p-2 hover:bg-paper-200 rounded-md text-ink-700">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => setConfirmDel(c)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded-md">
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title={t('settings.collections.confirmDelete.title')}
        message={
          <>
            {t('settings.collections.confirmDelete.body', { name: confirmDel?.name })}
            <span className="block text-ink-500 mt-1">{t('settings.tags.confirmDelete.note')}</span>
          </>
        }
        confirmText={t('common.delete')}
        danger
        onConfirm={() => remove.mutate(confirmDel.id)}
      />
    </div>
  )
}

// =============== 外观 / 语言 ===============
//
// 这是新增的 tab。它不调后端,完全前端 store + localStorage。
// 切换语言是即时的:zustand 一变所有用 useT() 的组件就会重渲染。

function AppearanceSection() {
  const t = useT()
  const locale = useLocaleStore(s => s.locale)
  const setLocale = useLocaleStore(s => s.setLocale)

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="text-sm font-medium mb-1 text-ink-700">{t('settings.appearance.language')}</div>
        <div className="text-xs text-ink-500 mb-4">{t('settings.appearance.languageDesc')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUPPORTED_LOCALES.map(opt => {
            const active = locale === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setLocale(opt.value)}
                className={`px-4 py-3 rounded-lg border text-left flex items-center gap-3 transition-colors ${
                  active
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-paper-300 hover:border-brand-400 hover:bg-paper-50 text-ink-700'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  active ? 'border-brand-600 bg-brand-600 text-white' : 'border-paper-300'
                }`}>
                  {active && <Check size={12} />}
                </div>
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// =============== 数据管理 ===============

function DataSection() {
  const t = useT()
  const queryClient = useQueryClient()
  const [importFile, setImportFile] = useState(null)
  const { data: backupData } = useQuery({
    queryKey: ['backups'],
    queryFn: api.listBackups,
  })
  const backups = backupData?.backups || []

  const triggerBackup = useMutation({
    mutationFn: api.triggerBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  })
  const importBackup = useMutation({
    mutationFn: () => api.importJson(importFile),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setImportFile(null)
      alert(t('settings.data.import.done'))
      window.location.reload()
    },
  })

  const locale = useLocaleStore(s => s.locale)
  const dateLocale = locale === 'en' ? 'en-US' : 'zh-CN'

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="text-sm font-medium mb-1">{t('settings.data.export.title')}</div>
        <div className="text-xs text-ink-500 mb-3">{t('settings.data.export.desc')}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => window.location = api.exportJsonUrl()}>
            <Download size={14} /> {t('settings.data.export.json')}
          </Button>
          <Button variant="default" onClick={() => window.location = api.exportCsvUrl()}>
            <Download size={14} /> {t('settings.data.export.csv')}
          </Button>
        </div>
      </div>
      <div className="card p-5">
        <div className="text-sm font-medium mb-1">{t('settings.data.import.title')}</div>
        <div className="text-xs text-ink-500 mb-3">
          {t('settings.data.import.desc')}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".zip,application/zip"
            className="input-compact max-w-sm"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
          <Button
            variant="primary"
            onClick={() => importBackup.mutate()}
            disabled={!importFile || importBackup.isPending}
          >
            {importBackup.isPending ? t('common.importing') : t('settings.data.import.btn')}
          </Button>
        </div>
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium mb-1">{t('settings.data.backup.title')}</div>
        <div className="text-xs text-ink-500 mb-3">
          {t('settings.data.backup.desc')}
        </div>
        <Button variant="primary" onClick={() => triggerBackup.mutate()} disabled={triggerBackup.isPending}>
          {triggerBackup.isPending ? t('common.backupRunning') : t('settings.data.backup.btn')}
        </Button>

        <div className="mt-4 border border-paper-200 rounded-lg divide-y divide-paper-200 max-h-80 overflow-y-auto">
          {backups.length === 0 && (
            <div className="text-center py-6 text-xs text-ink-400">{t('settings.data.backup.empty')}</div>
          )}
          {backups.map(b => (
            <div key={b.filename} className="flex items-center justify-between px-3 py-2.5 text-xs hover:bg-paper-50">
              <div>
                <div className="font-medium text-ink-700">{b.filename}</div>
                <div className="text-ink-400 mt-0.5">
                  {new Date(b.created_at).toLocaleString(dateLocale)} · {(b.size_bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <a href={`/api/admin/backups/${b.filename}`}
                 className="px-2.5 py-1.5 hover:bg-paper-200 rounded-md flex items-center gap-1 text-ink-700"
                 title={t('settings.data.backup.download')}>
                <Download size={12} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// =============== 关于 ===============

function AboutSection() {
  const t = useT()
  const { data: info } = useQuery({ queryKey: ['admin-info'], queryFn: api.getInfo })

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="text-base font-semibold mb-4">{t('app.name')} · Works Tracker</div>
        <div className="space-y-2.5 text-sm">
          <Row label={t('settings.about.version')}>{info?.version || '-'}</Row>
          <Row label={t('settings.about.worksCount')}>{info?.works_count ?? '-'}</Row>
          <Row label={t('settings.about.entriesCount')}>{info?.entries_count ?? '-'}</Row>
          <Row label={t('settings.about.dbSize')}>
            {info ? `${(info.db_size_bytes / 1024).toFixed(1)} KB` : '-'}
          </Row>
          <Row label={t('settings.about.dataDir')}>
            <code className="text-xs bg-paper-100 px-2 py-1 rounded">{info?.data_dir || '-'}</code>
          </Row>
        </div>
      </div>

      <div className="text-xs text-ink-500 leading-relaxed px-1">
        {t('settings.about.privacy')}
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900">{children}</span>
    </div>
  )
}
