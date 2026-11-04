<script setup lang="ts">
import { reactive } from 'vue'
import { loadSettings, saveSettings } from '../core/settings'

const emit = defineEmits<{ (e: 'close'): void }>()

const form = reactive({ ...loadSettings() })
const embeddingModel = form.embeddingModel ?? ''
const embeddingBaseUrl = form.embeddingBaseUrl ?? ''
const embeddingApiKey = form.embeddingApiKey ?? ''

function save() {
  saveSettings({
    ...form,
    embeddingModel: embeddingModel.trim() || undefined,
    embeddingBaseUrl: embeddingBaseUrl.trim() || undefined,
    embeddingApiKey: embeddingApiKey.trim() || undefined
  })
  emit('close')
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal">
      <div class="head">模型设置</div>
      <div class="body">
        <label>
          <span>Base URL</span>
          <input v-model="form.baseUrl" placeholder="https://api.deepseek.com/v1" />
        </label>
        <label>
          <span>API Key</span>
          <input v-model="form.apiKey" type="password" placeholder="sk-..." />
        </label>
        <label>
          <span>模型</span>
          <input v-model="form.model" placeholder="deepseek-chat" />
        </label>
        <label>
          <span>嵌入模型（RAG 知识库，可选）</span>
          <input v-model="embeddingModel" placeholder="如 text-embedding-v3 / bge-m3，留空则纯关键词检索" />
        </label>
        <label>
          <span>嵌入接口 Base URL（可选，缺省用上方 Base URL）</span>
          <input v-model="embeddingBaseUrl" placeholder="如 https://dashscope.aliyuncs.com/compatible-mode/v1" />
        </label>
        <label>
          <span>嵌入接口 API Key（可选，缺省用上方 Key）</span>
          <input v-model="embeddingApiKey" type="password" placeholder="sk-..." />
        </label>
        <p class="tip">
          兼容所有 OpenAI 接口格式的服务：DeepSeek、通义千问、Kimi、OpenAI 等。
          Key 仅保存在浏览器 localStorage，不会上传到任何服务器。
          嵌入模型用于知识库向量检索（DeepSeek 不提供 embeddings 接口，可用通义/SiliconFlow 等单独配置）。
        </p>
      </div>
      <div class="foot">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(1, 4, 9, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: 440px;
  max-height: 84vh;
  overflow: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.head {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 14px;
  color: var(--text);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--text-2);
}

input {
  height: 34px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  padding: 0 10px;
  font-size: 13px;
  transition: border-color 0.15s;
}

input:focus {
  border-color: var(--accent);
}

input::placeholder {
  color: var(--text-3);
}

.tip {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.7;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.btn {
  padding: 7px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-2);
}

.btn.primary {
  background: var(--accent);
  border: none;
  color: #0d1117;
  font-weight: 600;
}
</style>
