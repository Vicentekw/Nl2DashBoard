<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ChatPanel from './components/ChatPanel.vue'
import DashboardCanvas from './components/DashboardCanvas.vue'
import SettingsModal from './components/SettingsModal.vue'
import KnowledgeModal from './components/KnowledgeModal.vue'
import { useChatStore } from './store/chat'
import { useDashboardStore } from './store/dashboard'
import { downloadJson, importJson, buildShareUrl, applyFromHash } from './core/share'
import { exportDebugLog } from './core/debug'

const chat = useChatStore()
const dash = useDashboardStore()
const showSettings = ref(false)
const showKnowledge = ref(false)
const fileInput = ref<HTMLInputElement>()
const toast = ref('')
const isDev = import.meta.env.DEV

function exportDebug() {
  const file = exportDebugLog()
  showToast(`调试日志已导出：${file}`)
}

function showToast(text: string) {
  toast.value = text
  setTimeout(() => (toast.value = ''), 2200)
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const name = await importJson(file)
    showToast(`已导入：${name}`)
  } catch (err) {
    showToast('导入失败：' + (err instanceof Error ? err.message : String(err)))
  }
}

async function copyShare() {
  const url = buildShareUrl()
  try {
    await navigator.clipboard.writeText(url)
    showToast('分享链接已复制（含完整大屏数据）')
  } catch {
    showToast('复制失败，请手动复制地址栏链接')
  }
}

function onKeydown(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
  if (!(e.ctrlKey || e.metaKey)) return
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault()
    dash.undo()
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    e.preventDefault()
    dash.redo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (applyFromHash()) showToast('已从分享链接恢复大屏')
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">NL2Dashboard</span>
        <span class="sub">自然语言生成数据大屏 · LLM Function Calling</span>
      </div>
      <div class="meta">
        <span v-if="dash.errors.length || dash.warnings.length" class="warn-badge">
          {{ dash.warnings.length }} 个布局问题 · {{ dash.errors.length }} 个组件错误
        </span>
        <span class="token">Tokens: {{ chat.usage.promptTokens + chat.usage.completionTokens }}</span>
        <div class="toolbar">
          <button class="btn ghost" title="撤销 (Ctrl+Z)" :disabled="!dash.canUndo" @click="dash.undo()">⟲</button>
          <button class="btn ghost" title="重做 (Ctrl+Y)" :disabled="!dash.canRedo" @click="dash.redo()">⟳</button>
          <button class="btn ghost" title="知识库（RAG 文档问答）：上传文档后 AI 可检索引用" @click="showKnowledge = true">📚 知识库</button>
          <button class="btn ghost" title="把当前大屏编码进链接分享" @click="copyShare">分享</button>
          <button class="btn ghost" title="导出方案 JSON" @click="downloadJson">导出</button>
          <button class="btn ghost" title="导入方案 JSON" @click="fileInput?.click()">导入</button>
          <input ref="fileInput" type="file" accept=".json,application/json" style="display: none" @change="onImport" />
          <button v-if="isDev" class="btn ghost debug" title="导出 AI 调试日志（仅开发环境）：含每轮 LLM 请求/响应、工具调用参数与失败原因、自动诊断摘要" @click="exportDebug">
            🐞 调试日志
          </button>
        </div>
        <button class="btn ghost" @click="showSettings = true">设置</button>
      </div>
    </header>
    <main class="main">
      <ChatPanel class="chat-side" />
      <DashboardCanvas class="canvas-side" />
    </main>
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
    <KnowledgeModal v-if="showKnowledge" @close="showKnowledge = false" />
    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  background: #0b1026;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.logo {
  font-size: 17px;
  font-weight: 700;
  background: linear-gradient(90deg, #36cfc9, #597ef7);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.sub {
  font-size: 12px;
  color: rgba(220, 228, 255, 0.45);
}

.meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: rgba(220, 228, 255, 0.55);
}

.warn-badge {
  color: #f5b14c;
}

.toolbar {
  display: flex;
  gap: 6px;
}

.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(16, 23, 54, 0.95);
  border: 1px solid rgba(54, 207, 201, 0.4);
  color: #dce4ff;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 200;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.btn.ghost {
  padding: 5px 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  color: #dce4ff;
  font-size: 12px;
  transition: border-color 0.2s;
}

.btn.ghost:hover {
  border-color: #36cfc9;
}

.btn.ghost.debug {
  color: #f5b14c;
  border-color: rgba(245, 177, 76, 0.45);
}

.btn.ghost.debug:hover {
  border-color: #f5b14c;
}

.main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.chat-side {
  width: 380px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.canvas-side {
  flex: 1;
  min-width: 0;
}
</style>
