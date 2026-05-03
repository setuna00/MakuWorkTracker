import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Check, Image as ImageIcon, Upload, X } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Modal } from '../components/Modal'
import { CoverCropper } from '../components/CoverCropper'
import { SelectableTagChip } from '../components/TagChip'

export default function NewWorkPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [type, setType] = useState(null)
  const [title, setTitle] = useState('')
  const [originalTitle, setOriginalTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [releaseStatus, setReleaseStatus] = useState('ongoing')
  const [totalUnits, setTotalUnits] = useState('')
  const [creators, setCreators] = useState({})
  const [initialStatus, setInitialStatus] = useState('want')
  const [tagIds, setTagIds] = useState([])
  const [collectionIds, setCollectionIds] = useState([])
  const [error, setError] = useState('')
  const [titleError, setTitleError] = useState('')
  const [totalUnitsError, setTotalUnitsError] = useState('')

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
  })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })

  const typeMeta = typesMeta.types.find(t => t.value === type)
  const isMovie = type === 'movie'
  const needsTotalUnits = !isMovie && releaseStatus === 'finished' && typeMeta?.has_range_progress
  const isStep2Valid = title.trim() && (!needsTotalUnits || Number(totalUnits) > 0)

  const create = useMutation({
    mutationFn: () => api.createWork({
      title,
      original_title: originalTitle || null,
      type,
      description: description || null,
      release_status: isMovie ? 'finished' : releaseStatus,
      total_units: isMovie ? 1 : (totalUnits ? parseInt(totalUnits) : null),
      creators,
      tag_ids: tagIds,
      collection_ids: collectionIds,
      initial_status: initialStatus,
    }, coverFile),
    onSuccess: (work) => navigate(`/works/${work.id}`),
    onError: (e) => setError(e.message || '创建失败'),
  })

  const handleCoverSelect = (file) => {
    if (file) setPendingFile(file)
  }

  const handleCropConfirm = (croppedFile) => {
    setCoverFile(croppedFile)
    setPendingFile(null)
    const reader = new FileReader()
    reader.onload = () => setCoverPreview(reader.result)
    reader.readAsDataURL(croppedFile)
  }

  const removeCover = () => {
    setCoverFile(null)
    setCoverPreview(null)
  }

  const handleSubmit = () => {
    setError('')
    if (!title.trim()) {
      setError('请填写标题')
      return
    }
    if (!isMovie && releaseStatus === 'finished' && typeMeta?.has_range_progress && !totalUnits) {
      setError(`完结作品必须填写总${typeMeta.unit_label}数`)
      return
    }
    create.mutate()
  }

  const STATUSES = [
    ['want', '想看', '#64748b'],
    ['watching', '在看', '#2563eb'],
    ['done', '看完', '#16a34a'],
    ['dropped', '弃坑', '#dc2626'],
  ]

  return (
    // 容器最大 880px，集中显示
    <div className="max-w-[880px] mx-auto">
      {/* 页面头部 */}
      <div className="mb-7">
        <h1 className="text-[28px] font-semibold text-ink-900 leading-tight">新建作品</h1>
        <div className="text-sm text-ink-500 mt-1">
          步骤 <span className="font-medium text-brand-700">{step}</span> / 3
        </div>
      </div>

      {/* 步骤条 */}
      <div className="flex items-center mb-7">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
              s < step ? 'bg-brand-600 text-white'
                : s === step ? 'bg-white text-brand-700 border-2 border-brand-600 shadow-sm'
                : 'bg-paper-100 text-ink-400 border border-paper-200'
            }`}>
              {s < step ? <Check size={16} /> : s}
            </div>
            {s < 3 && (
              <div className={`flex-1 h-[2px] mx-3 rounded ${
                s < step ? 'bg-brand-600' : 'bg-paper-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: 类型 */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-paper-200 shadow-card p-7">
          <SectionTitle>选择作品类型</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
            {typesMeta.types.map(t => (
              <button key={t.value}
                      onClick={() => { setType(t.value); setStep(2) }}
                      className={`p-5 rounded-xl border-2 text-left transition-all ${
                        type === t.value
                          ? 'border-brand-600 bg-brand-50 shadow-card'
                          : 'border-paper-200 hover:border-brand-400 bg-white'
                      }`}>
                <div className="font-medium text-base text-ink-900">{t.label}</div>
                <div className="text-xs text-ink-500 mt-1">单位：{t.unit_label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: 基本信息 - 卡片容器 + 三个 section */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-paper-200 shadow-card overflow-hidden">
          {/* 基本信息 section */}
          <Section title="基本信息" desc="作品的标题与简介">
            <FormGrid>
              <Field span={12} label="标题" required error={titleError}>
                <TextInput value={title}
                           onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError('') }}
                           autoFocus
                           placeholder="作品名称"
                           hasError={!!titleError} />
              </Field>

              <Field span={12} label="原文标题" hint="可选">
                <TextInput value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)}
                           placeholder="原版语言的标题" />
              </Field>

              {/* 创作者两列等宽 */}
              {typeMeta?.creator_fields?.length === 2 && (
                <>
                  <Field span={6} label={typeMeta.creator_fields[0].label} hint="可选">
                    <TextInput value={creators[typeMeta.creator_fields[0].key] || ''}
                               onChange={(e) => setCreators(c => ({ ...c, [typeMeta.creator_fields[0].key]: e.target.value }))} />
                  </Field>
                  <Field span={6} label={typeMeta.creator_fields[1].label} hint="可选">
                    <TextInput value={creators[typeMeta.creator_fields[1].key] || ''}
                               onChange={(e) => setCreators(c => ({ ...c, [typeMeta.creator_fields[1].key]: e.target.value }))} />
                  </Field>
                </>
              )}
              {typeMeta?.creator_fields?.length === 1 && (
                <Field span={6} label={typeMeta.creator_fields[0].label} hint="可选">
                  <TextInput value={creators[typeMeta.creator_fields[0].key] || ''}
                             onChange={(e) => setCreators(c => ({ ...c, [typeMeta.creator_fields[0].key]: e.target.value }))} />
                </Field>
              )}

              <Field span={12} label="简介" hint="可选">
                <TextArea rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
                          placeholder="简单介绍一下这部作品..." />
              </Field>
            </FormGrid>
          </Section>

          {/* 封面 section */}
          <Section title="封面" desc="推荐 3:4 比例 · 支持 JPG / PNG / WebP">
            <CoverDropzone file={coverFile} preview={coverPreview}
                           onSelect={handleCoverSelect} onRemove={removeCover} />
          </Section>

          {/* 进度信息 section（电影类型隐藏）*/}
          {!isMovie && (
            <Section title="进度信息" desc="作品状态与总集数">
              <FormGrid>
                <Field span={6} label="作品状态">
                  <SelectInput value={releaseStatus} onChange={(e) => {
                    setReleaseStatus(e.target.value)
                    if (e.target.value !== 'finished') setTotalUnitsError('')
                  }}>
                    <option value="ongoing">连载中</option>
                    <option value="finished">完结</option>
                  </SelectInput>
                </Field>
                {typeMeta?.has_range_progress && (
                  <Field span={6} label={`总${typeMeta.unit_label}数`}
                         hint={releaseStatus === 'finished' ? '必填' : '可选'} error={totalUnitsError}>
                    <TextInput type="number" value={totalUnits} min={1}
                               onChange={(e) => {
                                 setTotalUnits(e.target.value)
                                 if (totalUnitsError) setTotalUnitsError('')
                               }}
                               placeholder="例如 24"
                               hasError={!!totalUnitsError} />
                  </Field>
                )}
              </FormGrid>
            </Section>
          )}

          {/* 卡片底部操作栏 */}
          <div className="px-7 py-4 bg-paper-50 border-t border-paper-200 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>← 上一步</Button>
            <Button variant="primary"
                    disabled={!isStep2Valid}
                    onClick={() => {
                      if (!title.trim()) {
                        setTitleError('请输入作品名称')
                        return
                      }
                      if (needsTotalUnits && !(Number(totalUnits) > 0)) {
                        setTotalUnitsError(`请输入总${typeMeta?.unit_label || '集'}数`)
                        return
                      }
                      setTitleError('')
                      setTotalUnitsError('')
                      setStep(3)
                    }}>
              下一步
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: 状态 + 标签 + 收藏夹 */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-paper-200 shadow-card overflow-hidden">
          <Section title="初始追看状态" desc="创建后可随时调整">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(([val, lbl, color]) => {
                const active = initialStatus === val
                return (
                  <button key={val}
                          onClick={() => setInitialStatus(val)}
                          className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                          style={active ? {
                            background: color,
                            borderColor: color,
                            color: '#ffffff',
                          } : {
                            background: color + '15',
                            borderColor: color + '40',
                            color: color,
                          }}>
                    {lbl}
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title={`标签`} desc={`已选 ${tagIds.length} 个`}>
            {tags.length === 0 ? (
              <div className="text-sm text-ink-400 px-4 py-4 bg-paper-50 rounded-lg border border-paper-200">
                还没有标签，可以去「设置 → 标签」创建后再回来添加
              </div>
            ) : (
              <div className="bg-paper-50 border border-paper-200 rounded-xl p-4">
                <div className="flex flex-wrap gap-2">
                  {tags.map(t => (
                    <SelectableTagChip key={t.id} color={t.color}
                                       selected={tagIds.includes(t.id)}
                                       onClick={() => setTagIds(ids =>
                                         ids.includes(t.id) ? ids.filter(x => x !== t.id) : [...ids, t.id]
                                       )}>
                      {t.name}
                    </SelectableTagChip>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="收藏夹" desc={`已选 ${collectionIds.length} 个`}>
            {collections.length === 0 ? (
              <div className="text-sm text-ink-400 px-4 py-4 bg-paper-50 rounded-lg border border-paper-200">
                还没有收藏夹，可以去「设置 → 收藏夹」创建后再回来添加
              </div>
            ) : (
              <div className="bg-paper-50 border border-paper-200 rounded-xl p-4">
                <div className="flex flex-wrap gap-2">
                  {collections.map(c => (
                    <SelectableTagChip key={c.id} color={c.border_color}
                                       selected={collectionIds.includes(c.id)}
                                       onClick={() => setCollectionIds(ids =>
                                         ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id]
                                       )}>
                      ★ {c.name}
                    </SelectableTagChip>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {error && (
            <div className="mx-7 mb-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div className="px-7 py-4 bg-paper-50 border-t border-paper-200 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>← 上一步</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending ? '创建中...' : '创建作品'}
            </Button>
          </div>
        </div>
      )}

      {pendingFile && (
        <Modal open={true} onClose={() => setPendingFile(null)} title="裁剪封面" size="md">
          <CoverCropper
            file={pendingFile}
            onCancel={() => setPendingFile(null)}
            onConfirm={handleCropConfirm}
          />
        </Modal>
      )}
    </div>
  )
}

/* =============== 辅助组件 =============== */

/**
 * 大卡片内的一个 section，标题 + 描述 + 内容
 * 不同 section 之间用顶部 border 分隔
 */
function Section({ title, desc, children }) {
  return (
    <div className="px-7 py-6 border-b border-paper-200 last:border-b-0">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
        {desc && <div className="text-xs text-ink-500 mt-0.5">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * Section 顶部的简单标题（用于 Step 1 等无描述场景）
 */
function SectionTitle({ children }) {
  return <h3 className="text-[15px] font-semibold text-ink-900">{children}</h3>
}

/**
 * 12 列 grid 容器
 */
function FormGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5">{children}</div>
}

/**
 * 字段容器 - 12 列 grid 子项
 */
function Field({ span = 12, label, hint, required, error, children }) {
  const spanClass = span === 6 ? 'col-span-1' : 'col-span-1 md:col-span-2'
  return (
    <div className={spanClass}>
      <label className="text-[13px] font-semibold text-ink-700 mb-2 flex items-center gap-1.5">
        <span>{label}</span>
        {required && <span className="text-red-500">*</span>}
        {hint && <span className="text-ink-400 font-normal text-[12px]">· {hint}</span>}
      </label>
      {children}
      {error && (
        <div className="mt-1.5 text-[12px] text-red-600 font-medium">
          {error}
        </div>
      )}
    </div>
  )
}

function fieldControlClass(hasError = false) {
  return `w-full min-h-11 rounded-xl border px-3.5 text-sm text-ink-900 bg-slate-50/80 placeholder:text-ink-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition ${hasError
    ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100'
    : 'border-slate-300 hover:border-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100'} focus:outline-none`
}

function TextInput({ hasError, type = 'text', className = '', ...props }) {
  return <input type={type} className={`${fieldControlClass(hasError)} ${className}`} {...props} />
}

function TextArea({ hasError, className = '', ...props }) {
  return <textarea className={`${fieldControlClass(hasError)} min-h-[120px] py-2.5 resize-y ${className}`} {...props} />
}

function SelectInput({ hasError, className = '', ...props }) {
  return <select className={`${fieldControlClass(hasError)} pr-10 ${className}`} {...props} />
}

/**
 * 横向 dropzone 封面上传
 *   - 左：3:4 预览/占位 (140 × 187)
 *   - 右：说明文字 + 按钮
 *   - 容器整体一个浅灰底带虚线/实线
 */
function CoverDropzone({ file, preview, onSelect, onRemove }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const trigger = () => inputRef.current?.click()

  const onChange = (e) => {
    const f = e.target.files?.[0]
    if (f) onSelect(f)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) onSelect(f)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`rounded-xl border-2 transition-all p-5 flex items-center gap-5 ${
        dragOver
          ? 'border-brand-500 bg-brand-50'
          : preview
            ? 'border-paper-200 bg-paper-50'
            : 'border-dashed border-paper-300 bg-paper-50 hover:border-brand-400 hover:bg-brand-50'
      }`}
    >
      {/* 左侧 3:4 预览/占位 */}
      {preview ? (
        <div className="relative flex-shrink-0">
          <img src={preview} alt="封面预览"
               className="w-[140px] h-[187px] object-cover rounded-lg border border-paper-200 shadow-card" />
          <button type="button" onClick={onRemove}
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white hover:bg-red-50 border border-paper-300 hover:border-red-300 hover:text-red-600 text-ink-500 flex items-center justify-center shadow-card transition-colors"
                  title="移除封面">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={trigger}
                className="flex-shrink-0 w-[140px] h-[187px] rounded-lg border-2 border-dashed border-paper-300 bg-white hover:border-brand-500 flex flex-col items-center justify-center gap-2 text-ink-400 hover:text-brand-600 transition-colors">
          <ImageIcon size={32} strokeWidth={1.5} />
          <div className="text-xs font-medium">3:4 预览</div>
        </button>
      )}

      {/* 右侧文案 + 按钮 */}
      <div className="flex-1 min-w-0">
        {preview ? (
          <>
            <div className="text-sm text-ink-900 font-medium mb-1">封面已选择</div>
            <div className="text-xs text-ink-500 mb-3 leading-relaxed">
              已裁剪为 3:4 比例。如需重新选择，可点击下方按钮。
            </div>
            <div className="flex gap-2">
              <Button variant="default" type="button" onClick={trigger}>
                <Upload size={14} /> 更换封面
              </Button>
              <Button variant="ghost" type="button" onClick={onRemove}>移除</Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-ink-900 font-medium mb-1">点击或拖拽图片到此处上传</div>
            <div className="text-xs text-ink-500 mb-3 leading-relaxed">
              推荐 3:4 比例 · 支持 JPG / PNG / WebP<br/>
              上传后可拖动裁剪
            </div>
            <Button variant="default" type="button" onClick={trigger}>
              <Upload size={14} /> 选择图片
            </Button>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" onChange={onChange} className="hidden" />
    </div>
  )
}
