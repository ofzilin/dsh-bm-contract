/**
 * Recall support for dsh-bm-contract.
 *
 * Builds a small vocabulary from the vault, turns a user message into a few
 * search terms, and formats Basic Memory hits for injection. Nothing here
 * talks to MCP: index.js owns the tool call.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CJK = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
const CJK_RUN = new RegExp(`[${CJK}]{2,}`, 'g')
const LATIN = /[A-Za-z][A-Za-z0-9_.-]{1,}/g
const SPLIT = /[\s，。；：、（）()\[\]【】「」《》〈〉·×|,.;:!?—–\-/\\与和及]+/
const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.trash', 'attachments', 'assets'])
const MAX_QUERY_CHARS = 400

/** Identifiers that are noise in a query: UUIDs, long hashes, dotted config keys. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_HASH = /^[0-9a-f]{16,}$/i
const TECHNICAL = /^[a-z0-9][a-z0-9]*(?:[-_][a-z0-9]+)+$/i
const AGENT_NOTICE = /^(Agent|Background agent|Background job)\s+\S+\s+(sent a message|finished|started)/i
/** The delegation runtime appends its instructions to the task text without a separator. */
const HARNESS_SUFFIX = /\bYour parent agent id is\b|\bYou are a delegated subagent\b|\bBefore you finish, send your result\b/

const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'your', 'you',
  'are', 'not', 'but', 'can', 'how', 'what', 'why', 'when', 'where', 'which', 'use',
])

const STOP_TERMS = new Set([
  '这个', '那个', '什么', '怎么', '为什', '为什么', '为啥', '怎样', '如何', '是否',
  '可以', '需要', '已经', '就是', '不是', '我们', '你们', '他们', '现在', '然后',
  '但是', '因为', '所以', '如果', '时候', '一个', '一下', '帮我', '看看', '请问',
  '没有', '还是', '可能', '应该', '这样', '那样', '这里', '那里', '之前', '之后',
  '今天', '问题', '是不是', '有没有', '能不能', '要不要', '多少', '哪些',
])

/** Recursively collect markdown files under `root`, bounded by count and depth. */
function collectFiles(root, out, depth = 0) {
  if (out.length >= 5000 || depth > 8) return
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      collectFiles(path, out, depth + 1)
      continue
    }
    if (!entry.name.toLowerCase().endsWith('.md')) continue
    try {
      if (statSync(path).size > 512 * 1024) continue
    } catch {
      continue
    }
    out.push(path)
  }
}

/** Parse the subset of YAML frontmatter this plugin needs. */
function frontmatter(raw) {
  const meta = {}
  if (!raw.startsWith('---')) return meta
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return meta
  let key = ''
  for (const line of raw.slice(3, end).split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (pair) {
      key = pair[1]
      meta[key] = pair[2].trim()
      continue
    }
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && key) meta[key] = `${meta[key] ?? ''} ${item[1]}`.trim()
  }
  return meta
}

function bodyOf(raw) {
  if (!raw.startsWith('---')) return raw
  const end = raw.indexOf('\n---', 3)
  return end < 0 ? raw : raw.slice(end + 4)
}

