import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildVocabulary,
  formatRecall,
  isAgentNotice,
  isTrivial,
  readSearchResults,
  segment,
} from '../src/recall.js'
import { apply } from '../src/index.js'

const vocabulary = {
  terms: new Map([
    ['插件', { df: 2, weight: 3 }],
    ['生效', { df: 1, weight: 3 }],
    ['重启', { df: 1, weight: 2 }],
    ['件生', { df: 1, weight: 2 }],
    ['dsh', { df: 2, weight: 3 }],
  ]),
}

test('segment keeps non-overlapping high-signal terms', () => {
  const terms = segment('插件装了没生效，需要重启吗', vocabulary)
  assert.deepEqual(terms, ['插件', '生效', '重启'])
})

test('segment keeps latin identifiers and CJK terms together', () => {
  const terms = segment('dsh 插件 没生效', vocabulary)
  assert.ok(terms.includes('dsh'))
  assert.ok(terms.includes('插件'))
  assert.ok(terms.includes('生效'))
})

test('segment falls back to run edges when nothing is known', () => {
  const terms = segment('量子纠缠与退相干', { terms: new Map() })
  assert.ok(terms.length > 0)
  assert.ok(terms.every(term => term.length >= 2))
})

test('segment drops UUIDs and dotted config keys', () => {
  const terms = segment(
    'Agent 516102d8-653d-4694-82e2-8d569ae140fa config.vaultPath 插件没生效',
    vocabulary,
  )
  assert.ok(terms.includes('插件'))
  assert.ok(!terms.some(term => term.includes('516102d8')))
  assert.ok(!terms.some(term => term.includes('config')))
})

test('segment keeps package-style identifiers', () => {
  const terms = segment('dsh-bm-contract 安装失败', vocabulary)
  assert.ok(terms.includes('dsh-bm-contract'))
})

test('isAgentNotice ignores agent-to-agent notifications', () => {
  assert.equal(
    isAgentNotice('Agent 516102d8-653d-4694-82e2-8d569ae140fa sent a message: hi'),
    true,
  )
  assert.equal(isAgentNotice('插件装了没生效'), false)
})

test('isTrivial skips acknowledgements and very short messages', () => {
  for (const text of ['继续', '好的', '嗯', 'ok', '谢谢', '?']) {
    assert.equal(isTrivial(text), true, text)
  }
  assert.equal(isTrivial('插件装了没生效'), false)
})

test('formatRecall renders a compact pointer with the conclusion', () => {
  const text = formatRecall([
    {
      title: 'DSH 插件生效时机：安装、重装与刷新',
      permalink: 'main/reference/computer/dsh-plugin-takeover-timing',
      content: '# 标题\n\n> 记录日期：2026-11-10\n> 结论：装完即时生效，不需要重启。\n',
    },
  ])
  assert.match(text, /^\[BM recall\]/)
  assert.match(text, /1\. DSH 插件生效时机/)
  assert.match(text, /main\/reference\/computer\/dsh-plugin-takeover-timing/)
  assert.match(text, /结论/)
  assert.doesNotMatch(text, /记录日期/)
  assert.match(text, /bm_read/)
})

test('readSearchResults accepts value, nested value, and JSON text', () => {
  const hit = { title: 'T', permalink: 'main/t', score: 1 }
  assert.deepEqual(readSearchResults({ isError: false, value: { results: [hit] } }), [hit])
  assert.deepEqual(readSearchResults({ isError: false, value: { data: { results: [hit] } } }), [hit])
  assert.deepEqual(
    readSearchResults({ isError: false, content: [{ type: 'text', text: JSON.stringify({ results: [hit] }) }] }),
    [hit],
  )
  assert.deepEqual(readSearchResults({ isError: true, content: [] }), [])
})

