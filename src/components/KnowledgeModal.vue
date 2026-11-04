<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { clearAll, ingestDocument, listSources, removeSource, type KbSource } from '../core/rag/store'
import { isEmbeddingEnabled, loadEmbeddingSettings } from '../core/rag/embeddings'

const emit = defineEmits<{ (e: 'close'): void }>()

const sources = ref<KbSource[]>([])
const docName = ref('')
const docText = ref('')
const busy = ref(false)
const status = ref('')
const embeddingOn = isEmbeddingEnabled()
const embCfg = loadEmbeddingSettings()
const fileInput = ref<HTMLInputElement>()

function refresh() {
  sources.value = listSources()
}

onMounted(refresh)

async function addDoc() {
  if (busy.value) return
  const text = docText.value.trim()
  if (!text) {
    status.value = '请先粘贴文档内容'
    return
  }
  busy.value = true
  status.value = '正在分块并向量化…'
  try {
    const { source, degraded } = await ingestDocument(docName.value || text.slice(0, 12), text)
    status.value = degraded
      ? `已导入「${source.name}」（${source.chunkCount} 块），但向量化失败，已降级为关键词检索`
      : `已导入「${source.name}」：${source.chunkCount} 个知识块${source.embedded ? '（含向量）' : '（纯关键词检索）'}`
    docName.value = ''
    docText.value = ''
    refresh()
  } catch (e) {
    status.value = '导入失败：' + (e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const text = await file.text()
  docName.value = docName.value || file.name.replace(/\.[^.]+$/, '')
  docText.value = text
  status.value = `已读取「${file.name}」（${text.length} 字符），点击导入完成索引`
}

function clearKb() {
  if (!confirm('确定清空整个知识库？')) return
  clearAll()
  status.value = '知识库已清空'
  refresh()
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal">
      <div class="head">
        知识库（RAG 文档问答）
        <button class="close" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <p class="hint">
          上传业务文档后，AI 生成/修改大屏时会自动调用 search_knowledge 检索相关内容，
          例如「根据这份销售制度生成大屏」。
          <template v-if="embeddingOn">
            当前嵌入模型：<b>{{ embCfg.model }}</b>（{{ embCfg.baseUrl }}）→ 向量 + 关键词混合检索。
          </template>
          <template v-else>
            未配置嵌入模型，当前为<b>纯关键词检索</b>。在「设置」中填写嵌入模型（如通义 text-embedding-v3）可启用向量检索。
          </template>
        </p>

        <div class="row">
          <input v-model="docName" class="name" placeholder="文档名称（可留空自动取）" />
          <button class="btn ghost" :disabled="busy" @click="fileInput?.click()">选择文件</button>
          <input ref="fileInput" type="file" accept=".md,.markdown,.txt,.csv,.json" style="display: none" @change="onFile" />
        </div>
        <textarea
          v-model="docText"
          rows="6"
          placeholder="粘贴文档内容（支持 Markdown / 纯文本），或点击「选择文件」读取 .md / .txt"
        ></textarea>

        <div class="actions">
          <button class="btn primary" :disabled="busy || !docText.trim()" @click="addDoc">
            {{ busy ? '索引中…' : '导入并索引' }}
          </button>
          <span v-if="status" class="status">{{ status }}</span>
        </div>

        <div v-if="sources.length" class="sources">
          <div class="sources-head">已索引来源（{{ sources.length }}）</div>
          <div v-for="s in sources" :key="s.id" class="source">
            <span class="s-name" :title="s.name">{{ s.name }}</span>
            <span class="s-meta">{{ s.chunkCount }} 块 · {{ s.chars }} 字 · {{ s.embedded ? '含向量' : '关键词' }}</span>
            <button class="s-del" title="删除该来源" @click="removeSource(s.id); refresh()">删</button>
          </div>
          <button class="btn ghost danger" @click="clearKb">清空知识库</button>
        </div>
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
  width: 560px;
  max-height: 82vh;
  overflow: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.head {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text);
}

.close {
  background: none;
  border: none;
  color: var(--text-3);
  font-size: 14px;
  cursor: pointer;
}

.hint {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.hint b {
  color: var(--accent);
  font-weight: 600;
}

.row {
  display: flex;
  gap: 8px;
}

.name {
  flex: 1;
}

input,
textarea {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.15s;
}

textarea {
  resize: vertical;
  line-height: 1.6;
}

input:focus,
textarea:focus {
  border-color: var(--accent);
  outline: none;
}

input::placeholder,
textarea::placeholder {
  color: var(--text-3);
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status {
  font-size: 12px;
  color: var(--warn);
}

.sources {
  border-top: 1px solid var(--border-soft);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sources-head {
  font-size: 12px;
  color: var(--text-3);
}

.source {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  background: var(--panel-2);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  padding: 6px 10px;
}

.s-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.s-meta {
  color: var(--text-3);
  flex-shrink: 0;
}

.s-del {
  background: none;
  border: 1px solid rgba(248, 81, 73, 0.35);
  color: #ffb3ae;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}

.btn {
  padding: 7px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border: none;
  color: #0d1117;
  font-weight: 600;
}

.btn.ghost {
  background: none;
  color: var(--text-2);
}

.btn.danger {
  color: #ffb3ae;
  border-color: rgba(248, 81, 73, 0.35);
  align-self: flex-start;
}
</style>
