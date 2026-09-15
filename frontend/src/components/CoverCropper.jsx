import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import {
  ZoomIn, ZoomOut, Maximize, Minimize,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
} from 'lucide-react'
import { useT } from '../lib/i18n'

/**
 * 封面裁剪器（固定 3:4 比例）
 *
 * 设计：
 * - 舞台比裁剪框大，框外的图片压暗显示，能看到框外还有什么
 * - 视图状态与显示尺寸无关：zoom（1 = 刚好填满裁剪框）+ 裁剪框中心对准的原图坐标 (cx, cy)。
 *   弹窗大小变化、输出到 canvas 都套同一个公式，不会错位
 * - 只要求"裁剪框中心落在图片上"，允许拖出留白、缩小到完整显示；留白部分输出为白底
 *
 * @param file        File 对象（用户选的图）
 * @param onCancel    取消回调
 * @param onConfirm   (croppedFile: File) => void
 */

// 输出尺寸（保存到后端的图片尺寸）
const OUTPUT_W = 900
const OUTPUT_H = 1200

const MAX_ZOOM = 8
const ZOOM_STEP = 1.05      // 按钮、键盘、鼠标滚轮一格都是 5%
const SLIDER_STEPS = 1000
const STAGE_PAD_X = 12      // 裁剪框距舞台边缘的最小留边
const STAGE_PAD_Y = 20