test('buildVocabulary reads frontmatter, headings, and conclusions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-recall-'))
  try {
    writeFileSync(
      join(dir, 'a.md'),
      '---\ntitle: DSH 插件生效时机\ntags:\n- computer/dsh\n---\n# 标题\n> 结论：不需要重启服务\n',
    )
    writeFileSync(join(dir, 'b.md'), '---\ntitle: Blender MCP 选型\n---\n# 对比\n')
    const built = buildVocabulary(dir)
    assert.equal(built.files, 2)
    assert.ok(built.terms.has('插件'))
    assert.ok(built.terms.has('生效'))
    assert.ok(built.terms.has('重启'))
    assert.equal(built.terms.get('插件').weight, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pre-step injects one recall notice per user message', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-recall-apply-'))
  try {
    writeFileSync(
      join(dir, 'a.md'),
      '---\ntitle: DSH 插件生效时机\n---\n> 结论：不需要重启。\n',
    )

    const calls = []
    let handler
    const ctx = {
      logger: { info() {}, warn() {} },
      systemPrompt: { section() {} },
      inject() {},
      on(event, fn) {
        if (event === 'agent/pre-step') handler = fn
      },
      tools: {
        async execute(exec) {
          calls.push(exec)
          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  results: [
                    {
                      title: 'DSH 插件生效时机',
                      permalink: 'main/a',
                      score: 1.2,
                      content: '> 结论：不需要重启。',
                    },
                  ],
                }),
              },
            ],
          }
        },
      },
    }

    apply(ctx, { vaultPath: dir, recall: { minScore: 0.5, ledger: false } })
    assert.equal(typeof handler, 'function')

    const session = {}
    const messages = [
      { id: 'u1', role: 'user', content: [{ type: 'text', text: '插件装了没生效 需要重启吗' }] },
    ]
    const decision = { kind: 'enter', messages: [...messages] }
    const run = () => handler({ agent: { session }, messages, signal: {} }, async () => decision)

    const first = await run()
    assert.equal(first.messages.length, 2)
    assert.match(first.messages[1].content[0].text, /^\[BM recall\]/)
    assert.match(first.messages[1].content[0].text, /main\/a/)
    assert.equal(calls.length, 1)
    assert.match(calls[0].arguments.query, /插件|生效/)
    assert.equal(calls[0].arguments.output_format, 'json')

    const second = await run()
    assert.equal(second.messages.length, 1)
    assert.equal(calls.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('recall fails open when bm_search errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-recall-error-'))
  try {
    writeFileSync(join(dir, 'a.md'), '---\ntitle: DSH 插件生效时机\n---\n> 结论：不需要重启。\n')

    let handler
    const ctx = {
      logger: { info() {}, warn() {} },
      systemPrompt: { section() {} },
      inject() {},
      on(event, fn) {
        if (event === 'agent/pre-step') handler = fn
      },
      tools: {
        async execute() {
          return { isError: true, error: { message: 'UNKNOWN_TOOL' }, content: [] }
        },
      },
    }

    apply(ctx, { vaultPath: dir, recall: { ledger: false } })
    const messages = [
      { id: 'u2', role: 'user', content: [{ type: 'text', text: '插件装了没生效 需要重启吗' }] },
    ]
    const decision = { kind: 'enter', messages: [...messages] }
    const result = await handler(
      { agent: { session: {} }, messages, signal: {} },
      async () => decision,
    )
    assert.equal(result.messages.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pre-step ignores sourced (non-human) messages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-recall-source-'))
  try {
    writeFileSync(join(dir, 'a.md'), '---\ntitle: DSH 插件生效时机\n---\n> 结论：不需要重启。\n')

    let handler
    let calls = 0
    const ctx = {
      logger: { info() {}, warn() {} },
      systemPrompt: { section() {} },
      inject() {},
      on(event, fn) {
        if (event === 'agent/pre-step') handler = fn
      },
      tools: {
        async execute() {
          calls += 1
          return { isError: false, content: [] }
        },
      },
    }

    apply(ctx, { vaultPath: dir, recall: { ledger: false } })
    const messages = [
      {
        id: 'u4',
        role: 'user',
        source: { kind: 'agent-message' },
        content: [{ type: 'text', text: '插件装了没生效 需要重启吗' }],
      },
    ]
    const decision = { kind: 'enter', messages: [...messages] }
    const result = await handler(
      { agent: { session: {} }, messages, signal: {} },
      async () => decision,
    )
    assert.equal(result.messages.length, 1)
    assert.equal(calls, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
