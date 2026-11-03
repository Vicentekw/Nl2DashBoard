import type { DataConfig, DataSourceType, Rect } from '../../types'
import type { ToolSchema } from '../llm/client'
import { generateDataset } from '../../data/mock'
import { useDashboardStore } from '../../store/dashboard'
import { parseRectInput } from '../validator/layout'
import { kbStats, search as kbSearch } from '../rag/store'

export interface ToolDef {
  schema: ToolSchema
  execute: (args: Record<string, unknown>) => string | Promise<string>
}

const FALLBACK_RECT: Rect = {
  x: { value: 2, unit: '%' },
  y: { value: 2, unit: '%' },
  w: { value: 30, unit: '%' },
  h: { value: 30, unit: '%' }
}

const rectSchemaProps = {
  x: { type: 'string', description: '左上角横坐标，如 "2%" 或 "40px"，推荐百分比' },
  y: { type: 'string', description: '左上角纵坐标，如 "12%" 或 "80px"，推荐百分比' },
  w: { type: 'string', description: '宽度，如 "30%" 或 "400px"，推荐百分比' },
  h: { type: 'string', description: '高度，如 "26%" 或 "240px"，推荐百分比' }
}

/** 自定义组件代码的静态校验：必须是 render 函数，且禁止危险 API */
function validateCustomCode(code: string): string | null {
  if (!/function\s+render\s*\(/.test(code)) {
    return 'code 必须包含 function render(ctx) {...} 函数定义'
  }
  if (/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie|import\s*\(|eval\s*\(|WebSocket|Worker)\b/.test(code)) {
    return 'code 禁止使用 fetch/XHR/storage/cookie/import/eval/WebSocket/Worker，只能操作传入的 ctx（el/echarts/data/theme）'
  }
  return null
}

const dataConfigSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    sourceType: {
      type: 'string',
      enum: ['timeSeries', 'category', 'ratio', 'ranking', 'metric'],
      description: '数据形态：timeSeries=时间趋势, category=分类对比, ratio=占比, ranking=排行, metric=单指标'
    },
    name: { type: 'string', description: '指标/系列名称，如 "销售额"' },
    points: { type: 'number', description: 'timeSeries 的数据点数量（4-48）' },
    categories: { type: 'array', items: { type: 'string' }, description: '分类名称列表（category/ratio/ranking 用）' },
    min: { type: 'number', description: '数值下界' },
    max: { type: 'number', description: '数值上界' },
    unit: { type: 'string', description: '单位，如 "万元"、"%"' }
  },
  required: ['sourceType', 'name']
}

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data })
}

function fail(error: string): string {
  return JSON.stringify({ ok: false, error })
}

const planDashboard: ToolDef = {
  schema: {
    name: 'plan_dashboard',
    description: '初始化大屏：设置标题与主题配色，并清空现有组件。生成新大屏前必须先调用一次。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '大屏标题' },
        theme: {
          type: 'object',
          description: '主题配色（可选，CSS 颜色值）',
          properties: {
            primary: { type: 'string', description: '主色（图表主色）' },
            accent: { type: 'string', description: '强调色' },
            background: { type: 'string', description: '画布背景色（建议深色）' },
            panel: { type: 'string', description: '面板底色' },
            textColor: { type: 'string', description: '文字颜色' }
          }
        }
      },
      required: ['title']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    dash.applyPlan(String(args.title ?? 'AI 大屏'), (args.theme as never) ?? undefined)
    return ok({ message: '画布已初始化并清空，请继续创建组件。' })
  }
}

const createChart: ToolDef = {
  schema: {
    name: 'create_chart',
    description: '创建一个图表组件（折线/柱状/饼图/仪表盘/雷达/散点），自动生成并校验模拟数据。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '组件标题' },
        chartType: { type: 'string', enum: ['line', 'bar', 'pie', 'gauge', 'radar', 'scatter'], description: '图表类型' },
        x: rectSchemaProps.x,
        y: rectSchemaProps.y,
        w: rectSchemaProps.w,
        h: rectSchemaProps.h,
        dataConfig: dataConfigSchema
      },
      required: ['title', 'chartType', 'x', 'y', 'w', 'h', 'dataConfig']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    const rect = parseRectInput(args, FALLBACK_RECT)
    const dataConfig = args.dataConfig as DataConfig | undefined
    if (!dataConfig || !dataConfig.sourceType || !dataConfig.name) {
      return fail('dataConfig 缺少 sourceType 或 name')
    }
    const item = dash.addItem({
      type: 'chart',
      title: String(args.title ?? dataConfig.name),
      rect,
      chartType: (args.chartType as never) ?? 'bar',
      dataConfig
    })
    // 生成并缓存数据（渲染层从 item.data 读取，保证稳定）
    item.data = generateDataset(dataConfig, item.id)
    return ok({
      id: item.id,
      message: '图表已创建',
      layoutWarnings: dash.warnings.filter((w) => w.itemId === item.id).map((w) => w.detail)
    })
  }
}

