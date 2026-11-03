/** 文本分块：按标题/段落边界切分，带重叠窗口，保留上下文连贯性 */

export interface TextChunk {
  index: number
  text: string
}

const TARGET_SIZE = 420
const OVERLAP = 60

/** 按语义边界（标题行 > 空行段落 > 硬切）把长文本切成带重叠的块 */
export function chunkText(raw: string): TextChunk[] {
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) return []

  // 优先按 markdown 标题 / 中文编号行切大段
  const sections = splitBySections(text)
  const chunks: string[] = []

  for (const section of sections) {
    if (section.length <= TARGET_SIZE) {
      chunks.push(section)
      continue
    }
    // 大段内部再按段落聚合
    const paras = section.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    let buf = ''
    for (const para of paras) {
      if (buf && buf.length + para.length + 2 > TARGET_SIZE) {
        chunks.push(buf)
        // 重叠：取上一块结尾片段，保持上下文
        buf = buf.slice(-OVERLAP) + '\n' + para
      } else {
        buf = buf ? buf + '\n' + para : para
      }
      // 单段超长则硬切
      while (buf.length > TARGET_SIZE * 1.6) {
        chunks.push(buf.slice(0, TARGET_SIZE))
        buf = buf.slice(TARGET_SIZE - OVERLAP)
      }
    }
    if (buf.trim()) chunks.push(buf.trim())
  }

  return chunks.map((t, index) => ({ index, text: t }))
}

function splitBySections(text: string): string[] {
  const lines = text.split('\n')
  const marks: number[] = [0]
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    // markdown 标题或「一、/Q12/第X章」式编号行视为段落边界
    if (/^#{1,4}\s/.test(line) || /^(一|二|三|四|五|六|七|八|九|十)[、.]/.test(line) || /^Q?\d{1,3}[.、\s]/.test(line)) {
      marks.push(i)
    }
  }
  if (marks.length <= 1) return [text]
  const sections: string[] = []
  for (let i = 0; i < marks.length; i++) {
    const seg = lines.slice(marks[i], marks[i + 1]).join('\n').trim()
    if (seg) sections.push(seg)
  }
  return sections
}
