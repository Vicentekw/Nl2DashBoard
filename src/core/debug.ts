/**
 * AI 调试日志（开发环境）
 *
 * 记录一次生成会话中的完整决策链路：
 *   LLM 请求/响应 → 每次工具调用的原始参数与执行结果 → 布局自检 / 组件运行时错误
 * 用于回答「为什么某个组件没有被生成出来」：
 *   - 模型根本没调用 create_* 工具（规划遗漏）
 *   - 调用了但参数不是合法 JSON / 缺少必填字段（参数错误）
 *   - 调用成功但被静态校验拒绝（如自定义组件代码不合规）
 *   - 创建成功但位置走了兜底值 / 布局警告
 *   - 组件已创建但沙箱渲染报错
 */
import { useDashboardStore } from '../store/dashboard'
import { useChatStore } from '../store/chat'
import { loadSettings } from './settings'

export type DebugEntryType =
  | 'session' // 会话开始（用户目标 / 模式）
  | 'llm_request' // 每轮 LLM 请求
  | 'llm_response' // 每轮 LLM 响应（含 tool_calls 原始参数）
  | 'tool_call' // 一次工具调用（含参数、结果、耗时、ok 标记）
  | 'llm_error' // LLM 请求失败（网络 / 认证 / 中断）
  | 'info'

export interface DebugEntry {
  /** 相对会话开始的毫秒数 */
  t: number
  time: string
  type: DebugEntryType
  round: number
  payload: unknown
}

const MAX_ENTRIES = 800
const MAX_ARG_LENGTH = 4000

let entries: DebugEntry[] = []
let sessionStart = Date.now()

export function dbg(type: DebugEntryType, payload: unknown, round = -1): void {
  const last = entries[entries.length - 1]
  const t = Date.now() - sessionStart
  if (last && last.type === type && JSON.stringify(last.payload) === JSON.stringify(payload)) return
  entries.push({ t, time: new Date().toISOString(), type, round, payload })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
}

export function resetDebugLog(): void {
  entries = []
  sessionStart = Date.now()
}

/** 截断过长的字符串（如自定义组件源码），保留日志可读性 */
function truncate(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_ARG_LENGTH) {
    return value.slice(0, MAX_ARG_LENGTH) + `…[截断，共 ${value.length} 字符]`
  }
  if (Array.isArray(value)) return value.map(truncate)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = truncate(v)
    return out
  }
  return value
}

/** 生成自动诊断摘要：把日志里所有「失败信号」提炼成一眼可读的清单 */
function buildDiagnosis(): Record<string, unknown> {
  const toolCalls = entries.filter((e) => e.type === 'tool_call') as Array<DebugEntry & { payload: Record<string, unknown> }>
  const failed = toolCalls.filter((e) => e.payload.ok === false)
  const createCalls = toolCalls.filter((e) => String(e.payload.name).startsWith('create_'))
  const createFailed = createCalls.filter((e) => e.payload.ok === false)
  const rectFallback = toolCalls.filter((e) => Boolean(e.payload.rectFallback))
  const llmErrors = entries.filter((e) => e.type === 'llm_error')

  return {
    toolCallTotal: toolCalls.length,
    toolCallFailed: failed.map((e) => {
      let resultError: string | undefined
      if (typeof e.payload.result === 'string') {
        try {
          resultError = (JSON.parse(e.payload.result) as { error?: string }).error
        } catch {
          /* 忽略 */
        }
      }
      return {
        round: e.round,
        tool: e.payload.name,
        reason: e.payload.error ?? e.payload.parseError ?? resultError ?? '未知',
        argsPreview: typeof e.payload.argsRaw === 'string' ? e.payload.argsRaw.slice(0, 300) : undefined
      }
    }),
    componentCreation: {
      createAttempts: createCalls.length,
      createSucceeded: createCalls.length - createFailed.length,
      createFailed: createFailed.length,
      rectFallbackUsed: rectFallback.length,
      rectFallbackNote: rectFallback.length
        ? '有组件未提供 x/y/w/h，使用了兜底位置 (2%,2%,30%,30%)——可能与已有组件重叠'
        : undefined
    },
    llmErrors: llmErrors.map((e) => e.payload)
  }
}

/** 导出调试日志 JSON 并触发下载 */
export function exportDebugLog(): string {
  const dash = useDashboardStore()
  const chat = useChatStore()
  const settings = loadSettings()

  const report = {
    _meta: {
      app: 'nl2dashboard',
      exportedAt: new Date().toISOString(),
      sessionDurationMs: Date.now() - sessionStart,
      model: settings.model,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey ? settings.apiKey.slice(0, 6) + '***' : '(未配置)',
      userAgent: navigator.userAgent,
      url: location.href
    },
    diagnosis: buildDiagnosis(),
    dashboardSnapshot: {
      title: dash.title,
      canvas: dash.canvas,
      itemCount: dash.items.length,
      items: dash.items.map((i) => ({ id: i.id, type: i.type, title: i.title, chartType: i.chartType, rect: i.rect })),
      layoutWarnings: dash.warnings,
      componentErrors: dash.errors
    },
    chatMessages: chat.messages.map((m) => ({
      role: m.role,
      text: m.text,
      steps: m.steps.map((s) => ({ tool: s.tool, status: s.status, result: truncate(s.result) }))
    })),
    entries: entries.map((e) => ({ ...e, payload: truncate(e.payload) }))
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15)
  const filename = `ai_debugger_log-${stamp}.json`
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}