const createKpi: ToolDef = {
  schema: {
    name: 'create_kpi',
    description: '创建一个 KPI 指标卡（大数字 + 环比趋势），适合放在大屏顶部一行。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '指标名称，如 "今日销售额"' },
        x: rectSchemaProps.x,
        y: rectSchemaProps.y,
        w: rectSchemaProps.w,
        h: rectSchemaProps.h,
        min: { type: 'number', description: '数值下界' },
        max: { type: 'number', description: '数值上界' },
        unit: { type: 'string', description: '单位' }
      },
      required: ['title', 'x', 'y', 'w', 'h']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    const rect = parseRectInput(args, FALLBACK_RECT)
    const dataConfig: DataConfig = {
      sourceType: 'metric',
      name: String(args.title ?? '指标'),
      min: typeof args.min === 'number' ? args.min : 0,
      max: typeof args.max === 'number' ? args.max : 1000000,
      unit: typeof args.unit === 'string' ? args.unit : undefined
    }
    const item = dash.addItem({ type: 'kpi', title: dataConfig.name, rect, dataConfig })
    item.data = generateDataset(dataConfig, item.id)
    return ok({ id: item.id, message: 'KPI 卡已创建' })
  }
}

const createTable: ToolDef = {
  schema: {
    name: 'create_table',
    description: '创建一个数据表格组件，自动生成模拟行数据。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        x: rectSchemaProps.x,
        y: rectSchemaProps.y,
        w: rectSchemaProps.w,
        h: rectSchemaProps.h,
        columns: { type: 'array', items: { type: 'string' }, description: '列名，3-5 列' },
        rows: { type: 'number', description: '行数（3-20）' }
      },
      required: ['title', 'x', 'y', 'w', 'h', 'columns']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    const rect = parseRectInput(args, FALLBACK_RECT)
    const columns = (args.columns as string[] | undefined)?.slice(0, 6) ?? ['名称', '数值', '状态']
    const rows = Math.max(3, Math.min(20, Math.round(Number(args.rows ?? 6))))
    const dataConfig: DataConfig = { sourceType: 'category', name: String(args.title ?? '表格') }
    const item = dash.addItem({ type: 'table', title: String(args.title ?? '明细数据'), rect, dataConfig })
    const rnd = generateDataset(dataConfig, item.id)
    const body: string[][] = []
    for (let i = 0; i < rows; i++) {
      body.push(
        columns.map((col, ci) =>
          ci === 0 ? `${col}${i + 1}` : String(Math.round(((rnd.series[0]?.values[i % rnd.series[0].values.length] ?? 50) * (rows - i)) || 0))
        )
      )
    }
    item.data = { columns, rows: body }
    return ok({ id: item.id, message: '表格已创建' })
  }
}

const createText: ToolDef = {
  schema: {
    name: 'create_text',
    description: '创建一个文本说明组件。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '文本内容' },
        x: rectSchemaProps.x,
        y: rectSchemaProps.y,
        w: rectSchemaProps.w,
        h: rectSchemaProps.h
      },
      required: ['text', 'x', 'y', 'w', 'h']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    const rect = parseRectInput(args, FALLBACK_RECT)
    const item = dash.addItem({ type: 'text', title: '文本', rect, text: String(args.text ?? '') })
    return ok({ id: item.id, message: '文本已创建' })
  }
}

const createCustom: ToolDef = {
  schema: {
    name: 'create_custom_component',
    description: '创建一个由 AI 编写渲染代码的自定义组件（运行在 iframe 沙箱中）。仅当标准物料（图表/KPI/表格/文本）无法表达需求时使用。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        x: rectSchemaProps.x,
        y: rectSchemaProps.y,
        w: rectSchemaProps.w,
        h: rectSchemaProps.h,
        dataConfig: dataConfigSchema,
        code: {
          type: 'string',
          description: '渲染函数源码，形如 "function render(ctx) { ... }"。ctx: { el: DOM容器, echarts: echarts库, data: 数据集, theme: 主题色 }。必须同步渲染。'
        }
      },
      required: ['title', 'x', 'y', 'w', 'h', 'code']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    const code = String(args.code ?? '')
    const codeError = validateCustomCode(code)
    if (codeError) return fail(codeError)
    const rect = parseRectInput(args, FALLBACK_RECT)
    const dataConfig = (args.dataConfig as DataConfig | undefined) ?? {
      sourceType: 'category',
      name: String(args.title ?? '自定义组件')
    }
    const item = dash.addItem({ type: 'custom', title: String(args.title ?? '自定义组件'), rect, dataConfig, code })
    item.data = generateDataset(dataConfig, item.id)
    return ok({ id: item.id, message: '自定义组件已创建，若沙箱渲染报错会自动进入修复流程' })
  }
}

