import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Check, Image as ImageIcon, Upload, X } from 'lucide-react'
import { api } from '../lib/api'
import { useT, translateType, translateUnit, translateStatus, translateRelease, translateCreatorLabel } from '../lib/i18n'
import { Button, Modal } from '../components/Modal'
import { CoverCropper } from '../components/CoverCropper'
import { TagPicker } from '../components/TagPicker'
import { SelectableTagChip } from '../components/TagChip'

export default function NewWorkPage() {
  const t = useT()
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
  const [unitLabel, setUnitLabel] = useState('')
  const [backfillOn, setBackfillOn] = useState(false)
  const [backfillRangeEnd, setBackfillRangeEnd] = useState('')
  const [creators, setCreators] = useState({})
  const [initialStatus, setInitialStatus] = useState('want')
  const [tagIds, setTagIds] = useState([])
  const [collectionIds, setCollectionIds] = useState([])
  const [error, setError] = useState('')
  const [titleError, setTitleError] = useState('')
  const [totalUnitsError, setTotalUnitsError] = useState('')
  const [backfillError, setBackfillError] = useState('')

  const { data: typesMeta = { types: [] } } = useQuery({
    queryKey: ['types-meta'],
    queryFn: api.getTypesMeta,
  })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: api.listTags })
  const { data: tagGroups = [] } = useQuery({ queryKey: ['tagGroups'], queryFn: api.listTagGroups })
  const { data: suggestedTags = [] } = useQuery({
    queryKey: ['tag-suggestions', { tagIds: [...tagIds].sort((a, b) => a - b), workType: type }],
    queryFn: () => api.suggestTags({ tagIds, workType: type }),
    enabled: tagIds.length > 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  })
  const { data: collections = [] } = useQuery({ queryKey: ['collections'], queryFn: api.listCollections })

  const typeMeta = typesMeta.types.find(ty => ty.value === type)
  const isMovie = type === 'movie'
  const needsTotalUnits = !isMovie && releaseStatus === 'finished' && typeMeta?.has_range_progress
  const needsBackfillRangeEnd = backfillOn && !isMovie && typeMeta?.has_range_progress
  const isStep2Valid = title.trim()
    && (!needsTotalUnits || Number(totalUnits) > 0)
    && (!needsBackfillRangeEnd || parseInt(backfillRangeEnd, 10) > 0)
  const unitOptions = typeMeta?.unit_options || []
  const supportsCustomUnit = unitOptions.length > 0

  // 当前显示用的单位（已 i18n 化）
  const effectiveUnitDisplay = translateUnit(unitLabel || typeMeta?.unit_label || '', t)

  const create = useMutation({
    mutationFn: (payload) => api.createWork(payload, coverFile),
    onSuccess: (work) => navigate(`/works/${work.id}`),
    onError: (e) => setError(e.message || t('newWork.errors.createFailed')),
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
    setBackfillError('')

    if (!title.trim()) {
      setError(t('newWork.errors.titleRequiredAlt'))
      return
    }
    if (!isMovie && releaseStatus === 'finished' && typeMeta?.has_range_progress && !totalUnits) {
      setError(t('newWork.errors.totalRequiredFinished', { unit: effectiveUnitDisplay }))
      return
    }

    let backfillPayload = undefined
    if (backfillOn) {
      if (isMovie || !typeMeta?.has_range_progress) {
        backfillPayload = { range_end: null }
      } else {
        const n = parseInt(backfillRangeEnd, 10)
        if (!n || n < 1) {
          setBackfillError(t('newWork.errors.totalRequired', { unit: effectiveUnitDisplay }))
          setStep(2)
          return
        }
        backfillPayload = { range_end: n }
      }
    }

    const payload = {
      title,
      original_title: originalTitle || null,
      type,
      description: description || null,
      release_status: isMovie ? 'finished' : releaseStatus,
      total_units: isMovie ? 1 : (totalUnits ? parseInt(totalUnits, 10) : null),
      unit_label: supportsCustomUnit ? (unitLabel || null) : null,
      creators,
      tag_ids: tagIds,
      collection_ids: collectionIds,
      initial_status: initialStatus,
      ...(backfillPayload ? { backfill: backfillPayload } : {}),
    }

    create.mutate(payload)
  }

  const STATUSES = [
    ['want', '#64748b'],
    ['watching', '#2563eb'],
    ['done', '#16a34a'],
    ['dropped', '#dc2626'],
  ]

  return (
    <div className="max-w-[880px] mx-auto">
      {/* 页面头部 */}
      <div className="mb-7">
        <h1 className="text-[28px] font-semibold text-ink-900 leading-tight">{t('newWork.title')}</h1>
        <div className="text-sm text-ink-500 mt-1">
          {t('newWork.stepOf', { step })}
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
          <SectionTitle>{t('newWork.step1.title')}</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
            {typesMeta.types.map(ty => (
              <button key={ty.value}
                      onClick={() => { setType(ty.value); setUnitLabel(''); setStep(2) }}
                      className={`p-5 rounded-xl border-2 text-left transition-all ${
                        type === ty.value
                          ? 'border-brand-600 bg-brand-50 shadow-card'
                          : 'border-paper-200 hover:border-brand-400 bg-white'
                      }`}>
                <div className="font-medium text-base text-ink-900">{translateType(ty.value, t)}</div>
                <div className="text-xs text-ink-500 mt-1">{t('newWork.step1.unit', { unit: translateUnit(ty.unit_label, t) || '-' })}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-paper-200 shadow-card overflow-hidden">
          <Section title={t('newWork.step2.basic')} desc={t('newWork.step2.basicDesc')}>
            <FormGrid>
              <Field span={12} label={t('newWork.step2.fieldTitle')} required error={titleError}>
                <TextInput value={title}
                           onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError('') }}
                           autoFocus
                           placeholder={t('newWork.step2.titlePlaceholder')}
                           hasError={!!titleError} />
              </Field>

              <Field span={12} label={t('newWork.step2.originalTitle')} hint={t('common.optional')}>
                <TextInput value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)}
                           placeholder={t('newWork.step2.originalTitlePlaceholder')} />
              </Field>

              {typeMeta?.creator_fields?.length === 2 && (
                <>
                  <Field span={6} label={translateCreatorLabel(typeMeta.creator_fields[0], t)} hint={t('common.optional')}>
                    <TextInput value={creators[typeMeta.creator_fields[0].key] || ''}
                               onChange={(e) => setCreators(c => ({ ...c, [typeMeta.creator_fields[0].key]: e.target.value }))} />
                  </Field>
                  <Field span={6} label={translateCreatorLabel(typeMeta.creator_fields[1], t)} hint={t('common.optional')}>
                    <TextInput value={creators[typeMeta.creator_fields[1].key] || ''}
                               onChange={(e) => setCreators(c => ({ ...c, [typeMeta.creator_fields[1].key]: e.target.value }))} />
                  </Field>
                </>
              )}
              {typeMeta?.creator_fields?.length === 1 && (
                <Field span={6} label={translateCreatorLabel(typeMeta.creator_fields[0], t)} hint={t('common.optional')}>
                  <TextInput value={creators[typeMeta.creator_fields[0].key] || ''}
                             onChange={(e) => setCreators(c => ({ ...c, [typeMeta.creator_fields[0].key]: e.target.value }))} />
                </Field>
              )}

              <Field span={12} label={t('newWork.step2.description')} hint={t('common.optional')}>
                <TextArea rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
                          placeholder={t('newWork.step2.descriptionPlaceholder')} />
              </Field>
            </FormGrid>
          </Section>

          <Section title={t('newWork.step2.cover')} desc={t('newWork.step2.coverDesc')}>
            <CoverDropzone file={coverFile} preview={coverPreview}
                           onSelect={handleCoverSelect} onRemove={removeCover} />
          </Section>

          <Section title={t('newWork.step2.progress')} desc={t('newWork.step2.progressDesc', { unit: effectiveUnitDisplay })}>
            <FormGrid>
              {!isMovie && (
                <>
                  <Field span={6} label={t('newWork.step2.releaseStatus')}>
                    <SelectInput value={releaseStatus} onChange={(e) => {
                      setReleaseStatus(e.target.value)
                      if (e.target.value !== 'finished') setTotalUnitsError('')
                    }}>
                      <option value="ongoing">{translateRelease('ongoing', t)}</option>
                      <option value="finished">{translateRelease('finished', t)}</option>
                    </SelectInput>
                  </Field>
                  {typeMeta?.has_range_progress && (
                    <Field span={6} label={t('newWork.step2.totalUnits', { unit: effectiveUnitDisplay })}
                           hint={releaseStatus === 'finished' ? t('common.required') : t('common.optional')} error={totalUnitsError}>
                      <TextInput type="number" value={totalUnits} min={1}
                                 onChange={(e) => {
                                   setTotalUnits(e.target.value)
                                   if (totalUnitsError) setTotalUnitsError('')
                                 }}
                                 placeholder="24"
                                 hasError={!!totalUnitsError} />
                    </Field>
                  )}
                  {supportsCustomUnit && (
                    <Field span={6} label={t('newWork.step2.unitLabel')} hint={t('common.optional')}>
                      <SelectInput value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)}>
                        <option value="">{t('newWork.step2.unitDefault', { unit: translateUnit(typeMeta.unit_label, t) })}</option>
                        {unitOptions.map(u => (
                          <option key={u} value={u}>{translateUnit(u, t)}</option>
                        ))}
                      </SelectInput>
                    </Field>
                  )}
                </>
              )}

              {/* 补录区：让用户登记以前已经看过的内容 */}
              <Field span={12} label="" hint="" error={backfillError}>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="backfill-toggle"
                    checked={backfillOn}
                    onChange={(e) => {
                      setBackfillOn(e.target.checked)
                      if (!e.target.checked) {
                        setBackfillError('')
                        setBackfillRangeEnd('')
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <label htmlFor="backfill-toggle" className="text-sm text-ink-700 cursor-pointer select-none">
                    {t('newWork.backfill.toggle')}
                  </label>
                </div>
                {backfillOn && !isMovie && typeMeta?.has_range_progress && (
                  <div className="ml-6 mt-2 flex items-center gap-2">
                    <span className="text-xs text-ink-500">{t('newWork.backfill.toLabel', { unit: effectiveUnitDisplay })}</span>
                    <input
                      type="number"
                      min={1}
                      value={backfillRangeEnd}
                      onChange={(e) => {
                        setBackfillRangeEnd(e.target.value)
                        if (backfillError) setBackfillError('')
                      }}
                      className="!w-24 input-compact"
                    />
                  </div>
                )}
                {backfillOn && (isMovie || !typeMeta?.has_range_progress) && (
                  <div className="ml-6 mt-2 text-xs text-ink-500">
                    {t('newWork.backfill.movieHint')}
                  </div>
                )}
              </Field>
            </FormGrid>
          </Section>

          <div className="px-7 py-4 bg-paper-50 border-t border-paper-200 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>{t('common.prev')}</Button>
            <Button variant="primary"
                    className={!isStep2Valid ? '!bg-paper-100 !text-ink-500 !border-paper-300' : ''}
                    onClick={() => {
                      if (!title.trim()) {
                        setTitleError(t('newWork.errors.titleRequired'))
                        return
                      }
                      if (needsTotalUnits && !(Number(totalUnits) > 0)) {
                        setTotalUnitsError(t('newWork.errors.totalRequired', { unit: effectiveUnitDisplay }))
                        return
                      }
                      if (needsBackfillRangeEnd && !(parseInt(backfillRangeEnd, 10) > 0)) {
                        setBackfillError(t('newWork.errors.totalRequired', { unit: effectiveUnitDisplay }))
                        return
                      }
                      setTitleError('')
                      setTotalUnitsError('')
                      setBackfillError('')
                      setStep(3)
                    }}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-paper-200 shadow-card overflow-hidden">
          <Section title={t('newWork.step3.initialStatus')} desc={t('newWork.step3.initialStatusDesc')}>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(([val, color]) => {
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
                    {translateStatus(val, t)}
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title={t('newWork.step3.tags')} desc={t('newWork.step3.tagsSelected', { n: tagIds.length })}>
            <TagPicker
              allTags={tags}
              allGroups={tagGroups}
              selectedIds={tagIds}
              onChange={setTagIds}
              suggestedTags={suggestedTags}
            />
          </Section>

          <Section title={t('newWork.step3.collections')} desc={t('newWork.step3.tagsSelected', { n: collectionIds.length })}>
            {collections.length === 0 ? (
              <div className="text-sm text-ink-400 px-4 py-4 bg-paper-50 rounded-lg border border-paper-200">
                {t('newWork.step3.collectionsEmpty')}
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
            <Button variant="ghost" onClick={() => setStep(2)}>{t('common.prev')}</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending ? t('common.creating') : t('newWork.submit')}
            </Button>
          </div>
        </div>
      )}

      {pendingFile && (
        <Modal open={true} onClose={() => setPendingFile(null)} title={t('newWork.cropper.title')} size="md">
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

function SectionTitle({ children }) {
  return <h3 className="text-[15px] font-semibold text-ink-900">{children}</h3>
}

function FormGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5">{children}</div>
}

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
  // text-base (16px) 在 iOS Safari 聚焦时不会触发自动放大;桌面端通过 md:text-sm 恢复 14px。
  return `w-full min-h-11 rounded-xl border px-3.5 text-base md:text-sm text-ink-900 bg-slate-50/80 placeholder:text-ink-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition ${hasError
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

function CoverDropzone({ file, preview, onSelect, onRemove }) {
  const t = useT()
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
      {preview ? (
        <div className="relative flex-shrink-0">
          <img src={preview} alt={t('cover.preview')}
               className="w-[140px] h-[187px] object-cover rounded-lg border border-paper-200 shadow-card" />
          <button type="button" onClick={onRemove}
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white hover:bg-red-50 border border-paper-300 hover:border-red-300 hover:text-red-600 text-ink-500 flex items-center justify-center shadow-card transition-colors"
                  title={t('cover.removeTitle')}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={trigger}
                className="flex-shrink-0 w-[140px] h-[187px] rounded-lg border-2 border-dashed border-paper-300 bg-white hover:border-brand-500 flex flex-col items-center justify-center gap-2 text-ink-400 hover:text-brand-600 transition-colors">
          <ImageIcon size={32} strokeWidth={1.5} />
          <div className="text-xs font-medium">{t('cover.preview')}</div>
        </button>
      )}

      <div className="flex-1 min-w-0">
        {preview ? (
          <>
            <div className="text-sm text-ink-900 font-medium mb-1">{t('cover.selected')}</div>
            <div className="text-xs text-ink-500 mb-3 leading-relaxed">
              {t('cover.selectedHint')}
            </div>
            <div className="flex gap-2">
              <Button variant="default" type="button" onClick={trigger}>
                <Upload size={14} /> {t('cover.replace')}
              </Button>
              <Button variant="ghost" type="button" onClick={onRemove}>{t('cover.remove')}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-ink-900 font-medium mb-1">{t('cover.uploadPrompt')}</div>
            <div className="text-xs text-ink-500 mb-3 leading-relaxed">
              {t('cover.uploadHint')}<br/>
              {t('cover.uploadHintAlt')}
            </div>
            <Button variant="default" type="button" onClick={trigger}>
              <Upload size={14} /> {t('cover.choose')}
            </Button>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" onChange={onChange} className="hidden" />
    </div>
  )
}
