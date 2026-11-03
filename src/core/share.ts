import type { DashboardItem, DashboardState, DataSourceType, ChartType } from '../types'
import { useDashboardStore, DEFAULT_THEME } from '../store/dashboard'

/** 大屏方案的序列化 / 导出 / 导入 / 分享链接 */

interface ExportPayload {
  v: 1
  title: string
  theme: DashboardState['theme']
  items: DashboardItem[]
}

const VALID_TYPES = ['chart', 'kpi', 'table', 'text', 'custom']
const VALID_CHARTS = ['line', 'bar', 'pie', 'gauge', 'radar', 'scatter']
const VALID_SOURCES = ['timeSeries', 'category', 'ratio', 'ranking', 'metric']

function toBase64Url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return decodeURIComponent(escape(atob(b64)))
}

function sanitizeItem(raw: unknown): DashboardItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !VALID_TYPES.includes(String(r.type))) return null
  const rect = r.rect as Record<string, { value: number; unit: string }> | undefined
  if (!rect || typeof rect.x?.value !== 'number' || typeof rect.y?.value !== 'number') return null
  const item: DashboardItem = {
    id: r.id,
    type: r.type as DashboardItem['type'],
    title: typeof r.title === 'string' ? r.title : '未命名',
    rect: {
      x: { value: rect.x.value, unit: rect.x.unit === 'px' ? 'px' : '%' },
      y: { value: rect.y.value, unit: rect.y.unit === 'px' ? 'px' : '%' },
      w: { value: Number(rect.w?.value ?? 30), unit: rect.w?.unit === 'px' ? 'px' : '%' },
      h: { value: Number(rect.h?.value ?? 30), unit: rect.h?.unit === 'px' ? 'px' : '%' }
    }
  }
  if (VALID_CHARTS.includes(String(r.chartType))) item.chartType = r.chartType as ChartType
  const dc = r.dataConfig as Record<string, unknown> | undefined
  if (dc && VALID_SOURCES.includes(String(dc.sourceType)) && typeof dc.name === 'string') {
    item.dataConfig = {
      sourceType: dc.sourceType as DataSourceType,
      name: dc.name,
      points: typeof dc.points === 'number' ? dc.points : undefined,
      categories: Array.isArray(dc.categories) ? (dc.categories as string[]).slice(0, 12) : undefined,
      min: typeof dc.min === 'number' ? dc.min : undefined,
      max: typeof dc.max === 'number' ? dc.max : undefined,
      unit: typeof dc.unit === 'string' ? dc.unit : undefined
    }
  }
  if (typeof r.text === 'string') item.text = r.text
  if (typeof r.code === 'string' && r.type === 'custom' && r.code.length < 50000) item.code = r.code
  return item
}

function sanitizePayload(raw: unknown): ExportPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.v !== 1 || !Array.isArray(r.items)) return null
  const items = (r.items as unknown[]).map(sanitizeItem).filter((i): i is DashboardItem => i !== null)
  const theme = (r.theme ?? {}) as Partial<DashboardState['theme']>
  return {
    v: 1,
    title: typeof r.title === 'string' ? r.title.slice(0, 50) : '导入的大屏',
    theme: { ...DEFAULT_THEME, ...theme },
    items
  }
}

export function serializeCurrent(): ExportPayload {
  const dash = useDashboardStore()
  return { v: 1, title: dash.title, theme: dash.theme, items: dash.items }
}

export function downloadJson(): void {
  const payload = serializeCurrent()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `nl2dashboard-${payload.title || 'dashboard'}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function importJson(file: File): Promise<string> {
  const text = await file.text()
  const payload = sanitizePayload(JSON.parse(text))
  if (!payload) throw new Error('文件格式不合法：不是有效的 NL2Dashboard 方案')
  const dash = useDashboardStore()
  dash.replaceAll(payload.title, payload.theme, payload.items)
  return `${payload.title}（${payload.items.length} 个组件）`
}

export function buildShareUrl(): string {
  const encoded = toBase64Url(JSON.stringify(serializeCurrent()))
  return `${location.origin}${location.pathname}#s=${encoded}`
}

export function applyFromHash(): boolean {
  const m = location.hash.match(/^#s=(.+)$/)
  if (!m) return false
  try {
    const payload = sanitizePayload(JSON.parse(fromBase64Url(m[1])))
    if (!payload || payload.items.length === 0) return false
    const dash = useDashboardStore()
    dash.replaceAll(payload.title, payload.theme, payload.items)
    return true
  } catch {
    return false
  }
}
