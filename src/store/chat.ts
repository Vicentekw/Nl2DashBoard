import { defineStore } from 'pinia'
import type { LlmUsage } from '../core/llm/client'

export interface StepInfo {
  id: string
  tool: string
  status: 'running' | 'done' | 'error'
  result?: string
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
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
        steps: []
      }
    ] as UiMessage[],
    running: false,
    error: '',
    usage: { promptTokens: 0, completionTokens: 0 } as LlmUsage
  }),
  actions: {
    pushUser(text: string) {
      this.messages.push({ id: uid(), role: 'user', text, steps: [] })
    },
    beginAssistant(): UiMessage {
      const m: UiMessage = { id: uid(), role: 'assistant', text: '', steps: [] }
      this.messages.push(m)
      return m
    },
    appendText(msgId: string, delta: string) {
      const m = this.messages.find((x) => x.id === msgId)
      if (m) m.text += delta
    },
    setText(msgId: string, text: string) {
      const m = this.messages.find((x) => x.id === msgId)
      if (m) m.text = text
    },
    beginTool(msgId: string, tool: string): StepInfo {
      const step: StepInfo = { id: uid(), tool, status: 'running' }
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
          return
        }
      }
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
