import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_CHARS,
  MIN_SCORE,
  formatRecall,
  isAgentNotice,
  isTrivial,
  normalizeRecallId,
  pickHits,
  readSearchResults,
  stripHarnessSuffix,
} from '../src/recall.js'

const hit = (over = {}) => ({
  title: 'Gmail MCP 凭据配置',
  permalink: 'main/reference/computer/gmail-mcp-config',
  score: 0.86,
  content: 'OAuth 客户端须建 Desktop 类型，redirect URI 固定为 http://localhost:8765/oauth/callback。',
  ...over,
})

const SECOND = hit({
  title: 'Basic Memory 部署',
  permalink: 'main/projects/basic-memory/deploy',
  score: 0.66,
  content: 'systemd unit 用 uv run 启动，端口 8765。',
})

test('formatRecall renders the injected block', () => {
  assert.equal(
    formatRecall([hit(), SECOND]),
    [
      '## 知识库相关笔记（2 条，按相似度排序）',
      '',
      '1. **Gmail MCP 凭据配置** — `main/reference/computer/gmail-mcp-config` [0.86 必读]',
      '   OAuth 客户端须建 Desktop 类型，redirect URI 固定为 http://localhost:8765/oauth/callback。',
      '',
      '2. **Basic Memory 部署** — `main/projects/basic-memory/deploy` [0.66 参考]',
      '   systemd unit 用 uv run 启动，端口 8765。',
      '',
      '必读 = 先用 bm_read 读全文再回答；参考 = 摘要够用就别读；不要复述本块。',
    ].join('\n'),
  )
})

test('only a top hit at or above the read score is 必读', () => {
  assert.match(formatRecall([hit({ score: 0.79 })]), /\[0\.79 参考\]/)
  assert.match(formatRecall([hit({ score: 0.8 })]), /\[0\.80 必读\]/)
  assert.match(formatRecall([hit({ score: 0.9 }), SECOND]), /\n2\. .*\[0\.66 参考\]/)
})

test('a hit without content keeps only the pointer line', () => {
  const text = formatRecall([hit({ content: '' })])
  assert.equal(text.split('\n').filter(line => line.startsWith('1. ')).length, 1)
  assert.ok(!text.includes('\n   '))
})

test('markdown in the note title cannot break the layout', () => {
  const text = formatRecall([hit({ title: 'a **bold** `code` [x] #tag', content: '' })])
  assert.match(text, /1\. \*\*a bold code x tag\*\*/)
})

test('empty input produces no block at all', () => {
  assert.equal(formatRecall([]), '')
  assert.equal(formatRecall(undefined), '')
})

test('the block never exceeds the character budget', () => {
  const long = (n, ch) => ch.repeat(n)
  const items = [
    hit({ title: long(300, '标'), permalink: `main/${long(300, 'p')}`, content: long(400, '长') }),
    hit({ title: long(300, '题'), permalink: `main/${long(300, 'q')}`, content: long(400, '文') }),
  ]
  const text = formatRecall(items)
  assert.ok(text.length <= MAX_CHARS, `got ${text.length} chars`)
  assert.match(text, /^## 知识库相关笔记（1 条，按相似度排序）/)
})

test('long conclusions are truncated with an ellipsis', () => {
  const text = formatRecall([hit({ content: '结'.repeat(300) })])
  const line = text.split('\n').find(item => item.startsWith('   '))
  assert.ok(line.length <= 104, `got ${line.length}`)
  assert.ok(line.endsWith('…'))
})

test('pickHits drops weak, duplicate, and empty hits', () => {
  const seen = new Set()
  const items = [
    hit({ score: 0.4 }),
    { ...SECOND, score: 0.7 },
    { ...SECOND, score: 0.65 },
    { title: '', permalink: '', score: 0.9 },
    { ...SECOND, permalink: 'main/other/note', score: 0.6 },
  ]
  assert.equal(MIN_SCORE, 0.5)
  assert.deepEqual(
    pickHits(items, seen).map(item => item.permalink),
    ['main/projects/basic-memory/deploy', 'main/other/note'],
  )
  assert.equal(seen.size, 2)
  assert.equal(pickHits(items, seen).length, 0)
})

test('pickHits keeps the strongest hit when over the item cap', () => {
  const items = [hit({ score: 0.6 }), hit({ score: 0.9, permalink: 'main/best' }), hit({ score: 0.7, permalink: 'main/mid' })]
  assert.deepEqual(pickHits(items, new Set()).map(item => item.permalink), ['main/best', 'main/mid'])
})

test('normalizeRecallId makes permalinks, paths, and names collide', () => {
  assert.equal(normalizeRecallId('main/reference/a'), 'reference/a')
  assert.equal(normalizeRecallId('reference\\a.md'), 'reference/a')
  assert.equal(normalizeRecallId('  '), '')
})

test('human-message filters keep agent noise out of recall', () => {
  assert.equal(isTrivial('嗯'), true)
  assert.equal(isTrivial('这个怎么配置'), false)
  assert.equal(isAgentNotice('Background agent dsh-api-scout finished and will do no further work'), true)
  assert.equal(stripHarnessSuffix('写个总结 Your parent agent id is lead'), '写个总结')
})

test('readSearchResults accepts every MCP result shape', () => {
  assert.deepEqual(readSearchResults({ value: [{ title: 'a' }] }), [{ title: 'a' }])
  assert.deepEqual(readSearchResults({ value: { results: [{ title: 'b' }] } }), [{ title: 'b' }])
  assert.deepEqual(readSearchResults({ content: [{ type: 'text', text: '{"results":[{"title":"c"}]}' }] }), [{ title: 'c' }])
  assert.deepEqual(readSearchResults({ isError: true }), [])
})
