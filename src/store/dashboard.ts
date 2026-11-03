import { defineStore } from 'pinia'
import type {
  ComponentError,
  DashboardItem,
  DashboardTheme,
  LayoutIssue,
  Rect,
  SizeUnit
} from '../types'
import { checkLayout } from '../core/validator/layout'

export const DEFAULT_THEME: DashboardTheme = {
  primary: '#36cfc9',
  accent: '#597ef7',
  background: '#0b1026',
  panel: '#121a3a',
  textColor: '#dce4ff'
}

interface Snapshot {
  title: string
  theme: DashboardTheme
  items: DashboardItem[]
}

let idSeq = 1
export function nextId(): string {
  return `c${idSeq++}_${Math.random().toString(36).slice(2, 6)}`
}

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    title: 'AI 生成大屏',
    theme: { ...DEFAULT_THEME } as DashboardTheme,
    items: [] as DashboardItem[],
    canvas: { w: 1600, h: 900 },
    warnings: [] as LayoutIssue[],
    errors: [] as ComponentError[],
    selectedId: '',
    past: [] as Snapshot[],
    future: [] as Snapshot[],
    _lastLabel: '',
    _lastTime: 0
  }),
  getters: {
    itemCount: (s) => s.items.length,
    canUndo: (s) => s.past.length > 0,
    canRedo: (s) => s.future.length > 0
  },
  actions: {
    _snapshot(): Snapshot {
      return JSON.parse(JSON.stringify({ title: this.title, theme: this.theme, items: this.items }))
    },
    _apply(s: Snapshot) {
      this.title = s.title
      this.theme = s.theme
      this.items = s.items
      this.errors = []
      this.refreshWarnings()
    },
    /** 变更前记录快照；相同 label 在 800ms 内合并（拖拽场景） */
    record(label = 'op') {
      const now = Date.now()
      if (label === this._lastLabel && now - this._lastTime < 800) {
        this._lastTime = now
        return
      }
      this.past.push(this._snapshot())
      if (this.past.length > 60) this.past.shift()
      this.future = []
      this._lastLabel = label
      this._lastTime = now
    },
    undo() {
      if (!this.past.length) return
      this.future.push(this._snapshot())
      this._apply(this.past.pop() as Snapshot)
      this._lastLabel = ''
    },
    redo() {
      if (!this.future.length) return
      this.past.push(this._snapshot())
      this._apply(this.future.pop() as Snapshot)
      this._lastLabel = ''
    },
    applyPlan(title: string, theme?: Partial<DashboardTheme>) {
      this.record('plan')
      this.title = title || this.title
      if (theme) this.theme = { ...this.theme, ...theme }
      this.items = []
      this.warnings = []
      this.errors = []
    },
    addItem(item: Omit<DashboardItem, 'id'> & { id?: string }): DashboardItem {
      this.record('add')
      const full: DashboardItem = { ...item, id: item.id ?? nextId() } as DashboardItem
      this.items.push(full)
      this.refreshWarnings()
      return full
    },
    updateItem(id: string, patch: Partial<DashboardItem>, label?: string) {
      const idx = this.items.findIndex((i) => i.id === id)
      if (idx < 0) return false
      this.record(label ?? `upd:${id}`)
      this.items[idx] = { ...this.items[idx], ...patch, id }
      this.refreshWarnings()
      return true
    },
    removeItem(id: string) {
      const item = this.getItem(id)
      if (!item) return
      this.record('del')
      this.items = this.items.filter((i) => i.id !== id)
      this.errors = this.errors.filter((e) => e.itemId !== id)
      this.refreshWarnings()
    },
    replaceAll(title: string, theme: DashboardTheme, items: DashboardItem[]) {
      this.record('replace')
      this.title = title
      this.theme = theme
      this.items = items
      this.errors = []
      this.refreshWarnings()
    },
    getItem(id: string): DashboardItem | undefined {
      return this.items.find((i) => i.id === id)
    },
    refreshWarnings() {
      this.warnings = checkLayout(this.items, this.canvas.w, this.canvas.h)
    },
    pushError(err: ComponentError) {
      if (!this.errors.some((e) => e.itemId === err.itemId && e.message === err.message)) {
        this.errors.push(err)
      }
    },
    clearErrors() {
      this.errors = []
    },
    select(id: string) {
      this.selectedId = id
    }
  }
})

/** 画布 px 尺寸下解析 SizeUnit */
export function resolveSize(u: SizeUnit, total: number): number {
  return u.unit === '%' ? (u.value / 100) * total : u.value
}

export function resolveRect(rect: Rect, w: number, h: number) {
  return {
    x: resolveSize(rect.x, w),
    y: resolveSize(rect.y, h),
    w: resolveSize(rect.w, w),
    h: resolveSize(rect.h, h)
  }
}
