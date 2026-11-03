export interface AppSettings {
  baseUrl: string
  apiKey: string
  model: string
  /** RAG 知识库：嵌入模型（缺省走纯关键词检索）；baseUrl/Key 缺省复用主配置 */
  embeddingModel?: string
  embeddingBaseUrl?: string
  embeddingApiKey?: string
}

const STORAGE_KEY = 'nl2dashboard.settings'

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat'
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
