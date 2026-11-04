import { defineStore } from 'pinia'
import type { LlmUsage } from '../core/llm/client'

export interface StepInfo {
  id: string
  tool: string
  status: 'running' | 'done' | 'error'
  result?: string
  startedAt?: number
  durationMs?: number
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** 思考模型的推理过程（与正文分流渲染，流式展示、完成后可折叠） */
  reasoning: string
  steps: StepInfo[]
}

let seq = 1
function uid(): string {
  return `m${seq++}_${Math.random().toString(36).slice(2, 6)}`
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [
      {
        id: uid(),
        role: 'assistant' as const,
        text: '我是大屏生成助手。描述你想要的大屏（主题、指标、风格），我会规划布局并自动生成组件。试试：「生成一个电商双十一实时销售大屏」。',
        reasoning: '',
        steps: []
      }
    ] as UiMessage[],
    running: false,
    error: '',
    /** 本轮运行开始时间戳（用于前端显示已耗时） */
    runningSince: 0,
    /** 实时流状态文案（模型思考中 / 正在生成工具参数…），消除工具调用轮次的干等感 */
    streamStatus: '',
    usage: { promptTokens: 0, completionTokens: 0 } as LlmUsage
  }),
  actions: {
    pushUser(text: string) {
      this.messages.push({ id: uid(), role: 'user', text, reasoning: '', steps: [] })
    },
    beginAssistant(): UiMessage {
      const m: UiMessage = { id: uid(), role: 'assistant', text: '', reasoning: '', steps: [] }
      this.messages.push(m)
      return m
    },
    appendText(msgId: string, delta: string) {
      const m = this.messages.find((x) => x.id === msgId)
      if (m) m.text += delta
    },
    /** 思考模型的推理增量（独立于正文，UI 分流渲染） */
    appendReasoning(msgId: string, delta: string) {
      const m = this.messages.find((x) => x.id === msgId)
      if (m) m.reasoning += delta
    },
    setText(msgId: string, text: string) {
      const m = this.messages.find((x) => x.id === msgId)
      if (m) m.text = text
    },
    beginTool(msgId: string, tool: string): StepInfo {
      const step: StepInfo = { id: uid(), tool, status: 'running', startedAt: Date.now() }
      const m = this.messages.find((x) => x.id === msgId)
      if (m) m.steps.push(step)
      return step
    },
    finishTool(stepId: string, result: string, failed = false) {
      for (const m of this.messages) {
        const s = m.steps.find((x) => x.id === stepId)
        if (s) {
          s.status = failed ? 'error' : 'done'
          s.result = result
          if (s.startedAt) s.durationMs = Date.now() - s.startedAt
          return
        }
      }
    },
    pushNotice(text: string) {
      this.messages.push({ id: uid(), role: 'assistant', text: '⚙️ ' + text, reasoning: '', steps: [] })
    },
    pushError(text: string) {
      this.error = text
    },
    addUsage(u: LlmUsage) {
      this.usage.promptTokens += u.promptTokens
      this.usage.completionTokens += u.completionTokens
    },
    reset() {
      this.messages = []
      this.error = ''
    }
  }
})