const updateComponent: ToolDef = {
  schema: {
    name: 'update_component',
    description: '更新已有组件：可改位置尺寸（rect）、标题、图表类型或数据配置。用于布局修正与内容修复。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '组件 id' },
        title: { type: 'string' },
        rect: {
          type: 'object',
          properties: { x: rectSchemaProps.x, y: rectSchemaProps.y, w: rectSchemaProps.w, h: rectSchemaProps.h }
        },
        chartType: { type: 'string', enum: ['line', 'bar', 'pie', 'gauge', 'radar', 'scatter'] },
        dataConfig: dataConfigSchema,
        code: { type: 'string', description: '（自定义组件）新的渲染函数源码 function render(ctx) {...}' }
      },
      required: ['id']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    const id = String(args.id ?? '')
    const item = dash.getItem(id)
    if (!item) return fail(`组件不存在：${id}`)
    const patch: Record<string, unknown> = {}
    if (typeof args.title === 'string') patch.title = args.title
    if (args.chartType) patch.chartType = args.chartType
    if (typeof args.code === 'string') {
      const codeError = validateCustomCode(args.code)
      if (codeError) return fail(codeError)
      patch.code = args.code
    }
    if (args.dataConfig) {
      const dc = { ...(item.dataConfig ?? {}), ...(args.dataConfig as object) } as DataConfig
      patch.dataConfig = dc
      patch.data = generateDataset(dc, item.id)
    }
    if (args.rect) patch.rect = parseRectInput(args.rect as never, item.rect)
    const okUpd = dash.updateItem(id, patch)
    return okUpd
      ? ok({
          message: '组件已更新',
          layoutWarnings: dash.warnings.filter((w) => w.itemId === id).map((w) => w.detail)
        })
      : fail('更新失败')
  }
}

const deleteComponent: ToolDef = {
  schema: {
    name: 'delete_component',
    description: '删除一个组件。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  execute(args) {
    const dash = useDashboardStore()
    const id = String(args.id ?? '')
    if (!dash.getItem(id)) return fail(`组件不存在：${id}`)
    dash.removeItem(id)
    return ok({ message: `已删除 ${id}` })
  }
}

const listComponents: ToolDef = {
  schema: {
    name: 'list_components',
    description: '查看当前画布上所有组件（id、类型、位置）与布局自检结果。修正布局前先调用。',
    parameters: { type: 'object', properties: {} }
  },
  execute() {
    const dash = useDashboardStore()
    return ok({
      title: dash.title,
      canvas: dash.canvas,
      components: dash.items.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        chartType: i.chartType,
        rect: `${i.rect.x.value}${i.rect.x.unit},${i.rect.y.value}${i.rect.y.unit} ${i.rect.w.value}${i.rect.w.unit}×${i.rect.h.value}${i.rect.h.unit}`
      })),
      layoutIssues: dash.warnings
    })
  }
}

const searchKnowledge: ToolDef = {
  schema: {
    name: 'search_knowledge',
    description:
      '在用户上传的知识库文档（RAG）中检索相关内容。当用户提到"根据文档/资料/制度/数据说明"、需求引用了外部信息，或需要了解业务口径时，先调用本工具检索，再基于检索结果行动；回答中引用时注明来源文档名。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词或问题，尽量具体，如"销售回款流程"、"2026年KPI口径"' },
        topK: { type: 'number', description: '返回条数，默认 5，最大 8' }
      },
      required: ['query']
    }
  },
  async execute(args) {
    const query = String(args.query ?? '').trim()
    if (!query) return fail('query 不能为空')
    const stats = kbStats()
    if (!stats.chunks) return ok({ message: '知识库为空：用户尚未上传任何文档，请基于通用知识回答。', results: [] })
    const { hits, mode, notice } = await kbSearch(query, Math.min(8, Math.max(1, Number(args.topK ?? 5))))
    if (!hits.length) return ok({ message: '未检索到相关内容，请基于通用知识回答。', results: [] })
    return ok({
      mode,
      ...(notice ? { notice } : {}),
      results: hits.map((h) => ({ source: h.sourceName, score: Number(h.score.toFixed(3)), content: h.text }))
    })
  }
}

const reportFinish: ToolDef = {
  schema: {
    name: 'report_finish',
    description: '全部组件创建完成且无布局问题时调用，结束生成流程。',
    parameters: {
      type: 'object',
      properties: { summary: { type: 'string', description: '一句话说明生成了什么' } },
      required: ['summary']
    }
  },
  execute(args) {
    return ok({ message: String(args.summary ?? '生成完成') })
  }
}

export const GENERATE_TOOLS: ToolDef[] = [
  planDashboard,
  createChart,
  createKpi,
  createTable,
  createText,
  createCustom,
  updateComponent,
  deleteComponent,
  searchKnowledge,
  listComponents,
  reportFinish
]

export const REPAIR_TOOLS: ToolDef[] = [listComponents, updateComponent, deleteComponent, searchKnowledge, reportFinish]

export function getToolDef(name: string, mode: 'generate' | 'repair'): ToolDef | undefined {
  const list = mode === 'repair' ? REPAIR_TOOLS : GENERATE_TOOLS
  return list.find((t) => t.schema.name === name)
}

export function toolSchemas(mode: 'generate' | 'repair'): ToolSchema[] {
  return (mode === 'repair' ? REPAIR_TOOLS : GENERATE_TOOLS).map((t) => t.schema)
}
