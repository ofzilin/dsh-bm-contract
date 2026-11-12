import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildVocabulary, formatRecall, isAgentNotice, isTrivial, readSearchResults, segment } from './recall.js'

export const name = 'bm-contract'
export const inject = ['systemPrompt', 'tools']

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || join(os.homedir(), '.dsh')
const USER_DIR = join(DSH_HOME, 'dsh-bm-contract')
const USER_CONTRACT = join(USER_DIR, 'CONTRACT.md')
const LOCAL_DEFAULTS_DIR = join(PACKAGE_ROOT, 'defaults.local')
const DEFAULTS_DIR = existsSync(LOCAL_DEFAULTS_DIR)
  ? LOCAL_DEFAULTS_DIR
  : join(PACKAGE_ROOT, 'defaults')
const BUNDLED_CONTRACT = join(DEFAULTS_DIR, 'CONTRACT.md')
const BUNDLED_SPEC = join(DEFAULTS_DIR, 'SPEC.md')

const DEFAULT_ROUTER = [
  '- 知识库 = Basic Memory project `main`（vault 路径见上方 header）。',
  '- 写知识笔记（项目需求/总结/学习资料/研究笔记）时，先按规范判断目录、标签、链接；完整规范见 header 里的 SPEC 路径。',
  '- 知识笔记只放 `projects/`、`reference/`、`inbox/`；代码仓库自己的 README/API 文档留在仓库。',
  '- 不确定是否属于知识库时先问；不要把代码文档默认复制进知识库。',
].join('\n')

const DEFAULT_CONTRACT = [
  '- 目录：跨项目通用 → `reference/<discipline>/`；只影响一个项目 → `projects/<project>/<function>/`；不确定 → `inbox/`。',
  '- 一条笔记只表达一个主题；文件名用稳定、可读的主题名。',
  '- 每条知识笔记 1 个主场标签（必填）+ 0–2 个检索标签，总数 ≤ 3；小写英文，`/` 层级 ≤ 2。',
  '- 关系用 `[[wiki-link]]`，不用标签表达。',
  '- 被第二个项目引用后，从项目层提升到 `reference/`；归档优先于删除。',
  '- 移动/重命名用 `bm_move`，移动后检查断链。',
  '- `CONTRACT.md`/`SPEC.md` 在 `~/.dsh/dsh-bm-contract/`，不在 vault 内；知识笔记不要引用它们。',
].join('\n')

const DEFAULT_TRIGGERS = [
  '知识库', '记到', '存到', '笔记', 'basic memory', 'basic-memory',
  '项目总结', '项目需求', '学习资料', 'reference/', 'inbox/',
]

const numberOr = (value, fallback) => (Number.isFinite(value) ? value : fallback)
const integerOr = (value, fallback) =>
  (Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback)

