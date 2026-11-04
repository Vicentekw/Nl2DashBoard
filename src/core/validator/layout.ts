import type { DashboardItem, LayoutIssue, Rect, SizeUnit } from '../../types'

/** 画布顶部标题区高度占比（%），标题由系统自动渲染，组件禁止侵入 */
export const TITLE_BAND_PCT = 7

/** 解析混合单位尺寸为 px（画布坐标） */
export function resolveSize(u: SizeUnit, total: number): number {
  return u.unit === '%' ? (u.value / 100) * total : u.value
}

function rectPx(item: DashboardItem, w: number, h: number) {
  const r = item.rect
  return {
    x: resolveSize(r.x, w),
    y: resolveSize(r.y, h),
    w: resolveSize(r.w, w),
    h: resolveSize(r.h, h)
  }
}

/**
 * 布局自检：组件重叠 + 越界检测。
 * 以数据驱动方式让 AI 自主发现并修正布局问题（替代截图视觉方案）。
 */
export function checkLayout(items: DashboardItem[], canvasW: number, canvasH: number): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const minArea = canvasW * canvasH * 0.001 // 忽略小于 0.1% 画布面积的擦边接触

  for (const item of items) {
    const r = rectPx(item, canvasW, canvasH)
    const tol = 0.5
    if (r.x < -tol || r.y < -tol || r.x + r.w > canvasW + tol || r.y + r.h > canvasH + tol) {
      issues.push({
        itemId: item.id,
        itemTitle: item.title,
        kind: 'out-of-bounds',
        detail: `组件越界：位置 (${Math.round(r.x)}, ${Math.round(r.y)})，尺寸 ${Math.round(r.w)}×${Math.round(r.h)}，画布 ${canvasW}×${canvasH}`
      })
    }
    // 标题区保护：顶部 TITLE_BAND_PCT% 高度由系统渲染大屏标题，组件侵入会被标题遮盖
    const titleBandH = (TITLE_BAND_PCT / 100) * canvasH
    if (r.y < titleBandH - tol && r.y + r.h > 0) {
      issues.push({
        itemId: item.id,
        itemTitle: item.title,
        kind: 'out-of-bounds',
        detail: `组件侵入顶部标题区（画布顶部 ${TITLE_BAND_PCT}% 高度由系统渲染标题，会被遮盖）：当前 y 对应 ${Math.round(r.y)}px，请将 y 调整到 ≥ ${TITLE_BAND_PCT}%`
      })
    }
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = rectPx(items[i], canvasW, canvasH)
      const b = rectPx(items[j], canvasW, canvasH)
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 0 && oy > 0 && ox * oy > minArea) {
        issues.push({
          itemId: items[j].id,
          itemTitle: items[j].title,
          kind: 'overlap',
          detail: `「${items[i].title}」与「${items[j].title}」重叠，重叠面积 ${Math.round(ox)}×${Math.round(oy)}px`
        })
      }
    }
  }
  return issues
}

/** 工具入参尺寸解析："12.5%" / "120px" / 数字（默认百分比） */
export function parseSizeInput(input: unknown, fallback: SizeUnit): SizeUnit {
  if (typeof input === 'string') {
    const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*(%|px)?$/i)
    if (m) {
      return { value: parseFloat(m[1]), unit: (m[2] || '%').toLowerCase() === 'px' ? 'px' : '%' }
    }
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    return { value: input, unit: '%' }
  }
  return fallback
}

export function parseRectInput(
  input: { x?: unknown; y?: unknown; w?: unknown; h?: unknown },
  fallback: Rect
): Rect {
  return {
    x: parseSizeInput(input.x, fallback.x),
    y: parseSizeInput(input.y, fallback.y),
    w: parseSizeInput(input.w, fallback.w),
    h: parseSizeInput(input.h, fallback.h)
  }
}

/** 深拷贝 Rect */
export function cloneRect(r: Rect): Rect {
  return JSON.parse(JSON.stringify(r)) as Rect
}