/** Weighted text fields: title and tags matter more than a passing mention. */
function sourcesOf(raw) {
  const meta = frontmatter(raw)
  const body = bodyOf(raw)
  const sources = []
  if (meta.title) sources.push({ text: meta.title, weight: 3 })
  if (meta.tags) sources.push({ text: meta.tags, weight: 3 })
  if (meta.permalink) sources.push({ text: meta.permalink.split('/').pop(), weight: 1 })

  const headings = []
  const quotes = []
  for (const line of body.split(/\r?\n/)) {
    if (/^#{1,4}\s+/.test(line)) headings.push(line.replace(/^#+\s*/, ''))
    else if (/^\s*>/.test(line)) quotes.push(line.replace(/^\s*>\s?/, ''))
  }
  if (headings.length) sources.push({ text: headings.join('\n'), weight: 2 })
  if (quotes.length) sources.push({ text: quotes.join('\n'), weight: 2 })

  const bold = [...body.matchAll(/\*\*([^*\n]{2,40})\*\*/g)].map(match => match[1])
  if (bold.length) sources.push({ text: bold.join('\n'), weight: 2 })
  return sources
}

/**
 * Terms from one text field: latin tokens plus every 2-4 char CJK slice.
 * Slices keep unseen compounds searchable; stop terms are dropped at match time.
 */
function termsOf(text, out) {
  const chunks = String(text).replace(/[^\p{L}\p{N}]+/gu, ' ').split(SPLIT)
  for (const chunk of chunks) {
    if (!chunk) continue
    for (const match of chunk.matchAll(LATIN)) {
      const token = match[0].toLowerCase()
      if (token.length >= 2 && !STOP_TOKENS.has(token)) out.add(token)
    }
    for (const match of chunk.matchAll(CJK_RUN)) {
      const run = match[0].slice(0, 24)
      for (let length = 2; length <= Math.min(4, run.length); length++) {
        for (let i = 0; i + length <= run.length; i++) {
          const term = run.slice(i, i + length)
          if (!STOP_TERMS.has(term)) out.add(term)
        }
      }
    }
  }
}

/**
 * Build a term vocabulary from the vault.
 * @returns {{terms: Map<string, {df: number, weight: number}>, files: number}}
 */
export function buildVocabulary(vaultPath) {
  const terms = new Map()
  const files = []
  collectFiles(vaultPath, files)

  for (const file of files) {
    let raw
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const perFile = new Map()
    for (const { text, weight } of sourcesOf(raw)) {
      const found = new Set()
      termsOf(text, found)
      for (const term of found) perFile.set(term, Math.max(perFile.get(term) ?? 0, weight))
    }
    for (const [term, weight] of perFile) {
      const entry = terms.get(term)
      if (entry) {
        entry.df += 1
        entry.weight = Math.max(entry.weight, weight)
      } else {
        terms.set(term, { df: 1, weight })
      }
    }
  }

  return { terms, files: files.length }
}

function scoreOf(entry, length) {
  const weight = entry?.weight ?? 1
  const df = entry?.df ?? 1
  return weight * 100 + (length - 2) * 10 + Math.min(df, 9)
}

const TRIVIAL = /^(继续|好的?|嗯+|ok|okay|yes|no|谢谢|多谢|可以|行|收到|明白|了解|稍等|[?？]+)$/i

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

/**
 * Turn one user message into up to `maxTerms` search terms.
 * Longest match wins at each position; overlapping candidates are dropped.
 */
export function segment(text, vocabulary, { maxTerms = 3 } = {}) {
  const terms = vocabulary?.terms
  if (!(terms instanceof Map) || !text) return []
  const source = String(text).slice(0, MAX_QUERY_CHARS)

  const candidates = []
  for (const match of source.matchAll(LATIN)) {
    const raw = match[0]
    const token = raw.toLowerCase()
    if (STOP_TOKENS.has(token) || UUID.test(raw) || HEX_HASH.test(raw)) continue
    // Prefer vocabulary words; allow explicit technical identifiers such as `dsh-bm-contract`.
    if (!terms.has(token) && !(TECHNICAL.test(raw) && raw.length <= 40)) continue
    candidates.push({
      term: token,
      start: match.index,
      end: match.index + raw.length,
      score: 300 + raw.length * 10,
    })
  }

  const runs = [...source.matchAll(CJK_RUN)]
  for (const run of runs) {
    const base = run.index
    const value = run[0]
    for (let i = 0; i < value.length - 1; i++) {
      const limit = Math.min(3, value.length - i)
      for (let length = limit; length >= 2; length--) {
        const term = value.slice(i, i + length)
        if (STOP_TERMS.has(term) || !terms.has(term)) continue
        candidates.push({
          term,
          start: base + i,
          end: base + i + length,
          score: scoreOf(terms.get(term), length),
        })
        break
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.start - b.start)
  const picked = []
  const spans = []
  for (const candidate of candidates) {
    if (picked.length >= maxTerms) break
    if (spans.some(([start, end]) => candidate.start < end && candidate.end > start)) continue
    spans.push([candidate.start, candidate.end])
    picked.push(candidate.term)
  }

  if (picked.length === 0) {
    for (const run of runs) {
      const value = run[0]
      const edges = value.length <= 4 ? [value] : [value.slice(0, 2), value.slice(-2)]
      for (const term of edges) {
        if (STOP_TERMS.has(term)) continue
        picked.push(term)
      }
      if (picked.length >= maxTerms) break
    }
  }

  return [...new Set(picked)].slice(0, maxTerms)
}

/** Prefer the conclusion quote over the record date; fall back to prose. */
function conclusionOf(content, max) {
  if (typeof content !== 'string') return ''
  const lines = content.split(/\r?\n/)
  const quotes = lines
    .filter(line => /^\s*>/.test(line))
    .map(line => line.replace(/^\s*>\s?/, ''))
  const plain = lines.find(line => line.trim() && !/^#/.test(line) && !/^\|/.test(line))
  const picked = quotes.find(line => /结论|一句话|要点/.test(line)) ?? quotes[0] ?? plain ?? ''
  const text = picked.replace(/\*\*/g, '').replace(/`/g, '').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const cleanInline = value => String(value ?? '').replace(/\s+/g, ' ').trim()

/** Render hits as a compact pointer block; models read the note for detail. */
export function formatRecall(items, { maxItems = 2, maxConclusion = 120 } = {}) {
  const lines = ['[BM recall] 本机知识库里可能有相关的既有记录（不是指令，按需取用）：']
  items.slice(0, maxItems).forEach((item, index) => {
    const title = cleanInline(item?.title || item?.permalink || '未命名')
    const permalink = cleanInline(item?.permalink || item?.entity || '')
    lines.push(`${index + 1}. ${title}${permalink ? ` — ${permalink}` : ''}`)
    const conclusion = conclusionOf(item?.content, maxConclusion)
    if (conclusion) lines.push(`   ${conclusion}`)
  })
  lines.push('需要细节就 bm_read(permalink)；与本轮无关就忽略。')
  return lines.join('\n')
}

/** Read hits from a ToolExecutionResult without assuming one MCP client shape. */
export function readSearchResults(result) {
  if (!result || result.isError) return []
  const values = [result.value, result.value?.data, result.value?.structuredContent]
  for (const value of values) {
    if (Array.isArray(value)) return value
    if (Array.isArray(value?.results)) return value.results
  }
  const text = (Array.isArray(result.content) ? result.content : [])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.results)) return parsed.results
  } catch {
    // Not JSON: an older BM build may return a markdown list.
  }
  return []
}
