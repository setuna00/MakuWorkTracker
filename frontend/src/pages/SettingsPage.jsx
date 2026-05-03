import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, Save, Download, ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '../lib/api'
import { Button, ConfirmDialog } from '../components/Modal'
import { TagChip } from '../components/TagChip'

export default function SettingsPage() {
  const [section, setSection] = useState('tags')

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">设置</h1>
      <div className="text-sm text-ink-500 mb-6">管理标签、收藏夹和数据</div>

      <div className="flex gap-1 mb-6 border-b border-paper-200">
        <SectionTab active={section === 'tags'} onClick={() => setSection('tags')}>标签</SectionTab>
        <SectionTab active={section === 'collections'} onClick={() => setSection('collections')}>收藏夹</SectionTab>
        <SectionTab active={section === 'data'} onClick={() => setSection('data')}>数据</SectionTab>
        <SectionTab active={section === 'about'} onClick={() => setSection('about')}>关于</SectionTab>
      </div>

      {section === 'tags' && <TagsSection />}
      {section === 'collections' && <CollectionsSection />}
      {section === 'data' && <DataSection />}
      {section === 'about' && <AboutSection />}
    </div>
  )
}

function SectionTab({ active, children, onClick }) {
  return (
    <button onClick={onClick}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
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
  const queryClient = useQueryClient()
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#2563eb')
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const create = useMutation({
    mutationFn: () => api.createTag({ name: newName.trim(), color: newColor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setNewName('')
    },
  })
  const update = useMutation({
    mutationFn: ({ id, data }) => api.updateTag(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setEditing(null)
    },
  })
  const remove = useMutation({
    mutationFn: (id) => api.deleteTag(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tags'] }); setConfirmDel(null) },
  })

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="text-sm font-medium mb-3 text-ink-700">新建标签</div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                 className="w-12 h-11 cursor-pointer" />
          <input type="text" placeholder="标签名" value={newName}
                 onChange={(e) => setNewName(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create.mutate()} />
          <Button variant="primary" onClick={() => newName.trim() && create.mutate()}
                  disabled={!newName.trim() || create.isPending}>
            <Plus size={14} /> 添加
          </Button>
        </div>
      </div>

      <div className="card divide-y divide-paper-200 overflow-hidden">
        {tags.length === 0 && (
          <div className="text-center py-10 text-sm text-ink-400">还没有标签</div>
        )}
        {tags.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-50 group">
            {editing?.id === t.id ? (
              <>
                <input type="color" value={editing.color}
                       onChange={(e) => setEditing(s => ({ ...s, color: e.target.value }))}
                       className="w-10 h-9 cursor-pointer" />
                <input type="text" value={editing.name}
                       onChange={(e) => setEditing(s => ({ ...s, name: e.target.value }))}
                       className="flex-1 input-compact" />
                <Button variant="primary"
                        onClick={() => update.mutate({ id: t.id, data: { name: editing.name, color: editing.color } })}>
                  <Save size={13} /> 保存
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
              </>
            ) : (
              <>
                <TagChip color={t.color}>{t.name}</TagChip>
                <span className="flex-1" />
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditing({ id: t.id, name: t.name, color: t.color })}
                          className="p-2 hover:bg-paper-200 rounded-md text-ink-700">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => setConfirmDel(t)}
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
        title="确认删除标签"
        message={
          <>
            将删除标签「<span className="font-medium">{confirmDel?.name}</span>」。
            <span className="block text-ink-500 mt-1">关联的作品不会受影响。</span>
          </>
        }
        confirmText="删除"
        danger
        onConfirm={() => remove.mutate(confirmDel.id)}
      />
    </div>
  )
}

// =============== 收藏夹管理 ===============

function CollectionsSection() {
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
        <div className="text-sm font-medium mb-3 text-ink-700">新建收藏夹</div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                 className="w-12 h-11 cursor-pointer" />
          <input type="text" placeholder="收藏夹名（如：吉卜力全集）"
                 value={newName} onChange={(e) => setNewName(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && newName.trim() && create.mutate()} />
          <Button variant="primary" onClick={() => newName.trim() && create.mutate()}
                  disabled={!newName.trim() || create.isPending}>
            <Plus size={14} /> 添加
          </Button>
        </div>
        <div className="text-xs text-ink-500 mt-2">
          收藏夹添加好后，可以在作品详情页的"编辑信息"里把作品加入收藏夹。
        </div>
      </div>

      <div className="card divide-y divide-paper-200 overflow-hidden">
        {collections.length === 0 && (
          <div className="text-center py-10 text-sm text-ink-400">还没有收藏夹</div>
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
                  <Save size={13} /> 保存
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium flex-1">★ {c.name}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        title="确认删除收藏夹"
        message={
          <>
            将删除收藏夹「<span className="font-medium">{confirmDel?.name}</span>」。
            <span className="block text-ink-500 mt-1">关联的作品不会受影响。</span>
          </>
        }
        confirmText="删除"
        danger
        onConfirm={() => remove.mutate(confirmDel.id)}
      />
    </div>
  )
}

// =============== 数据管理 ===============

function DataSection() {
  const queryClient = useQueryClient()
  const { data: backupData } = useQuery({
    queryKey: ['backups'],
    queryFn: api.listBackups,
  })
  const backups = backupData?.backups || []

  const triggerBackup = useMutation({
    mutationFn: api.triggerBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  })

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="text-sm font-medium mb-1">导出数据</div>
        <div className="text-xs text-ink-500 mb-3">导出全部数据用于迁移或归档备份</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => window.location = api.exportJsonUrl()}>
            <Download size={14} /> 导出 JSON（含封面）
          </Button>
          <Button variant="default" onClick={() => window.location = api.exportCsvUrl()}>
            <Download size={14} /> 导出 CSV
          </Button>
        </div>
      </div>

      <div className="card p-5">
        <div className="text-sm font-medium mb-1">数据库备份</div>
        <div className="text-xs text-ink-500 mb-3">
          自动每天凌晨 03:00 备份，保留最近 30 份。可立即手动备份。
        </div>
        <Button variant="primary" onClick={() => triggerBackup.mutate()} disabled={triggerBackup.isPending}>
          {triggerBackup.isPending ? '备份中...' : '立即备份'}
        </Button>

        <div className="mt-4 border border-paper-200 rounded-lg divide-y divide-paper-200 max-h-80 overflow-y-auto">
          {backups.length === 0 && (
            <div className="text-center py-6 text-xs text-ink-400">还没有备份</div>
          )}
          {backups.map(b => (
            <div key={b.filename} className="flex items-center justify-between px-3 py-2.5 text-xs hover:bg-paper-50">
              <div>
                <div className="font-medium text-ink-700">{b.filename}</div>
                <div className="text-ink-400 mt-0.5">
                  {new Date(b.created_at).toLocaleString('zh-CN')} · {(b.size_bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <a href={`/api/admin/backups/${b.filename}`}
                 className="px-2.5 py-1.5 hover:bg-paper-200 rounded-md flex items-center gap-1 text-ink-700"
                 title="下载">
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
  const { data: info } = useQuery({ queryKey: ['admin-info'], queryFn: api.getInfo })

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="text-base font-semibold mb-4">作品追踪 · Works Tracker</div>
        <div className="space-y-2.5 text-sm">
          <Row label="版本">{info?.version || '-'}</Row>
          <Row label="作品数">{info?.works_count ?? '-'}</Row>
          <Row label="进度记录数">{info?.entries_count ?? '-'}</Row>
          <Row label="数据库大小">
            {info ? `${(info.db_size_bytes / 1024).toFixed(1)} KB` : '-'}
          </Row>
          <Row label="数据目录">
            <code className="text-xs bg-paper-100 px-2 py-1 rounded">{info?.data_dir || '-'}</code>
          </Row>
        </div>
      </div>

      <div className="text-xs text-ink-500 leading-relaxed px-1">
        本应用仅运行在你自己的 NAS 上，所有数据保存在数据目录中，不上传任何外部服务。
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
