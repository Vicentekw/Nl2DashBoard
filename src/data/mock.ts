import type { DataConfig, Dataset } from '../types'

export type { Dataset }

/** 简单可复现的伪随机（同一配置生成稳定数据） */
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rand(min: number, max: number, rnd: () => number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return Math.round(rnd() * 100)
  const v = min + rnd() * (max - min)
  return Math.round(v * 100) / 100
}

function timeLabels(points: number): string[] {
  const n = Math.max(4, Math.min(48, Math.round(points || 12)))
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000)
    out.push(`${String(d.getHours()).padStart(2, '0')}:00`)
  }
  return out
}

export function generateDataset(cfg: DataConfig, key: string): Dataset {
  const rnd = mulberry32(hashSeed(key + cfg.sourceType + cfg.name))
  const min = cfg.min ?? 0
  const max = cfg.max ?? 100

  switch (cfg.sourceType) {
    case 'timeSeries': {
      const labels = timeLabels(cfg.points ?? 12)
      const base = rand(min, max, rnd)
      const values = labels.map((_, i) => {
        const wave = Math.sin(i / 2.5 + rnd() * 0.6) * (max - min) * 0.12
        const v = base + wave + (rnd() - 0.5) * (max - min) * 0.08
        return Math.round(Math.min(max, Math.max(min, v)) * 100) / 100
      })
      return { labels, series: [{ name: cfg.name, values }] }
    }
    case 'ratio': {
      const cats = (cfg.categories?.length ? cfg.categories : ['分类A', '分类B', '分类C', '分类D']).slice(0, 8)
      const raw = cats.map(() => rnd() + 0.15)
      const sum = raw.reduce((a, b) => a + b, 0)
      const values = raw.map((v) => Math.round((v / sum) * 1000) / 10)
      return { labels: cats, series: [{ name: cfg.name, values }] }
    }
    case 'ranking': {
      const cats = (cfg.categories?.length ? cfg.categories : ['北京', '上海', '广州', '深圳', '杭州']).slice(0, 10)
      const values = cats.map(() => rand(min, max, rnd)).sort((a, b) => b - a)
      return { labels: cats, series: [{ name: cfg.name, values }] }
    }
    case 'metric': {
      const value = rand(min, max, rnd)
      const trend = Math.round((rnd() * 30 - 10) * 10) / 10
      return { labels: [], series: [{ name: cfg.name, values: [value] }], value, trend }
    }
    case 'category':
    default: {
      const cats = (cfg.categories?.length ? cfg.categories : ['一月', '二月', '三月', '四月', '五月', '六月']).slice(0, 12)
      const values = cats.map(() => rand(min, max, rnd))
      return { labels: cats, series: [{ name: cfg.name, values }] }
    }
  }
}
