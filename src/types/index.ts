/** 尺寸单位：支持百分比与像素混合坐标 */
export interface SizeUnit {
  value: number
  unit: 'px' | '%'
}

export interface Rect {
  x: SizeUnit
  y: SizeUnit
  w: SizeUnit
  h: SizeUnit
}

export type ChartType = 'line' | 'bar' | 'pie' | 'gauge' | 'radar' | 'scatter'

export type DataSourceType = 'timeSeries' | 'category' | 'ratio' | 'ranking' | 'metric'

/** 由模拟数据生成器产出的标准化数据集 */
export interface Dataset {
  labels: string[]
  series: Array<{ name: string; values: number[] }>
  /** metric 类型用 */
  value?: number
  trend?: number
}

export interface DataConfig {
  sourceType: DataSourceType
  name: string
  points?: number
  categories?: string[]
  min?: number
  max?: number
  unit?: string
}

export interface TableData {
  columns: string[]
  rows: string[][]
}

export interface DashboardItem {
  id: string
  type: 'chart' | 'kpi' | 'table' | 'text' | 'custom'
  title: string
  rect: Rect
  chartType?: ChartType
  dataConfig?: DataConfig
  /** 创建时解析并缓存的模拟数据，保证同一配置渲染稳定 */
  data?: unknown
  text?: string
  /** custom 类型：AI 编写的渲染函数源码 function render(ctx) {...} */
  code?: string
}

export interface DashboardTheme {
  primary: string
  accent: string
  background: string
  panel: string
  textColor: string
}

export interface DashboardState {
  title: string
  theme: DashboardTheme
  items: DashboardItem[]
}

/** 布局自检问题 */
export interface LayoutIssue {
  itemId: string
  itemTitle: string
  kind: 'overlap' | 'out-of-bounds'
  detail: string
}

/** 组件运行时错误（用于 AI 自修复闭环） */
export interface ComponentError {
  itemId: string
  itemTitle: string
  message: string
}
