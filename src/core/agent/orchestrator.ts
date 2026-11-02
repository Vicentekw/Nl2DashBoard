import type { ChatMessage } from '../llm/client'
import { LlmError, streamChatCompletion } from '../llm/client'
import { buildGenerateMessages, buildRepairMessages } from '../llm/prompt'
import { getToolDef, toolSchemas } from '../tools/index'
import { useChatStore } from '../../store/chat'
import { useDashboardStore } from '../../store/dashboard'
import { loadSettings } from '../settings'

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
  mode: Mode
): Promise<{ result: string; finished: boolean }> {
  const def = getToolDef(name, mode)
  if (!def) return { result: JSON.stringify({ ok: false, error: `未知工具：${name}` }), finished: false }
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(argsJson || '{}') as Record<string, unknown>
  } catch {
    return { result: JSON.stringify({ ok: false, error: '工具参数不是合法 JSON' }), finished: false }
  }
  const result = await def.execute(args)
  const finished = name === 'report_finish'
  return { result, finished }
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

      if (res.toolCalls.length === 0) break

      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls })

      let finished = false
      for (const tc of res.toolCalls) {
        const step = chat.beginTool(uiMsg.id, tc.function.name)
        try {
          const { result, finished: isFinish } = await executeToolCall(tc.function.name, tc.function.arguments, mode)
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

/** 自然语言 → 大屏 */
export async function generateDashboard(goal: string): Promise<void> {
  const chat = useChatStore()
  if (chat.running) return
  chat.pushUser(goal)
  await agentLoop(buildGenerateMessages(goal), 'generate')
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
      dataConfig: i.dataConfig
    }))
  })
  await agentLoop(messages, 'repair')
}
