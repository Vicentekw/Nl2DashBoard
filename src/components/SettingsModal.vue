<script setup lang="ts">
import { reactive } from 'vue'
import { loadSettings, saveSettings } from '../core/settings'

const emit = defineEmits<{ (e: 'close'): void }>()

const form = reactive({ ...loadSettings() })

function save() {
  saveSettings({ ...form })
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
        <p class="tip">
          兼容所有 OpenAI 接口格式的服务：DeepSeek、通义千问、Kimi、OpenAI 等。
          Key 仅保存在浏览器 localStorage，不会上传到任何服务器。
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
  background: rgba(3, 6, 18, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: 420px;
  background: #101736;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 18px;
}

.head {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
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
  color: rgba(220, 228, 255, 0.7);
}

input {
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #dce4ff;
  padding: 0 10px;
  font-size: 13px;
}

input:focus {
  border-color: rgba(54, 207, 201, 0.6);
}

.tip {
  font-size: 11px;
  color: rgba(220, 228, 255, 0.4);
  line-height: 1.6;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.btn {
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 13px;
}

.btn.primary {
  background: linear-gradient(90deg, #36cfc9, #597ef7);
  border: none;
  color: #06122b;
  font-weight: 600;
}
</style>
