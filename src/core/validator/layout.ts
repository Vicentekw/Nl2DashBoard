import type { DashboardItem, LayoutIssue, Rect, SizeUnit } from '../../types'

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