function ensureUserFiles(logger) {
  try {
    mkdirSync(USER_DIR, { recursive: true })
    for (const filename of ['CONTRACT.md', 'SPEC.md']) {
      const destination = join(USER_DIR, filename)
      const source = join(DEFAULTS_DIR, filename)
      if (!existsSync(destination) && existsSync(source)) {
        copyFileSync(source, destination)
        logger?.info?.(`bm-contract: created default ${destination}`)
      }
    }
  } catch (error) {
    logger?.warn?.(
      `bm-contract: could not initialize ${USER_DIR}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const MARKERS = {
  routerStart: '<!-- KB-ROUTER:START -->',
  routerEnd: '<!-- KB-ROUTER:END -->',
  contractStart: '<!-- KB-CONTRACT:START -->',
  contractEnd: '<!-- KB-CONTRACT:END -->',
}

function extract(raw, start, end) {
  if (!start || !end) return ''
  const a = raw.indexOf(start)
  const b = raw.indexOf(end)
  if (a < 0 || b < 0 || b <= a) return ''
  return raw.slice(a + start.length, b).trim()
}

function textOf(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

function makeUserMessage(text) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([{ type: 'text', text }]),
    source: Object.freeze({ kind: 'bm-contract' }),
  })
}

export function apply(ctx, config = {}) {
  ensureUserFiles(ctx.logger)

  const vault = typeof config.vaultPath === 'string' ? config.vaultPath.trim() : ''
  const file = config.contractPath
    ? (isAbsolute(config.contractPath)
      ? config.contractPath
      : resolve(PACKAGE_ROOT, config.contractPath))
    : (existsSync(USER_CONTRACT) ? USER_CONTRACT : BUNDLED_CONTRACT)
  const maxChars = Number.isFinite(config.maxChars) && config.maxChars > 0
    ? config.maxChars
    : 4000
  const triggers = Array.isArray(config.triggers) && config.triggers.length > 0
    ? config.triggers.map(String).map(trigger => trigger.toLowerCase())
    : DEFAULT_TRIGGERS

  const recall = config.recall && typeof config.recall === 'object' ? config.recall : {}
  const recallEnabled = recall.enabled ?? config.recallEnabled ?? true
  const recallTool = typeof recall.toolName === 'string' && recall.toolName
    ? recall.toolName
    : 'mcp__basic-memory__bm_search'
  const recallProject = typeof recall.project === 'string' && recall.project
    ? recall.project
    : 'main'
  const recallMode = typeof recall.mode === 'string' && recall.mode ? recall.mode : 'hybrid'
  const recallMinSimilarity = numberOr(recall.minSimilarity, 0.2)
  const recallMinScore = numberOr(recall.minScore, 0.5)
  const recallMaxTerms = integerOr(recall.maxTerms, 3)
  const recallTopK = integerOr(recall.topK, 5)
  const recallMaxItems = integerOr(recall.maxItems, 2)
  const recallVocabTtl = integerOr(recall.vocabTtlMs, 5 * 60 * 1000)
  const recallLedger = recall.ledger !== false

  const header = [
    vault
      ? `Basic Memory knowledge base: project "main", vault ${vault}.`
      : 'Basic Memory knowledge base: project "main" (set config.vaultPath in the plugin entry).',
    `Rules: ${join(USER_DIR, 'SPEC.md')} (outside the vault; do not link it from notes).`,
    '',
  ].join('\n')

  let cache = { key: '', router: DEFAULT_ROUTER, contract: DEFAULT_CONTRACT }
  let warned = false

  const load = () => {
    try {
      const stat = statSync(file)
      const key = `${stat.mtimeMs}:${stat.size}`
      if (key !== cache.key) {
        const raw = readFileSync(file, 'utf8')
        const router = extract(
          raw,
          config.routerStart ?? MARKERS.routerStart,
          config.routerEnd ?? MARKERS.routerEnd,
        ) || DEFAULT_ROUTER
        const contract = extract(
          raw,
          config.contractStart ?? MARKERS.contractStart,
          config.contractEnd ?? MARKERS.contractEnd,
        ) || DEFAULT_CONTRACT
        cache = { key, router, contract }
      }
    } catch (error) {
      if (!warned) {
        warned = true
        ctx.logger?.warn?.(
          `bm-contract: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    return cache
  }

  const clip = text => (text.length > maxChars ? text.slice(0, maxChars) : text)
  const routerText = () => `${header}${clip(load().router)}`
  const contractText = () => `${header}${clip(load().contract)}`

  let vocabularyCache = { at: 0, value: null }
  let recallWarned = false
  let recallFailures = 0
  let recallDisabled = false

  const vocabulary = () => {
    if (!vault) return null
    const now = Date.now()
    if (vocabularyCache.value && now - vocabularyCache.at < recallVocabTtl) {
      return vocabularyCache.value
    }
    try {
      vocabularyCache = { at: now, value: buildVocabulary(vault) }
    } catch (error) {
      if (!recallWarned) {
        recallWarned = true
        ctx.logger?.warn?.(
          `bm-contract: vocabulary build failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    return vocabularyCache.value
  }

  const appendLedger = entry => {
    if (!recallLedger) return
    try {
      appendFileSync(
        join(USER_DIR, 'recall-ledger.jsonl'),
        `${JSON.stringify({ ts: new Date().toISOString(), project: recallProject, ...entry })}\n`,
        'utf8',
      )
    } catch {
      // Recall bookkeeping must never break a turn.
    }
  }

  const searchVault = async (agent, signal, query) => {
    const result = await ctx.tools.execute({
      callId: `bm-recall:${randomUUID()}`,
      name: recallTool,
      arguments: {
        project: recallProject,
        query,
        mode: recallMode,
        min_similarity: recallMinSimilarity,
        page_size: recallTopK,
        output_format: 'json',
      },
      agent,
      signal: signal ?? new AbortController().signal,
    })
    if (result?.isError) {
      const reason = result.error?.message ?? result.error?.code ?? 'bm_search failed'
      throw new Error(reason)
    }
    recallFailures = 0
    return readSearchResults(result)
  }

  const injectedNotes = new WeakMap()
  const recallSeen = new WeakMap()

  const buildRecallNotice = async ({ agent, session, message, signal }) => {
    if (!recallEnabled || recallDisabled || !vault) return ''
    if (typeof ctx.tools?.execute !== 'function') return ''
    const text = textOf(message).trim()
    if (!text || isTrivial(text) || isAgentNotice(text)) return ''

    const vocab = vocabulary()
    const terms = vocab ? segment(text, vocab, { maxTerms: recallMaxTerms }) : []
    if (terms.length === 0) return ''

    let items = await searchVault(agent, signal, terms.join(' '))
    const fallback = items.length === 0
    if (fallback) items = await searchVault(agent, signal, text.slice(0, 200))
    if (items.length === 0) return ''

    const seen = injectedNotes.get(session) ?? new Set()
    injectedNotes.set(session, seen)
    const hits = items
      .filter(item => Number(item?.score ?? 0) >= recallMinScore)
      .filter(item => {
        const key = item?.permalink ?? item?.entity ?? item?.file_path ?? item?.title
        return typeof key === 'string' && key.length > 0 && !seen.has(key)
      })
      .slice(0, recallMaxItems)
    if (hits.length === 0) return ''

    for (const item of hits) {
      seen.add(item.permalink ?? item.entity ?? item.file_path ?? item.title)
    }
    appendLedger({
      terms,
      fallback,
      hits: hits.map(item => ({
        permalink: item.permalink ?? item.entity ?? '',
        score: Number(item.score ?? 0),
      })),
    })
    return formatRecall(hits, { maxItems: recallMaxItems })
  }

  const specPath = join(USER_DIR, 'SPEC.md')
  const readText = path => {
    try { return readFileSync(path, 'utf8') } catch { return '' }
  }
  const statePayload = () => {
    const defaultContract = readText(BUNDLED_CONTRACT)
    const defaultSpec = readText(BUNDLED_SPEC)
    const contract = readText(file)
    const spec = readText(specPath) || defaultSpec
    return {
      contract,
      spec,
      paths: { contract: file, spec: specPath },
      customized: contract.trim() !== defaultContract.trim()
        || spec.trim() !== defaultSpec.trim(),
    }
  }
  const validateContract = value => {
    if (typeof value !== 'string') throw new Error('contract must be a string')
    if (value.length > 200_000) throw new Error('contract is too large')
    for (const marker of [
      '<!-- KB-ROUTER:START -->', '<!-- KB-ROUTER:END -->',
      '<!-- KB-CONTRACT:START -->', '<!-- KB-CONTRACT:END -->',
    ]) {
      if (!value.includes(marker)) throw new Error(`missing marker: ${marker}`)
    }
  }
  const saveFiles = (contract, spec) => {
    validateContract(contract)
    if (typeof spec !== 'string') throw new Error('spec must be a string')
    if (spec.length > 200_000) throw new Error('spec is too large')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, contract, 'utf8')
    mkdirSync(USER_DIR, { recursive: true })
    writeFileSync(specPath, spec, 'utf8')
    cache = { key: '', router: DEFAULT_ROUTER, contract: DEFAULT_CONTRACT }
  }
  const resetFiles = () => {
    const bundledContract = readText(BUNDLED_CONTRACT)
    const bundledSpec = readText(BUNDLED_SPEC)
    if (!bundledContract) throw new Error('bundled CONTRACT.md is missing')
    if (!bundledSpec) throw new Error('bundled SPEC.md is missing')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, bundledContract, 'utf8')
    mkdirSync(USER_DIR, { recursive: true })
    writeFileSync(specPath, bundledSpec, 'utf8')
    cache = { key: '', router: DEFAULT_ROUTER, contract: DEFAULT_CONTRACT }
  }
  const readJsonBody = req => new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > 200_000) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
  const sendJson = (res, status, payload) => {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }
  const isLoopback = req => {
    const address = req.socket.remoteAddress || ''
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }
  const guard = req => (isLoopback(req) ? null : 'loopback only')

  ctx.inject(['webServer'], web => {
    const route = (path, handler) => web.effect(
      () => web.webServer.register({ kind: 'exact', path, handler }),
      `bm-contract: ${path}`,
    )
    route('/bm-contract/state', (req, res) => {
      const denied = guard(req)
      if (denied) return sendJson(res, 403, { error: denied })
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
      sendJson(res, 200, statePayload())
    })
    route('/bm-contract/save', async (req, res) => {
      const denied = guard(req)
      if (denied) return sendJson(res, 403, { error: denied })
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      try {
        const body = await readJsonBody(req)
        saveFiles(body.contract, body.spec)
        sendJson(res, 200, statePayload())
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    })
    route('/bm-contract/reset', async (req, res) => {
      const denied = guard(req)
      if (denied) return sendJson(res, 403, { error: denied })
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      try {
        resetFiles()
        sendJson(res, 200, statePayload())
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    })
  })

  ctx.systemPrompt.section({
    name: 'bm:router',
    order: 4000,
    interpolate: false,
    text: routerText,
  })

  const seen = new WeakMap()

  const matches = text => {
    if (!text) return false
    const lower = text.toLowerCase()
    return triggers.some(trigger => lower.includes(trigger))
  }

  const injectAfterLast = (decision, originals, notice) => {
    const at = decision.messages.findLastIndex(message => originals.includes(message))
    return {
      ...decision,
      messages: at >= 0
        ? decision.messages.toSpliced(at + 1, 0, notice)
        : [...decision.messages, notice],
    }
  }

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next()
    try {
      if (decision.kind !== 'enter' || signal?.aborted) return decision
      const session = agent?.session
      if (!session || !Array.isArray(messages) || !Array.isArray(decision.messages)) return decision
      const lastUser = [...messages].reverse().find(message => message?.role === 'user')
      if (!lastUser?.id) return decision

      let result = decision
      if (seen.get(session) !== lastUser.id && matches(textOf(lastUser))) {
        seen.set(session, lastUser.id)
        result = injectAfterLast(
          result,
          messages,
          makeUserMessage(`[BM contract]\n${contractText()}`),
        )
      }

      if (recallSeen.get(session) !== lastUser.id) {
        recallSeen.set(session, lastUser.id)
        let notice = ''
        try {
          notice = await buildRecallNotice({ agent, session, message: lastUser, signal })
        } catch (error) {
          recallFailures += 1
          if (recallFailures >= 3 && !recallDisabled) {
            recallDisabled = true
            ctx.logger?.warn?.(
              'bm-contract: recall disabled after repeated bm_search failures (set recall.enabled=false to silence)',
            )
          }
          if (!recallWarned) {
            recallWarned = true
            ctx.logger?.warn?.(
              `bm-contract: recall failed: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
        if (notice) result = injectAfterLast(result, messages, makeUserMessage(notice))
      }

      return result
    } catch (error) {
      ctx.logger?.warn?.(
        `bm-contract: pre-step injection failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return decision
    }
  })

  ctx.logger?.info?.('bm-contract: loaded (router + contract + recall)')
}
