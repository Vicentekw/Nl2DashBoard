import type { ChatMessage } from '../llm/client'
import { LlmError, streamChatCompletion } from '../llm/client'
import { buildGenerateMessages, buildRepairMessages } from '../llm/prompt'
import { getToolDef, toolSchemas } from '../tools/index'
import { useChatStore } from '../../store/chat'
import { useDashboardStore } from '../../store/dashboard'
import { loadSettings } from '../settings'
import { dbg, resetDebugLog } from '../debug'

type Mode = 'generate' | 'repair'

const MAX_ROUNDS = 40

let abortController: AbortController | null = null

export function stopGeneration(): void {
  abortController?.abort()
  abortController = null
}

async function executeToolCall(
  name: string,
  argsJson: string,
  mode: Mode,
  round: number
): Promise<{ result: string; finished: boolean }> {
  const started = Date.now()
  const record = (payload: Record<string, unknown>) =>
    dbg('tool_call', { name, argsRaw: argsJson, durationMs: Date.now() - started, ...payload }, round)

  const def = getToolDef(name, mode)
  if (!def) {
    record({ ok: false, error: `未知工具：${name}` })
    return { result: JSON.stringify({ ok: false, error: `未知工具：${name}` }), finished: false }
  }
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argsJson || '{}') as Record<string, unknown>
  } catch {
    record({ ok: false, parseError: '工具参数不是合法 JSON' })
    return { result: JSON.stringify({ ok: false, error: '工具参数不是合法 JSON' }), finished: false }
  }
  try {
    const result = await def.execute(args)
    let parsed: { ok?: boolean; error?: string } = {}
    try {
      parsed = JSON.parse(result) as { ok?: boolean; error?: string }
    } catch {
      /* 结果不是 JSON 时仅按原样记录 */
    }
    const failed = parsed.ok === false
    record({
      args,
      ok: !failed,
      error: failed ? parsed.error : undefined,
      result,
      rectFallback:
        name.startsWith('create_') && (args.x == null || args.y == null || args.w == null || args.h == null)
          ? '未提供完整 x/y/w/h，组件将使用兜底位置'
          : undefined
    })
    const finished = name === 'report_finish'
    return { result, finished }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    record({ ok: false, error: '工具执行异常：' + msg })
    return { result: JSON.stringify({ ok: false, error: msg }), finished: false }
  }
}

async function agentLoop(messages: ChatMessage[], mode: Mode): Promise<void> {
  const chat = useChatStore()
  const settings = loadSettings()
  if (!settings.apiKey) {
    chat.pushError('请先点击右上角「设置」，填写 API Key（支持 DeepSeek / 通义 / Kimi / OpenAI 等兼容接口）。')
    return
  }

  abortController = new AbortController()
  chat.running = true
  chat.error = ''

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      dbg('llm_request', { mode, messageCount: messages.length, lastMessage: messages[messages.length - 1] }, round)
      const uiMsg = chat.beginAssistant()
      const res = await streamChatCompletion({
        settings,
        messages,
        tools: toolSchemas(mode),
        signal: abortController.signal,
        onContentDelta: (d) => chat.appendText(uiMsg.id, d),
        onUsage: (u) => chat.addUsage(u)
      })
      chat.setText(uiMsg.id, res.content)
      dbg(
        'llm_response',
        {
          content: res.content,
          toolCalls: res.toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name, args: tc.function.arguments }))
        },
        round
      )

      if (res.toolCalls.length === 0) break

      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls })

      let finished = false
      for (const tc of res.toolCalls) {
        const step = chat.beginTool(uiMsg.id, tc.function.name)
        try {
          const { result, finished: isFinish } = await executeToolCall(tc.function.name, tc.function.arguments, mode, round)
          chat.finishTool(step.id, result)
          finished = finished || isFinish
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          chat.finishTool(step.id, JSON.stringify({ ok: false, error: msg }), true)
        }
        const steps = chat.messages.find((m) => m.id === uiMsg.id)?.steps ?? []
        const lastResult = steps[steps.length - 1]?.result ?? '{}'
        messages.push({ role: 'tool', tool_call_id: tc.id, content: lastResult })
      }
      if (finished) break
    }
  } catch (e) {
    dbg('llm_error', {
      message: e instanceof Error ? e.message : String(e),
      name: e instanceof DOMException ? e.name : undefined
    })
    if (e instanceof DOMException && e.name === 'AbortError') {
      chat.pushError('已停止生成。')
    } else if (e instanceof LlmError) {
      chat.pushError(e.message)
    } else {
      chat.pushError('生成失败：' + (e instanceof Error ? e.message : String(e)))
    }
  } finally {
    chat.running = false
    abortController = null
  }
}

/** 自然语言 → 大屏（画布为空走全新生成，已有内容走增量编辑） */
export async function generateDashboard(goal: string): Promise<void> {
  const chat = useChatStore()
  const dash = useDashboardStore()
  if (chat.running) return
  chat.pushUser(goal)
  resetDebugLog()
  dbg('session', { goal, mode: dash.items.length > 0 ? 'edit(增量修改)' : 'generate(全新生成)', existingComponents: dash.items.length })
  await agentLoop(buildGenerateMessages(goal, dash.items.length > 0), 'generate')
}

/** AI 自修复：布局问题 + 组件运行时错误 → 自动修正 */
export async function runSelfRepair(): Promise<void> {
  const chat = useChatStore()
  const dash = useDashboardStore()
  if (chat.running) return
  if (dash.warnings.length === 0 && dash.errors.length === 0) {
    chat.pushError('当前没有需要修复的问题。')
    return
  }
  chat.pushUser(`修复 ${dash.warnings.length} 个布局问题、${dash.errors.length} 个组件错误`)
  resetDebugLog()
  dbg('session', {
    mode: 'repair(自修复)',
    layoutIssues: dash.warnings.length,
    componentErrors: dash.errors
  })
  const messages = buildRepairMessages({
    title: dash.title,
    issues: dash.warnings,
    errors: dash.errors,
    components: dash.items.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      chartType: i.chartType,
      rect: i.rect,
      dataConfig: i.dataConfig,
      ...(i.type === 'custom' ? { code: i.code } : {})
    }))
  })
  await agentLoop(messages, 'repair')
}
