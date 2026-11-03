/** OpenAI 兼容 /embeddings 客户端：批量向量化，失败时抛出明确错误由调用方降级 */

import { loadSettings } from '../settings'

export interface EmbeddingSettings {
  baseUrl: string
  apiKey: string
  model: string
}

/** 读取嵌入配置：独立配置优先，缺省回落到主对话模型配置 */
export function loadEmbeddingSettings(): EmbeddingSettings {
  const s = loadSettings()
  return {
    baseUrl: s.embeddingBaseUrl?.trim() || s.baseUrl,
    apiKey: s.embeddingApiKey?.trim() || s.apiKey,
    model: s.embeddingModel?.trim() || ''
  }
}

/** 是否配置了嵌入模型（决定 RAG 走向量检索还是纯关键词检索） */
export function isEmbeddingEnabled(): boolean {
  return Boolean(loadEmbeddingSettings().model)
}

const BATCH_SIZE = 16

/** 批量向量化文本，返回与输入顺序一致的向量数组 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const cfg = loadEmbeddingSettings()
  if (!cfg.model) throw new Error('未配置嵌入模型')
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/embeddings'

  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, input: batch })
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`嵌入接口返回 ${resp.status}：${text.slice(0, 200)}`)
    }
    const json = (await resp.json()) as { data?: Array<{ index: number; embedding: number[] }> }
    if (!json.data?.length) throw new Error('嵌入接口返回数据为空')
    const sorted = [...json.data].sort((a, b) => a.index - b.index)
    for (const d of sorted) out.push(d.embedding)
  }
  return out
}
