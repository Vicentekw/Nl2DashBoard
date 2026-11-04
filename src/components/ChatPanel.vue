<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useChatStore, type UiMessage } from '../store/chat'
import { useDashboardStore } from '../store/dashboard'
import { generateDashboard, runSelfRepair, stopGeneration } from '../core/agent/orchestrator'

const chat = useChatStore()
const dash = useDashboardStore()
const input = ref('')
const listRef = ref<HTMLElement>()
const now = ref(Date.now())
let timer: number | undefined

const EXAMPLES = [
  '生成一个电商双十一实时销售大屏',
  '生成一个服务器集群监控大屏',
  '生成一个新能源汽车销售数据大屏'
]

async function send(text?: string) {
  const goal = (text ?? input.value).trim()
  if (!goal || chat.running) return
  input.value = ''
  await generateDashboard(goal)
  scrollBottom()
}

async function repair() {
  if (chat.running) return
  await runSelfRepair()
}

function scrollBottom() {
  nextTick(() => {
    listRef.value?.scrollTo({ top: listRef.value.scrollHeight })
  })
}

watch(
  () => chat.messages.map((m) => [m.text, m.steps.map((s) => s.status).join()]).join('|'),
  () => scrollBottom()
)
watch(
  () => chat.running,
  (running) => {
    if (running) {
      timer = window.setInterval(() => (now.value = Date.now()), 500)
    } else {
      window.clearInterval(timer)
    }
  }
)
onBeforeUnmount(() => window.clearInterval(timer))

const elapsedSec = computed(() =>
  chat.running ? Math.max(0, Math.round((now.value - chat.runningSince) / 1000)) : 0
)

function isLastAssistant(m: UiMessage): boolean {
  const list = chat.messages
  const last = list[list.length - 1]
  return last === m && m.role === 'assistant'
}

function isStreamingText(m: UiMessage): boolean {
  return chat.running && isLastAssistant(m) && !m.steps.some((s) => s.status === 'running')
}

function toolLabel(tool: string): string {
  const map: Record<string, string> = {
    plan_dashboard: '规划大屏',
    create_chart: '创建图表',
    create_kpi: '创建 KPI',
    create_table: '创建表格',
    create_text: '创建文本',
    create_custom_component: '编写自定义组件',
    update_component: '更新组件',
    delete_component: '删除组件',
    search_knowledge: '检索知识库',
    list_components: '检查布局',
    report_finish: '完成'
  }
  return map[tool] ?? tool
}

function shortResult(result?: string): string {
  if (!result) return ''
  try {
    const j = JSON.parse(result) as { ok?: boolean; message?: string; error?: string; id?: string }
    if (j.error) return `✗ ${j.error}`
    return `${j.message ?? 'OK'}${j.id ? ` (${j.id})` : ''}`
  } catch {
    return result.slice(0, 80)
  }
}

function fmtDuration(ms?: number): string {
  if (ms == null) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}
</script>

