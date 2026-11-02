<script setup lang="ts">
import { ref } from 'vue'
import ChatPanel from './components/ChatPanel.vue'
import DashboardCanvas from './components/DashboardCanvas.vue'
import SettingsModal from './components/SettingsModal.vue'
import { useChatStore } from './store/chat'
import { useDashboardStore } from './store/dashboard'

const chat = useChatStore()
const dash = useDashboardStore()
const showSettings = ref(false)
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
        <button class="btn ghost" @click="showSettings = true">设置</button>
      </div>
    </header>
    <main class="main">
      <ChatPanel class="chat-side" />
      <DashboardCanvas class="canvas-side" />
    </main>
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
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
