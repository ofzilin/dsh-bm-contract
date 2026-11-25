import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  formatRecall,
  isAgentNotice,
  isTrivial,
  pickHits,
  readSearchResults,
  stripHarnessSuffix,
} from './recall.js'

export const name = 'bm-contract'
export const inject = ['systemPrompt', 'tools']

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_FILE = resolve(PACKAGE_ROOT, 'skills/dsh-bm-contract-notes/SKILL.md')
const SKILL_NAME = 'dsh-bm-contract-notes'
const DEFAULT_TOOL = 'mcp__basic-memory__bm_search'
const MAX_QUERY_CHARS = 400
const MAX_FAILURES = 3

function textOf(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

/** Read the bundled SKILL.md; the frontmatter is metadata, the body is the content. */
function readSkill() {
  const raw = readFileSync(SKILL_FILE, 'utf8').replace(/^\uFEFF/, '')
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  const meta = {}
  if (front) {
    for (const line of front[1].split(/\r?\n/)) {
      const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
      if (pair) meta[pair[1]] = pair[2].trim()
    }
  }
  return {
    name: meta.name || SKILL_NAME,
    description: meta.description || '',
    content: (front ? raw.slice(front[0].length) : raw).trim(),
  }
}

export function apply(ctx, config = {}) {
  const settings = {
    project: typeof config.project === 'string' && config.project.trim()
      ? config.project.trim()
      : 'main',
    toolName: typeof config.toolName === 'string' && config.toolName.trim()
      ? config.toolName.trim()
      : DEFAULT_TOOL,
    mode: typeof config.mode === 'string' && config.mode.trim()
      ? config.mode.trim()
      : 'hybrid',
    minSimilarity: Number.isFinite(config.minSimilarity) ? config.minSimilarity : 0.2,
    topK: Number.isFinite(config.topK) && config.topK > 0 ? Math.floor(config.topK) : 5,
  }

  // Writing rules ship with the plugin and are reachable only through the
  // user's `/dsh-bm-contract-notes` gesture: modelInvocable hides them from the
  // catalog, so nothing is injected into a session until it is asked for.
  try {
    const skill = readSkill()
    ctx.inject(['skills'], scope => {
      scope.skills.register({
        name: skill.name,
        description: skill.description,
        content: skill.content,
        source: 'runtime',
        invocation: { modelInvocable: false, userInvocable: true },
      })
    })
  } catch (error) {
    ctx.logger?.warn?.(
      `bm-contract: cannot load ${SKILL_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  /** Per-agent recall state: dedupe, failure streak, and the current block. */
  const agents = new WeakMap()
  const stateOf = agent => {
    let state = agents.get(agent)
    if (!state) {
      state = { handled: '', seen: new Set(), failures: 0, disabled: false, block: '' }
      agents.set(agent, state)
    }
    return state
  }

  // The context is read at assembly and re-resolved after this hook runs, so
  // writing `block` here lands in the current step (dsh-agent-loop/agent.ts:452-456).
  ctx.systemPrompt.context({
    name: 'bm:recall',
    order: 4000,
    interpolate: false,
    required: false,
    text: context => {
      const agent = context?.agent
      return agent ? (agents.get(agent)?.block ?? '') : ''
    },
  })

  const search = async (agent, signal, query) => {
    const result = await ctx.tools.execute({
      callId: `bm-recall:${randomUUID()}`,
      name: settings.toolName,
      arguments: {
        project: settings.project,
        query,
        mode: settings.mode,
        min_similarity: settings.minSimilarity,
        page_size: settings.topK,
        output_format: 'json',
      },
      agent,
      signal: signal ?? new AbortController().signal,
    })
    if (result?.isError) {
      const reason = result.error?.message ?? result.error?.code ?? 'bm_search failed'
      throw new Error(reason)
    }
    return readSearchResults(result)
  }

  const recall = async (agent, signal, text) => {
    if (typeof ctx.tools?.execute !== 'function') return ''
    const query = text.slice(0, MAX_QUERY_CHARS).trim()
    if (!query) return ''
    const state = stateOf(agent)
    if (state.disabled) return ''
    try {
      const items = await search(agent, signal, query)
      state.failures = 0
      const hits = pickHits(items, state.seen)
      return hits.length > 0 ? formatRecall(hits) : ''
    } catch (error) {
      state.failures += 1
      if (state.failures >= MAX_FAILURES) state.disabled = true
      ctx.logger?.warn?.(
        `bm-contract: recall failed (${state.failures}/${MAX_FAILURES}): ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next()
    try {
      if (decision.kind !== 'enter' || signal?.aborted) return decision
      if (!agent || !Array.isArray(messages)) return decision
      const lastUser = [...messages].reverse().find(message => message?.role === 'user')
      if (!lastUser?.id) return decision
      // Human turns carry source.kind === 'user'; injected context, runtime
      // snapshots, and agent relays carry other kinds.
      if (lastUser.source && lastUser.source.kind !== 'user') return decision

      const state = stateOf(agent)
      if (state.handled === lastUser.id) return decision
      state.handled = lastUser.id

      const text = stripHarnessSuffix(textOf(lastUser))
      if (!text || isTrivial(text) || isAgentNotice(text)) return decision

      const block = await recall(agent, signal, text)
      if (block !== null) state.block = block
      return decision
    } catch (error) {
      ctx.logger?.warn?.(
        `bm-contract: pre-step recall failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return decision
    }
  })

  ctx.logger?.info?.('bm-contract: loaded (recall context + /dsh-bm-contract-notes skill)')
}
