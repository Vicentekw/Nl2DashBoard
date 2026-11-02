<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useChatStore } from '../store/chat'
import { useDashboardStore } from '../store/dashboard'
import { generateDashboard, runSelfRepair, stopGeneration } from '../core/agent/orchestrator'

const chat = useChatStore()
const dash = useDashboardStore()
const input = ref('')
const listRef = ref<HTMLElement>()

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

function toolLabel(tool: string): string {
  const map: Record<string, string> = {
    plan_dashboard: '规划大屏',
    create_chart: '创建图表',
    create_kpi: '创建 KPI',
    create_table: '创建表格',
    create_text: '创建文本',
    update_component: '更新组件',
    delete_component: '删除组件',
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
</script>

<template>
  <div class="chat-panel">
    <div ref="listRef" class="msg-list">
      <div v-for="m in chat.messages" :key="m.id" class="msg" :class="m.role">
        <div class="bubble">
          <div v-if="m.text" class="text">{{ m.text }}</div>
          <div v-for="s in m.steps" :key="s.id" class="step" :class="s.status">
            <span class="dot" />
            <span class="tool-name">{{ toolLabel(s.tool) }}</span>
            <span class="step-result">{{ shortResult(s.result) }}</span>
          </div>
        </div>
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
  background: #0a0f24;
}

.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg.user .bubble {
  background: rgba(89, 126, 247, 0.22);
  border: 1px solid rgba(89, 126, 247, 0.35);
}

.msg.assistant .bubble {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.step {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: rgba(220, 228, 255, 0.7);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #597ef7;
  flex-shrink: 0;
}

.step.running .dot {
  background: #f5b14c;
  animation: blink 1s infinite;
}

.step.error .dot {
  background: #ff6b6b;
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

.tool-name {
  color: #36cfc9;
}

.step-result {
  color: rgba(220, 228, 255, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-line {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 107, 107, 0.12);
  border: 1px solid rgba(255, 107, 107, 0.3);
  color: #ff9c9c;
  font-size: 12px;
}

.repair-bar {
  padding: 8px 14px 0;
}

.btn.repair {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  background: rgba(245, 177, 76, 0.15);
  border: 1px solid rgba(245, 177, 76, 0.4);
  color: #f5b14c;
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
  border-radius: 20px;
  border: 1px solid rgba(54, 207, 201, 0.3);
  color: rgba(54, 207, 201, 0.9);
  font-size: 11px;
  transition: background 0.2s;
}

.example:hover:not(:disabled) {
  background: rgba(54, 207, 201, 0.12);
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  color: #dce4ff;
  font-size: 13px;
  line-height: 1.5;
}

.input-area textarea:focus {
  border-color: rgba(54, 207, 201, 0.6);
}

.btn.send,
.btn.stop {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
}

.btn.send {
  background: linear-gradient(90deg, #36cfc9, #597ef7);
  color: #06122b;
  font-weight: 600;
}

.btn.send:disabled {
  opacity: 0.4;
}

.btn.stop {
  background: rgba(255, 107, 107, 0.18);
  border: 1px solid rgba(255, 107, 107, 0.4);
  color: #ff9c9c;
}
</style>
