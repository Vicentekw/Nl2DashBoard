/** OpenAI 兼容接口的流式对话客户端（SSE + Function Calling 增量解析） */

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
}

export interface LlmSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export interface StreamResult {
  content: string
  /** 思考模型的推理过程（delta.reasoning_content / delta.reasoning），与正文分流，不混入 content */
  reasoning: string
  toolCalls: ToolCall[]
  usage: LlmUsage | null
}

export class LlmError extends Error {}

export interface StreamChatParams {
  settings: LlmSettings
  messages: ChatMessage[]
  tools?: ToolSchema[]
  signal?: AbortSignal
  onContentDelta?: (delta: string) => void
  /** 思考模型单独下发的推理增量（reasoning_content），渲染层分流展示 */
  onReasoningDelta?: (delta: string) => void
  onToolArgsDelta?: (toolIndex: number, name: string, argsDelta: string) => void
  onUsage?: (usage: LlmUsage) => void
}

export async function streamChatCompletion(params: StreamChatParams): Promise<StreamResult> {
  const { settings, messages, tools, signal } = params
  const url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        ...(tools && tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })) } : {}),
        stream: true,
        stream_options: { include_usage: true }
      })
    })
  } catch (e) {
    throw new LlmError('网络请求失败：' + (e instanceof Error ? e.message : String(e)))
  }

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '')
    throw new LlmError(`接口返回 ${resp.status}：${text.slice(0, 300)}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  let usage: LlmUsage | null = null
  const toolAcc = new Map<number, { id: string; name: string; args: string }>()

  const handleLine = (raw: string) => {
    const line = raw.trim()
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    let json: Record<string, unknown>
    try {
      json = JSON.parse(payload)
    } catch {
      return
    }
    const u = json.usage as Record<string, number> | undefined
    if (u) {
      usage = {
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0
      }
      params.onUsage?.(usage)
    }
    const choices = json.choices as Array<Record<string, unknown>> | undefined
    const choice = choices?.[0]
    if (!choice) return
    const delta = (choice.delta ?? {}) as Record<string, unknown>
    // 思考模型的推理流：reasoning_content（DeepSeek-R1 等）与 reasoning（部分 provider）统一分流，
    // 绝不混进正文 content——这是流式渲染最典型的坑
    const reasoningDelta = delta.reasoning_content ?? delta.reasoning
    if (typeof reasoningDelta === 'string' && reasoningDelta) {
      reasoning += reasoningDelta
      params.onReasoningDelta?.(reasoningDelta)
    }
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content
      params.onContentDelta?.(delta.content)
    }
    const tcs = delta.tool_calls
    if (Array.isArray(tcs)) {
      for (const raw of tcs) {
        const tc = raw as { index?: number; id?: string; function?: { name?: string; arguments?: string } }
        const idx = typeof tc.index === 'number' ? tc.index : 0
        const acc = toolAcc.get(idx) ?? { id: '', name: '', args: '' }
        if (tc.id) acc.id = tc.id
        if (tc.function?.name) acc.name += tc.function.name
        if (tc.function?.arguments) {
          acc.args += tc.function.arguments
          params.onToolArgsDelta?.(idx, acc.name, tc.function.arguments)
        }
        toolAcc.set(idx, acc)
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  }
  if (buffer) handleLine(buffer)

  const toolCalls: ToolCall[] = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v], i) => ({
      id: v.id || `call_${i}_${Date.now()}`,
      type: 'function' as const,
      function: { name: v.name, arguments: v.args || '{}' }
    }))

  return { content, reasoning, toolCalls, usage }
}

/** 解析模型输出的 JSON（容忍 markdown 代码块包裹），失败返回 null */
export function parseJsonLoose<T>(text: string): T | null {
  const trimmed = text.trim()
  const candidates = [trimmed]
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.unshift(fence[1].trim())
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T
    } catch {
      continue
    }
  }
  return null
}