<template>
  <div class="chat-panel">
    <div ref="listRef" class="msg-list">
      <div v-for="m in chat.messages" :key="m.id" class="msg" :class="m.role">
        <div class="bubble">
          <div v-if="m.text" class="text" :class="{ streaming: isStreamingText(m) }">{{ m.text }}</div>
          <div v-for="s in m.steps" :key="s.id" class="step" :class="s.status">
            <span class="step-icon">
              <span v-if="s.status === 'running'" class="spinner" />
              <template v-else-if="s.status === 'done'">✓</template>
              <template v-else>✗</template>
            </span>
            <span class="tool-name">{{ toolLabel(s.tool) }}</span>
            <span class="step-result">{{ shortResult(s.result) }}</span>
            <span v-if="s.durationMs" class="step-time">{{ fmtDuration(s.durationMs) }}</span>
          </div>
        </div>
      </div>

      <!-- 实时活动指示：消除工具调用轮次的干等感 -->
      <div v-if="chat.running" class="activity">
        <span class="spinner" />
        <span class="activity-text">{{ chat.streamStatus || '执行工具中…' }}</span>
        <span class="activity-time">{{ elapsedSec }}s</span>
      </div>

      <div v-if="chat.error" class="error-line">{{ chat.error }}</div>
    </div>

    <div v-if="dash.warnings.length || dash.errors.length" class="repair-bar">
      <button class="btn repair" :disabled="chat.running" @click="repair">
        AI 自修复（{{ dash.warnings.length + dash.errors.length }} 个问题）
      </button>
    </div>

    <div class="examples">
      <button v-for="e in EXAMPLES" :key="e" class="example" :disabled="chat.running" @click="send(e)">
        {{ e }}
      </button>
    </div>

    <div class="input-area">
      <textarea
        v-model="input"
        rows="2"
        placeholder="描述你想要的大屏，Enter 发送，Shift+Enter 换行"
        :disabled="chat.running"
        @keydown.enter.exact.prevent="send()"
      />
      <button v-if="chat.running" class="btn stop" @click="stopGeneration">停止</button>
      <button v-else class="btn send" :disabled="!input.trim()" @click="send()">生成</button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
}

.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.msg {
  display: flex;
}

.msg.user {
  justify-content: flex-end;
}

.msg.assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 92%;
  border-radius: var(--radius);
  padding: 9px 12px;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg.user .bubble {
  background: var(--accent-soft);
  border: 1px solid rgba(83, 155, 245, 0.35);
}

.msg.assistant .bubble {
  background: var(--panel-2);
  border: 1px solid var(--border-soft);
}

.text.streaming::after {
  content: '▍';
  color: var(--accent);
  animation: caret 0.9s steps(1) infinite;
}

@keyframes caret {
  50% {
    opacity: 0;
  }
}

.step {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
  font-size: 12px;
  color: var(--text-2);
}

.step:first-of-type {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-soft);
}

.step-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
  color: var(--success);
  font-size: 11px;
}

.step.error .step-icon {
  color: var(--danger);
}

.spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: -1px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tool-name {
  color: var(--text);
  flex-shrink: 0;
}

.step-result {
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.step-time {
  color: var(--text-3);
  font-size: 11px;
  flex-shrink: 0;
}

.activity {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
  padding: 4px 2px;
}

.activity-text {
  color: var(--accent);
}

.activity-time {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.error-line {
  padding: 8px 10px;
  border-radius: var(--radius);
  background: var(--danger-soft);
  border: 1px solid rgba(248, 81, 73, 0.35);
  color: #ffb3ae;
  font-size: 12px;
}

.repair-bar {
  padding: 8px 14px 0;
}

.btn.repair {
  width: 100%;
  padding: 8px;
  border-radius: var(--radius);
  background: var(--warn-soft);
  border: 1px solid rgba(210, 153, 34, 0.4);
  color: var(--warn);
  font-size: 13px;
}

.btn.repair:disabled {
  opacity: 0.5;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px 0;
}

.example {
  padding: 4px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 11px;
  transition: border-color 0.15s, color 0.15s;
}

.example:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.input-area {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  align-items: flex-end;
}

.input-area textarea {
  flex: 1;
  resize: none;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  transition: border-color 0.15s;
}

.input-area textarea:focus {
  border-color: var(--accent);
}

.input-area textarea::placeholder {
  color: var(--text-3);
}

.btn.send,
.btn.stop {
  padding: 8px 18px;
  border-radius: var(--radius);
  font-size: 13px;
}

.btn.send {
  background: var(--accent);
  color: #0d1117;
  font-weight: 600;
}

.btn.send:disabled {
  opacity: 0.4;
}

.btn.stop {
  background: var(--danger-soft);
  border: 1px solid rgba(248, 81, 73, 0.4);
  color: #ffb3ae;
}
</style>