// 让图片刚好盖满 w×h 的缩放（原图像素 → 显示像素）
const coverScale = (img, w, h) => Math.max(w / img.w, h / img.h)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function CoverCropper({ file, onCancel, onConfirm }) {
  const t = useT()
  const stageRef = useRef(null)
  const imgRef = useRef(null)

  const [imgUrl, setImgUrl] = useState(null)
  const [img, setImg] = useState(null)   // 原图尺寸 { w, h }
  const [view, setViewState] = useState({ zoom: 1, cx: 0, cy: 0 })
  const viewRef = useRef(view)           // 事件处理里读最新值，连续事件不会拿到旧 state
  const [stageW, setStageW] = useState(0)
  const [viewport, setViewport] = useState(() => ({
    h: window.innerHeight,
    wide: window.innerWidth >= 768,
  }))
  const [dragging, setDragging] = useState(false)
  const [zoomDraft, setZoomDraft] = useState(null)  // 百分比输入框正在编辑的文本
  const [confirming, setConfirming] = useState(false)
  const pointers = useRef(new Map())  // pointerId → 当前坐标
  const gesture = useRef(null)        // 手势开始时的快照

  const setView = (next) => {
    viewRef.current = next
    setViewState(next)
  }

  // 加载图片
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // 舞台宽度跟随弹窗
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    setStageW(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setStageW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [imgUrl])

  useEffect(() => {
    const onResize = () => setViewport({ h: window.innerHeight, wide: window.innerWidth >= 768 })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 裁剪框高度 = 弹窗最大高度(90vh) 减去其他内容：宽屏控件在右侧，只扣标题和提示；
  // 窄屏控件排在下面，要多扣一些，保证不用滚动就能点到"应用裁剪"
  const reservedH = viewport.wide ? 210 : 390
  const maxFrameH = clamp(viewport.h * 0.9 - reservedH, 220, 640)
  const frameH = Math.max(160, Math.min(maxFrameH, (stageW - STAGE_PAD_X * 2) * 4 / 3))
  const frameW = frameH * 3 / 4
  const frameLeft = (stageW - frameW) / 2
  const frameTop = STAGE_PAD_Y
  const stageH = frameH + STAGE_PAD_Y * 2
  const frameStyle = { left: frameLeft, top: frameTop, width: frameW, height: frameH }

  const cover = img ? coverScale(img, frameW, frameH) : 1
  const scale = cover * view.zoom
  // 完整显示整张图时的 zoom（≤ 1）；允许再缩小一半，给想留边的情况
  const fitZoom = img ? Math.min(frameW / img.w, frameH / img.h) / cover : 1
  const minZoom = fitZoom / 2

  const clampView = (v) => ({
    zoom: clamp(v.zoom, minZoom, MAX_ZOOM),
    cx: clamp(v.cx, 0, img.w),
    cy: clamp(v.cy, 0, img.h),
  })

  // 以舞台内某点为锚缩放（锚点下的画面不动）；不给锚点就以裁剪框中心为锚
  const zoomAt = (zoom, anchor) => {
    if (!img) return
    const v = viewRef.current
    const z = clamp(zoom, minZoom, MAX_ZOOM)
    const ox = anchor ? anchor.x - (frameLeft + frameW / 2) : 0
    const oy = anchor ? anchor.y - (frameTop + frameH / 2) : 0
    const s0 = cover * v.zoom
    const s1 = cover * z
    setView(clampView({ zoom: z, cx: v.cx + ox / s0 - ox / s1, cy: v.cy + oy / s0 - oy / s1 }))
  }

  // 按屏幕像素平移图片
  const panBy = (dx, dy) => {
    if (!img) return
    const v = viewRef.current
    const s = cover * v.zoom
    setView(clampView({ ...v, cx: v.cx - dx / s, cy: v.cy - dy / s }))
  }

  const onImgLoad = (e) => {
    const w = e.target.naturalWidth
    const h = e.target.naturalHeight
    setImg({ w, h })
    setView({ zoom: 1, cx: w / 2, cy: h / 2 })
  }

  // ---- 拖动 / 双指缩放（Pointer Events 统一处理鼠标和触摸） ----
  // 手指数变化时重新拍快照，之后每次移动都相对快照计算，不会累积误差
  const beginGesture = () => {
    const pts = [...pointers.current.values()]
    gesture.current = pts.length
      ? { pts, view: viewRef.current, rect: stageRef.current.getBoundingClientRect() }
      : null
    setDragging(pts.length > 0)
  }

  const onPointerDown = (e) => {
    if (!img || (e.pointerType === 'mouse' && e.button !== 0)) return
    stageRef.current.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    beginGesture()
  }

  const onPointerMove = (e) => {
    const g = gesture.current
    if (!g || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    const s0 = cover * g.view.zoom
    if (pts.length === 1) {
      setView(clampView({
        ...g.view,
        cx: g.view.cx - (pts[0].x - g.pts[0].x) / s0,
        cy: g.view.cy - (pts[0].y - g.pts[0].y) / s0,
      }))
      return
    }
    // 双指：两指距离决定缩放，两指中点下的画面跟着手指走
    const ratio = distance(pts[0], pts[1]) / Math.max(1, distance(g.pts[0], g.pts[1]))
    const zoom = clamp(g.view.zoom * ratio, minZoom, MAX_ZOOM)
    const s1 = cover * zoom
    const fcx = g.rect.left + frameLeft + frameW / 2
    const fcy = g.rect.top + frameTop + frameH / 2
    const m0 = midpoint(g.pts[0], g.pts[1])
    const m1 = midpoint(pts[0], pts[1])
    setView(clampView({
      zoom,
      cx: g.view.cx + (m0.x - fcx) / s0 - (m1.x - fcx) / s1,
      cy: g.view.cy + (m0.y - fcy) / s0 - (m1.y - fcy) / s1,
    }))
  }

  const onPointerEnd = (e) => {
    if (pointers.current.delete(e.pointerId)) beginGesture()
  }

  // 滚轮缩放，以鼠标位置为锚。触控板捏合会带 ctrlKey，按浏览器约定用 exp 换算
  const onWheel = (e) => {
    if (!img) return
    e.preventDefault()
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
    const factor = e.ctrlKey ? Math.exp(-dy / 100) : Math.pow(ZOOM_STEP, -dy / 100)
    const rect = stageRef.current.getBoundingClientRect()
    zoomAt(viewRef.current.zoom * factor, { x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  const wheelHandler = useRef(onWheel)
  wheelHandler.current = onWheel
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    // React 的 onWheel 是 passive 监听，preventDefault 拦不住弹窗滚动，只能手动挂
    const handler = (e) => wheelHandler.current(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [imgUrl])

  // 方向键微调位置（Shift 每次 10px），+ / - 缩放
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 1
    const moves = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    if (moves[e.key]) {
      e.preventDefault()
      panBy(...moves[e.key])
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomAt(viewRef.current.zoom * ZOOM_STEP)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoomAt(viewRef.current.zoom / ZOOM_STEP)
    }
  }

  // 滑块用对数刻度：小倍率和大倍率区间一样好调
  const zoomRange = Math.log(MAX_ZOOM / minZoom)
  const sliderValue = Math.round(SLIDER_STEPS * Math.log(view.zoom / minZoom) / zoomRange)
  const onSlider = (e) => {
    let z = minZoom * Math.exp(zoomRange * Number(e.target.value) / SLIDER_STEPS)
    // 滑到"填满"或"完整显示"附近时吸附，省得对不准
    for (const snap of [1, fitZoom]) {
      if (Math.abs(z / snap - 1) < 0.015) z = snap
    }
    zoomAt(z)
  }

  // 以框中心为锚缩放，所以边打字边生效也不会跑位
  const onZoomInput = (e) => {
    setZoomDraft(e.target.value)
    const n = parseFloat(e.target.value)
    if (n > 0) zoomAt(n / 100)
  }

  const fill = () => setView({ zoom: 1, cx: img.w / 2, cy: img.h / 2 })
  const fit = () => setView({ zoom: fitZoom, cx: img.w / 2, cy: img.h / 2 })
  const centerH = () => setView({ ...viewRef.current, cx: img.w / 2 })
  const centerV = () => setView({ ...viewRef.current, cy: img.h / 2 })

  // 提交：把图片画到 canvas，输出 JPEG
  const handleConfirm = async () => {
    if (!imgRef.current || !img) return
    setConfirming(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_W
      canvas.height = OUTPUT_H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H)

      // 与屏幕上同一套公式，只是把裁剪框换成输出尺寸
      const s = coverScale(img, OUTPUT_W, OUTPUT_H) * view.zoom
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        imgRef.current,
        OUTPUT_W / 2 - view.cx * s,
        OUTPUT_H / 2 - view.cy * s,
        img.w * s,
        img.h * s,
      )

      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      )
      if (!blob) throw new Error('blob failed')

      const out = new File([blob], (file.name || 'cover').replace(/\.[^.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
      })
      onConfirm(out)
    } catch (e) {
      console.error(e)
      alert(t('cover.cropFailed', { msg: e.message }))
    } finally {
      setConfirming(false)
    }
  }

  if (!imgUrl) return null

  const guideClass = `absolute bg-brand-400 transition-opacity ${dragging ? 'opacity-90' : 'opacity-0'}`

  return (
    <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-[minmax(0,1fr)_15rem] md:gap-5">
      <div className="space-y-2 min-w-0">
        {/* 窄屏多半是触屏：提示省掉键盘操作，把高度留给裁剪框 */}
        <div className="text-xs text-ink-500 leading-relaxed">
          {t(viewport.wide ? 'cover.cropperHint' : 'cover.cropperHintTouch')}
        </div>

        <div
          ref={stageRef}
          tabIndex={0}
          className={`relative overflow-hidden rounded-lg bg-ink-700 select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ height: stageH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          {/* 框内白底 = 输出图里留白的颜色 */}
          <div className="absolute bg-white" style={frameStyle} />
          <img
            ref={imgRef}
            src={imgUrl}
            onLoad={onImgLoad}
            alt={t('newWork.cropper.title')}
            draggable={false}
            crossOrigin="anonymous"
            className="absolute max-w-none pointer-events-none"
            style={img ? {
              left: frameLeft + frameW / 2 - view.cx * scale,
              top: frameTop + frameH / 2 - view.cy * scale,
              width: img.w * scale,
              height: img.h * scale,
            } : { visibility: 'hidden' }}
          />
          {/* 框外压暗 + 框线；拖动时显示中线，方便对齐居中 */}
          <div
            className="absolute pointer-events-none"
            style={{
              ...frameStyle,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
              outline: '2px solid rgba(255, 255, 255, 0.9)',
            }}
          >
            <div className={`${guideClass} inset-y-0 left-1/2 w-px`} />
            <div className={`${guideClass} inset-x-0 top-1/2 h-px`} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:gap-5">
        {/* 宽屏：标题行放百分比，滑块和说明各占一行；窄屏：滑块和百分比挤在一行省高度 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden md:block flex-1 text-xs text-ink-500 font-medium">{t('cover.zoom')}</span>
          <div className="order-last md:order-none flex items-center gap-1 text-sm text-ink-700">
            <input
              type="number"
              min={Math.ceil(minZoom * 100)}
              max={MAX_ZOOM * 100}
              step={1}
              value={zoomDraft ?? Math.round(view.zoom * 100)}
              onChange={onZoomInput}
              onBlur={() => setZoomDraft(null)}
              disabled={!img}
              className="input-compact !w-20 text-right tabular-nums"
            />
            <span>%</span>
          </div>
          <div className="flex-1 min-w-0 md:basis-full md:order-last flex items-center gap-2">
            <button type="button" onClick={() => zoomAt(view.zoom / ZOOM_STEP)} disabled={!img}
                    title={t('cover.zoomOut')}
                    className="p-1.5 rounded-md hover:bg-paper-100 text-ink-700 flex-shrink-0 disabled:opacity-50">
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              step={1}
              value={sliderValue}
              onChange={onSlider}
              disabled={!img}
              className="flex-1 min-w-0"
            />
            <button type="button" onClick={() => zoomAt(view.zoom * ZOOM_STEP)} disabled={!img}
                    title={t('cover.zoomIn')}
                    className="p-1.5 rounded-md hover:bg-paper-100 text-ink-700 flex-shrink-0 disabled:opacity-50">
              <ZoomIn size={16} />
            </button>
          </div>
          <div className="hidden md:block basis-full order-last text-[11px] text-ink-400 leading-relaxed">
            {t('cover.zoomHint')}
          </div>
        </div>

        <div>
          <div className="text-xs text-ink-500 font-medium mb-2">{t('cover.position')}</div>
          <div className="grid grid-cols-2 gap-2">
            <ToolButton icon={Maximize} label={t('cover.fill')} onClick={fill} disabled={!img} />
            <ToolButton icon={Minimize} label={t('cover.fit')} onClick={fit} disabled={!img} />
            <ToolButton icon={AlignHorizontalJustifyCenter} label={t('cover.centerH')} onClick={centerH} disabled={!img} />
            <ToolButton icon={AlignVerticalJustifyCenter} label={t('cover.centerV')} onClick={centerV} disabled={!img} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-paper-200 md:mt-auto">
          <button type="button" onClick={onCancel}
                  className="px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-paper-100 text-ink-700">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={confirming || !img}
                  className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-brand-800 hover:bg-brand-700 text-white disabled:opacity-50">
            {confirming ? t('common.processing') : t('cover.applyCrop')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ToolButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-paper-300 bg-white text-xs text-ink-700 hover:border-brand-500 hover:text-brand-700 transition-colors disabled:opacity-50"
    >
      <Icon size={14} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
