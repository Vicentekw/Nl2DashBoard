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
    selectedId: ''
  }),
  getters: {
    itemCount: (s) => s.items.length
  },
  actions: {
    applyPlan(title: string, theme?: Partial<DashboardTheme>) {
      this.title = title || this.title
      if (theme) this.theme = { ...this.theme, ...theme }
      this.items = []
      this.warnings = []
      this.errors = []
    },
    addItem(item: Omit<DashboardItem, 'id'> & { id?: string }): DashboardItem {
      const full: DashboardItem = { ...item, id: item.id ?? nextId() } as DashboardItem
      this.items.push(full)
      this.refreshWarnings()
      return full
    },
    updateItem(id: string, patch: Partial<DashboardItem>) {
      const idx = this.items.findIndex((i) => i.id === id)
      if (idx < 0) return false
      this.items[idx] = { ...this.items[idx], ...patch, id }
      this.refreshWarnings()
      return true
    },
    removeItem(id: string) {
      this.items = this.items.filter((i) => i.id !== id)
      this.errors = this.errors.filter((e) => e.itemId !== id)
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
