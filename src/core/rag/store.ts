/** 知识库存储：分块 + 向量持久化（localStorage），含混合检索的打分实现 */

import type { TextChunk } from './chunker'
import { chunkText } from './chunker'
import { embedTexts, isEmbeddingEnabled } from './embeddings'

const STORAGE_KEY = 'nl2dashboard.kb.v1'
const MAX_CHUNKS = 400
/** 向量按 4 位小数存储，压缩 localStorage 体积 */
const VECTOR_PRECISION = 4

export interface KbChunk {
  id: string
  sourceId: string
  sourceName: string
  text: string
  /** 嵌入向量；未启用嵌入模型时为空（走关键词检索） */
  vector: number[] | null
}

export interface KbSource {
  id: string
  name: string
  chunkCount: number
  chars: number
  embedded: boolean
  createdAt: string
}

export interface SearchHit {
  sourceName: string
  text: string
  score: number
}

interface KbData {
  sources: KbSource[]
  chunks: KbChunk[]
}

function loadKb(): KbData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as KbData
  } catch {
    /* 损坏则重建 */
  }
  return { sources: [], chunks: [] }
}

function saveKb(data: KbData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

let seq = 1
function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}_${seq++}_${Math.random().toString(36).slice(2, 6)}`
}

/** 余弦相似度 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

/** 关键词打分：CJK 用字符二元组、ASCII 用小写词元，命中数归一化 */
export function keywordScore(query: string, text: string): number {
  const qTokens = tokenize(query)
  if (!qTokens.length) return 0
  const tTokens = tokenize(text)
  const tSet = new Set(tTokens)
  let hits = 0
  for (const t of qTokens) if (tSet.has(t)) hits++
  return hits / qTokens.length
}

function tokenize(s: string): string[] {
  const tokens: string[] = []
  const lower = s.toLowerCase()
  // ASCII 词元
  for (const m of lower.matchAll(/[a-z0-9_+#.]{2,}/g)) tokens.push(m[0])
  // CJK 字符二元组
  const cjk = lower.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk.slice(i, i + 2))
  if (cjk.length === 1) tokens.push(cjk)
  return tokens
}

export function listSources(): KbSource[] {
  return loadKb().sources.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 导入一篇文档：分块 → 尝试向量化（失败自动降级为关键词检索）→ 持久化 */
export async function ingestDocument(name: string, rawText: string): Promise<{ source: KbSource; degraded: boolean }> {
  const chunks: TextChunk[] = chunkText(rawText)
  if (!chunks.length) throw new Error('文档内容为空')

  const texts = chunks.map((c) => c.text)
  let vectors: number[][] | null = null
  let degraded = false
  if (isEmbeddingEnabled()) {
    try {
      vectors = await embedTexts(texts)
    } catch {
      degraded = true // 嵌入失败不阻断导入，降级为关键词检索
    }
  }

  const data = loadKb()
  const sourceId = uid('s_')
  const source: KbSource = {
    id: sourceId,
    name: name.trim() || '未命名文档',
    chunkCount: chunks.length,
    chars: rawText.length,
    embedded: Boolean(vectors),
    createdAt: new Date().toISOString()
  }

  const newChunks: KbChunk[] = chunks.map((c, i) => ({
    id: uid('c_'),
    sourceId,
    sourceName: source.name,
    text: c.text,
    vector: vectors ? vectors[i].map((v) => Number(v.toFixed(VECTOR_PRECISION))) : null
  }))

  data.sources.push(source)
  data.chunks.push(...newChunks)
  // 超限先淘汰最旧来源
  while (data.chunks.length > MAX_CHUNKS && data.sources.length > 1) {
    const oldest = data.sources.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    data.sources = data.sources.filter((s) => s.id !== oldest.id)
    data.chunks = data.chunks.filter((c) => c.sourceId !== oldest.id)
  }
  saveKb(data)
  return { source, degraded }
}

export function removeSource(sourceId: string): void {
  const data = loadKb()
  data.sources = data.sources.filter((s) => s.id !== sourceId)
  data.chunks = data.chunks.filter((c) => c.sourceId !== sourceId)
  saveKb(data)
}

export function clearAll(): void {
  saveKb({ sources: [], chunks: [] })
}

/** 混合检索：向量余弦 0.7 + 关键词 0.3（无向量时纯关键词），返回 topK 命中 */
export async function search(query: string, topK = 5): Promise<{ hits: SearchHit[]; mode: 'vector' | 'keyword'; notice?: string }> {
  const data = loadKb()
  if (!data.chunks.length) return { hits: [], mode: 'keyword', notice: '知识库为空' }

  const hasVectors = data.chunks.some((c) => c.vector)
  let qVec: number[] | null = null
  let notice: string | undefined

  if (hasVectors && isEmbeddingEnabled()) {
    try {
      qVec = (await embedTexts([query]))[0]
    } catch (e) {
      notice = '向量检索不可用（' + (e instanceof Error ? e.message : String(e)) + '），已降级为关键词检索'
    }
  }

  const scored = data.chunks.map((c) => {
    let score: number
    if (qVec && c.vector) {
      score = 0.7 * cosine(qVec, c.vector) + 0.3 * keywordScore(query, c.text)
    } else {
      score = keywordScore(query, c.text)
    }
    return { sourceName: c.sourceName, text: c.text, score }
  })

  const hits = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((h) => h.score > 0.01)
  return { hits, mode: qVec ? 'vector' : 'keyword', notice }
}

export function kbStats(): { sources: number; chunks: number } {
  const data = loadKb()
  return { sources: data.sources.length, chunks: data.chunks.length }
}
