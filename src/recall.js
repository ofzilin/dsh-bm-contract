/**
 * Recall formatting for dsh-bm-contract.
 *
 * index.js owns the MCP call; this module is pure. It decides which hits are
 * worth showing and renders them as one bounded block of markdown.
 */

/** Absolute cutoffs. Deliberately not configurable: fewer knobs to tune. */
export const MIN_SCORE = 0.5
export const READ_SCORE = 0.8
export const MAX_ITEMS = 2
export const MAX_CHARS = 600

const MAX_TITLE = 60
const MAX_CONCLUSION = 100

const TRIVIAL = /^(继续|好的?|嗯+|ok|okay|yes|no|谢谢|多谢|可以|行|收到|明白|了解|稍等|[?？]+)$/i
const AGENT_NOTICE = /^(Agent|Background agent|Background job)\s+\S+\s+(sent a message|finished|started)/i
/** The delegation runtime appends its instructions to the task text. */
const HARNESS_SUFFIX = /\bYour parent agent id is\b|\bYou are a delegated subagent\b|\bBefore you finish, send your result\b/

export function isTrivial(text) {
  const value = String(text ?? '').trim()
  return value.length < 4 || TRIVIAL.test(value)
}

/** Agent-to-agent notifications are user-role messages but never human prompts. */
export function isAgentNotice(text) {
  return AGENT_NOTICE.test(String(text ?? '').trim())
}

/** Drop the delegation instructions appended after the human task text. */
export function stripHarnessSuffix(text) {
  const value = String(text ?? '')
  const at = value.search(HARNESS_SUFFIX)
  return (at > 0 ? value.slice(0, at) : value).trim()
}

/** Normalize a permalink, file path, or title so duplicates collide. */
export function normalizeRecallId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^main\//, '')
    .replace(/\.md$/i, '')
    .replace(/\\/g, '/')
}

/** The identifier used to remember that a note was already shown. */
export function hitId(item) {
  const value = item?.permalink ?? item?.entity ?? item?.file_path ?? item?.title
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Keep the strongest unseen hits.
 * @param {unknown} items raw search_notes results
 * @param {Set<string>} seen normalized ids already shown in this session
 */
export function pickHits(items, seen) {
  const ranked = (Array.isArray(items) ? items : [])
    .map(item => ({ item, score: Number(item?.score ?? 0) }))
    .filter(entry => Number.isFinite(entry.score) && entry.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)

  const hits = []
  for (const { item } of ranked) {
    const id = hitId(item)
    if (!id) continue
    const key = normalizeRecallId(id)
    if (!key || seen.has(key)) continue
    seen.add(key)
    hits.push(item)
    if (hits.length >= MAX_ITEMS) break
  }
  return hits
}

/** Flatten to one line and strip markdown that would break the block layout. */
function cleanInline(value, max = Number.POSITIVE_INFINITY) {
  const text = String(value ?? '')
    .replace(/[*`\[\]<>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([：:，,。、])\s+/g, '$1')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Prefer a stated conclusion or quote; fall back to the first prose line. */
function conclusionOf(content, max) {
  if (typeof content !== 'string') return ''
  const lines = content.split(/\r?\n/)
  const quotes = lines
    .filter(line => /^\s*>/.test(line))
    .map(line => line.replace(/^\s*>\s?/, ''))
  const plain = lines.find(line =>
    line.trim() && !/^#/.test(line) && !/^\|/.test(line) && !/^---/.test(line))
  const picked = quotes.find(line => /结论|要点|一句话/.test(line)) ?? quotes[0] ?? plain ?? ''
  // Basic Memory observations look like `- [决策] 内容`; keep only the payload.
  const observation = /^\s*[-*]\s*\[([^\]]{1,12})\]\s*(.+)$/.exec(picked)
  const text = observation
    ? cleanInline(`${observation[1]}：${observation[2]}`, max)
    : cleanInline(picked, max)
  return text
}

/**
 * Render hits as the injected block, or '' when there is nothing to show.
 * The 必读 tier is reserved for the top hit and only above READ_SCORE: a
 * relative cutoff would force a read on turns where every hit is noise.
 */
export function formatRecall(items) {
  const hits = (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS)
  if (hits.length === 0) return ''

  const tail = '必读 = 先用 read_note 读全文再回答；参考 = 摘要够用就别读；不要复述本块。'
  const header = count => `## 知识库相关笔记（${count} 条，按相似度排序）`
  const build = blocks => [header(blocks.length), '', blocks.join('\n\n'), '', tail].join('\n')
  const render = (item, index) => {
    const title = cleanInline(item?.title || item?.permalink || '未命名', MAX_TITLE)
    const permalink = cleanInline(item?.permalink ?? item?.entity ?? '', 240)
    const score = Number(item?.score ?? 0)
    const tier = index === 0 && score >= READ_SCORE ? '必读' : '参考'
    const head = `${index + 1}. **${title}**${permalink ? ` — \`${permalink}\`` : ''} [${score.toFixed(2)} ${tier}]`
    const conclusion = conclusionOf(item?.content, MAX_CONCLUSION)
    return conclusion ? `${head}\n   ${conclusion}` : head
  }

  let blocks = hits.map(render)
  let text = build(blocks)
  if (text.length <= MAX_CHARS) return text

  // Over budget: drop conclusions from the end, then drop entries from the end.
  for (let index = blocks.length - 1; index >= 0 && text.length > MAX_CHARS; index--) {
    const head = blocks[index].split('\n')[0]
    if (head === blocks[index]) continue
    blocks[index] = head
    text = build(blocks)
  }
  while (text.length > MAX_CHARS && blocks.length > 1) {
    blocks = blocks.slice(0, -1)
    text = build(blocks)
  }
  return text
}

/** Read hits from a ToolExecutionResult without assuming one MCP client shape. */
export function readSearchResults(result) {
  if (!result || result.isError) return []
  const nested = result.value?.structuredContent?.result ?? result.value?.result
  const values = [result.value, result.value?.data, result.value?.structuredContent, nested]
  for (const value of values) {
    const hits = hitsOf(value)
    if (hits) return hits
  }
  const text = (Array.isArray(result.content) ? result.content : [])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return hitsOf(parsed) ?? hitsOf(parsed?.result) ?? []
  } catch {
    // Not JSON: an older BM build may return a markdown list.
  }
  return []
}

/** Basic Memory wraps results as `{ results: [...] }` one or two levels deep. */
function hitsOf(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.results)) return value.results
  return null
}