/**
 * 兜底一：把矩形钳制进画布（AI 给的坐标越界时自动修正，不让脏数据落画布）。
 * 保证位置 ≥ 0（或保留区之下）且 位置+尺寸 ≤ 画布；尺寸过小则抬到最小可用值。
 * reservedTopPct：顶部保留区高度占比（标题区），组件 y 会被推到保留区之下。
 */
export function clampRectIntoCanvas(
  rect: Rect,
  canvasW: number,
  canvasH: number,
  minPct = 5,
  reservedTopPct = 0
): void {
  const clampAxis = (
    pos: SizeUnit,
    size: SizeUnit,
    total: number,
    minPosU: number
  ): { pos: SizeUnit; size: SizeUnit } => {
    const isPct = size.unit === '%'
    const totalU = isPct ? 100 : total
    const minSize = isPct ? minPct : Math.max(40, (minPct / 100) * total)
    let s = Math.min(Math.max(size.value, minSize), totalU - minPosU)
    let p = Math.min(Math.max(pos.value, minPosU), totalU - s)
    if (p + s > totalU) {
      s = totalU - p
      if (s < minSize) {
        s = minSize
        p = totalU - s
      }
    }
    return { pos: { ...pos, value: Math.round(p * 100) / 100 }, size: { ...size, value: Math.round(s * 100) / 100 } }
  }
  const x = clampAxis(rect.x, rect.w, canvasW, 0)
  rect.x = x.pos
  rect.w = x.size
  const minY = rect.y.unit === '%' ? reservedTopPct : (reservedTopPct / 100) * canvasH
  const y = clampAxis(rect.y, rect.h, canvasH, minY)
  rect.y = y.pos
  rect.h = y.size
}

/** 以 px 判断两矩形是否重叠（忽略 0.1% 面积以下的擦边接触） */
function overlaps(a: Rect, b: Rect, canvasW: number, canvasH: number): boolean {
  const pa = { x: resolveSize(a.x, canvasW), y: resolveSize(a.y, canvasH), w: resolveSize(a.w, canvasW), h: resolveSize(a.h, canvasH) }
  const pb = { x: resolveSize(b.x, canvasW), y: resolveSize(b.y, canvasH), w: resolveSize(b.w, canvasW), h: resolveSize(b.h, canvasH) }
  const ox = Math.min(pa.x + pa.w, pb.x + pb.w) - Math.max(pa.x, pb.x)
  const oy = Math.min(pa.y + pa.h, pb.y + pb.h) - Math.max(pa.y, pb.y)
  return ox > 0 && oy > 0 && ox * oy > canvasW * canvasH * 0.001
}

/**
 * 兜底二：为组件寻找第一个不与现有组件重叠的空闲位置（自上而下、自左向右网格扫描）。
 * 找不到返回 null（画布已满，交还给 AI 决策）。
 */
export function findFreeSlot(
  target: Rect,
  others: Rect[],
  canvasW: number,
  canvasH: number
): Rect | null {
  const stepPct = 2
  const toPct = (u: SizeUnit, total: number) => (u.unit === '%' ? u.value : (u.value / total) * 100)
  const wPct = Math.min(Math.max(toPct(target.w, canvasW), 5), 100)
  const hPct = Math.min(Math.max(toPct(target.h, canvasH), 5), 100)
  const candidate: Rect = {
    x: { value: 0, unit: '%' },
    y: { value: 0, unit: '%' },
    w: { ...target.w },
    h: { ...target.h }
  }
  for (let y = TITLE_BAND_PCT; y + hPct <= 100 + 0.01; y += stepPct) {
    for (let x = 0; x + wPct <= 100 + 0.01; x += stepPct) {
      candidate.x = { value: x, unit: '%' }
      candidate.y = { value: y, unit: '%' }
      if (!others.some((o) => overlaps(candidate, o, canvasW, canvasH))) {
        return cloneRect(candidate)
      }
    }
  }
  return null
}
