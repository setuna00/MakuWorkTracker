import { useState, useRef, useEffect, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useT } from '../lib/i18n'

/**
 * 封面裁剪器（固定 3:4 比例）
 *
 * 设计：
 * - 容器尺寸固定（CSS：宽 = h * 3/4），裁剪框就是整个容器
 * - 用户拖动的是底层图片（位置和缩放），裁剪框不动
 * - 提交时把图片绘制到 canvas 输出固定输出尺寸的 JPEG
 *
 * @param file        File 对象（用户选的图）
 * @param onCancel    取消回调
 * @param onConfirm   (croppedFile: File) => void
 */
export function CoverCropper({ file, onCancel, onConfirm }) {
  const t = useT()
  const containerRef = useRef(null)
  const imgRef = useRef(null)

  // 容器显示尺寸（实际 CSS 像素）
  const DISPLAY_W = 240
  const DISPLAY_H = 320  // 3:4

  // 输出尺寸（保存到后端的图片尺寸）
  const OUTPUT_W = 900
  const OUTPUT_H = 1200

  const [imgUrl, setImgUrl] = useState(null)
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)        // 当前缩放系数（1 = 完全填满裁剪框的最小缩放）
  const [minScale, setMinScale] = useState(1)
  const [maxScale, setMaxScale] = useState(4)
  const [pos, setPos] = useState({ x: 0, y: 0 })  // 图片左上角相对容器左上角的偏移（CSS 像素）
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const [confirming, setConfirming] = useState(false)

  // 加载图片
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // 图片加载完成后计算初始缩放
  const onImgLoad = (e) => {
    const w = e.target.naturalWidth
    const h = e.target.naturalHeight
    setImgNaturalSize({ w, h })

    // 计算 minScale = 让图片刚好填满裁剪框的缩放
    // 图片显示宽 = w * scale，要 >= DISPLAY_W；显示高 = h * scale，要 >= DISPLAY_H
    const fillScale = Math.max(DISPLAY_W / w, DISPLAY_H / h)
    setMinScale(fillScale)
    setScale(fillScale)
    setMaxScale(fillScale * 5)

    // 居中
    centerImage(w, h, fillScale)
  }

  const centerImage = (w, h, s) => {
    const dispW = w * s
    const dispH = h * s
    setPos({
      x: (DISPLAY_W - dispW) / 2,
      y: (DISPLAY_H - dispH) / 2,
    })
  }

  // 限制偏移：图片不能露出裁剪框外的空白
  const clampPos = useCallback((p, s) => {
    const dispW = imgNaturalSize.w * s
    const dispH = imgNaturalSize.h * s
    return {
      x: Math.min(0, Math.max(DISPLAY_W - dispW, p.x)),
      y: Math.min(0, Math.max(DISPLAY_H - dispH, p.y)),
    }
  }, [imgNaturalSize])

  // 调整缩放后保持中心点位置
  const setScaleKeepCenter = (newScale) => {
    const s = Math.max(minScale, Math.min(maxScale, newScale))
    if (imgNaturalSize.w === 0) return setScale(s)
    // 当前裁剪框中心对应图片上的"原始"坐标
    const oldCenterX = (DISPLAY_W / 2 - pos.x) / scale
    const oldCenterY = (DISPLAY_H / 2 - pos.y) / scale
    const newPos = {
      x: DISPLAY_W / 2 - oldCenterX * s,
      y: DISPLAY_H / 2 - oldCenterY * s,
    }
    setScale(s)
    setPos(clampPos(newPos, s))
  }

  // 拖动
  const onMouseDown = (e) => {
    setDragging(true)
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, posX: pos.x, posY: pos.y }
    e.preventDefault()
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const cx = e.clientX ?? e.touches?.[0]?.clientX
      const cy = e.clientY ?? e.touches?.[0]?.clientY
      if (cx == null) return
      const dx = cx - dragStart.current.mouseX
      const dy = cy - dragStart.current.mouseY
      const newPos = clampPos({
        x: dragStart.current.posX + dx,
        y: dragStart.current.posY + dy,
      }, scale)
      setPos(newPos)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging, scale, clampPos])

  // 滚轮缩放
  const onWheel = (e) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.002
    setScaleKeepCenter(scale * (1 + delta))
  }

  const reset = () => {
    setScale(minScale)
    centerImage(imgNaturalSize.w, imgNaturalSize.h, minScale)
  }

  // 触摸版本（移动端）
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      setDragging(true)
      dragStart.current = {
        mouseX: e.touches[0].clientX,
        mouseY: e.touches[0].clientY,
        posX: pos.x,
        posY: pos.y,
      }
    }
  }

  // 提交：把图片画到 canvas，输出 JPEG
  const handleConfirm = async () => {
    if (!imgRef.current) return
    setConfirming(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_W
      canvas.height = OUTPUT_H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H)

      // 将 CSS 像素的位置/缩放映射到 OUTPUT 尺寸
      const ratio = OUTPUT_W / DISPLAY_W
      const drawW = imgNaturalSize.w * scale * ratio
      const drawH = imgNaturalSize.h * scale * ratio
      const drawX = pos.x * ratio
      const drawY = pos.y * ratio

      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(imgRef.current, drawX, drawY, drawW, drawH)

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

  return (
    <div className="space-y-3">
      <div className="text-xs text-ink-500">
        {t('cover.cropperHint')}
      </div>

      <div className="flex justify-center">
        <div
          ref={containerRef}
          className="relative bg-paper-100 overflow-hidden cursor-move select-none rounded-lg border-2 border-brand-800"
          style={{ width: DISPLAY_W, height: DISPLAY_H }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onWheel={onWheel}
        >
          <img
            ref={imgRef}
            src={imgUrl}
            onLoad={onImgLoad}
            alt={t('newWork.cropper.title')}
            draggable={false}
            crossOrigin="anonymous"
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: imgNaturalSize.w * scale,
              height: imgNaturalSize.h * scale,
              maxWidth: 'none',
              maxHeight: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 justify-center">
        <button type="button" onClick={() => setScaleKeepCenter(scale * 0.85)}
                className="p-1.5 rounded-md hover:bg-paper-100 text-ink-700">
          <ZoomOut size={16} />
        </button>
        <input
          type="range"
          min={minScale}
          max={maxScale}
          step={0.01}
          value={scale}
          onChange={(e) => setScaleKeepCenter(parseFloat(e.target.value))}
          className="flex-1 max-w-[200px] !p-0 !border-0 !bg-transparent !shadow-none"
        />
        <button type="button" onClick={() => setScaleKeepCenter(scale * 1.15)}
                className="p-1.5 rounded-md hover:bg-paper-100 text-ink-700">
          <ZoomIn size={16} />
        </button>
        <button type="button" onClick={reset}
                className="p-1.5 rounded-md hover:bg-paper-100 text-ink-700"
                title={t('cover.reset')}>
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-paper-200">
        <button type="button" onClick={onCancel}
                className="px-3.5 py-1.5 rounded-md text-sm font-medium hover:bg-paper-100 text-ink-700">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={handleConfirm} disabled={confirming}
                className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-brand-800 hover:bg-brand-700 text-white disabled:opacity-50">
          {confirming ? t('common.processing') : t('cover.applyCrop')}
        </button>
      </div>
    </div>
  )
}
