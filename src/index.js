import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'bm-contract'
export const inject = ['systemPrompt']

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

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next()
    try {
      if (decision.kind !== 'enter' || signal?.aborted) return decision
      const session = agent?.session
      if (!session || !Array.isArray(messages) || !Array.isArray(decision.messages)) return decision
      const lastUser = [...messages].reverse().find(message => message?.role === 'user')
      if (!lastUser?.id) return decision
      if (seen.get(session) === lastUser.id) return decision
      if (!matches(textOf(lastUser))) return decision
      seen.set(session, lastUser.id)
      const notice = makeUserMessage(`[BM contract]\n${contractText()}`)
      const at = decision.messages.findLastIndex(message => messages.includes(message))
      return {
        ...decision,
        messages: at >= 0
          ? decision.messages.toSpliced(at + 1, 0, notice)
          : [...decision.messages, notice],
      }
    } catch (error) {
      ctx.logger?.warn?.(
        `bm-contract: pre-step injection failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return decision
    }
  })

  ctx.logger?.info?.('bm-contract: loaded (router section + conditional contract injection)')
}
