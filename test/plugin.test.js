import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../src/index.js'

const userMessage = (id, text) => ({ id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })

function harness(search, config) {
  const registered = { skills: [], contexts: [], calls: [], hooks: {} }
  const ctx = {
    logger: { info() {}, warn() {} },
    inject(deps, callback) { callback(ctx) },
    systemPrompt: { context(definition) { registered.contexts.push(definition) } },
    skills: { register(definition) { registered.skills.push(definition) } },
    tools: {
      async execute(call) {
        registered.calls.push(call)
        return search(call, registered.calls.length)
      },
    },
    on(event, handler) { registered.hooks[event] = handler },
  }
  apply(ctx, config)
  const step = async (agent, messages) =>
    registered.hooks['agent/pre-step']({ agent, messages, signal: undefined }, async () => ({ kind: 'enter' }))
  return { ctx, registered, step }
}

const block = { agent: {} }

const hit = (over = {}) => ({
  title: 'Gmail MCP 凭据配置',
  permalink: 'main/reference/computer/gmail-mcp-config',
  score: 0.86,
  content: 'OAuth 客户端须建 Desktop 类型。',
  ...over,
})

test('registers the manual skill and the recall context', () => {
  const { registered } = harness(() => ({ value: [] }))
  assert.equal(registered.skills.length, 1)
  const skill = registered.skills[0]
  assert.equal(skill.name, 'dsh-bm-contract-notes')
  assert.deepEqual(skill.invocation, { modelInvocable: false, userInvocable: true })
  assert.ok(skill.description.length > 0 && skill.description.length <= 500)
  assert.ok(skill.content.includes('# Basic Memory 知识库笔记规范'))
  assert.ok(!skill.content.includes('name: dsh-bm-contract-notes'))
  assert.equal(registered.contexts.length, 1)
  assert.equal(registered.contexts[0].name, 'bm:recall')
  assert.equal(registered.contexts[0].text({ agent: block.agent }), '')
})

test('a human turn searches and exposes the block to the context', async () => {
  const { registered, step } = harness(() => ({ value: { structuredContent: { result: { results: [hit()] } } } }))
  const agent = { id: 'session-1' }
  await step(agent, [userMessage('m1', 'Gmail MCP 凭据怎么配')])
  assert.equal(registered.calls.length, 1)
  assert.equal(registered.calls[0].name, 'mcp__basic-memory__search_notes')
  assert.deepEqual(registered.calls[0].arguments, {
    query: 'Gmail MCP 凭据怎么配',
    search_type: 'vector',
    min_similarity: 0.2,
    page_size: 5,
    output_format: 'json',
  })
  const text = registered.contexts[0].text({ agent })
  assert.match(text, /^## 知识库相关笔记（1 条，按相似度排序）/)
  assert.match(text, /\[0\.86 必读\]/)
})

test('an explicit project is forwarded to the search tool', async () => {
  const { registered, step } = harness(() => ({ value: [] }), { project: 'kb', searchType: 'hybrid' })
  await step({ id: 's' }, [userMessage('m', '随便问问配置')])
  assert.equal(registered.calls[0].arguments.project, 'kb')
  assert.equal(registered.calls[0].arguments.search_type, 'hybrid')
})

test('a session never shows the same note twice', async () => {
  const { registered, step } = harness(() => ({ value: [hit()] }))
  const agent = { id: 'session-2' }
  await step(agent, [userMessage('m1', 'Gmail MCP 凭据怎么配')])
  assert.notEqual(registered.contexts[0].text({ agent }), '')
  await step(agent, [userMessage('m2', '再讲讲 Gmail MCP 凭据')])
  assert.equal(registered.calls.length, 2)
  assert.equal(registered.contexts[0].text({ agent }), '')
})

test('the same message id is searched once', async () => {
  const { registered, step } = harness(() => ({ value: [hit()] }))
  const agent = { id: 'session-3' }
  await step(agent, [userMessage('m1', 'Gmail MCP 凭据怎么配')])
  await step(agent, [userMessage('m1', 'Gmail MCP 凭据怎么配')])
  assert.equal(registered.calls.length, 1)
})

test('non-human messages and trivial prompts never search', async () => {
  const { registered, step } = harness(() => ({ value: [hit()] }))
  const agent = { id: 'session-4' }
  await step(agent, [{ ...userMessage('m1', 'Gmail MCP 凭据怎么配'), source: { kind: 'runtime-context' } }])
  await step(agent, [userMessage('m2', '嗯')])
  assert.equal(registered.calls.length, 0)
})

test('repeated failures disable recall for that session', async () => {
  const { ctx, registered, step } = harness(() => ({ isError: true, error: { message: 'down' } }))
  const agent = { id: 'session-5' }
  for (const id of ['m1', 'm2', 'm3', 'm4']) {
    await step(agent, [userMessage(id, `Gmail MCP 凭据怎么配 ${id}`)])
  }
  assert.equal(registered.calls.length, 3)
  assert.equal(registered.contexts[0].text({ agent }), '')
})

test('a failed search keeps the previous block', async () => {
  let fail = false
  const { registered, step } = harness(() => (fail ? { isError: true, error: { message: 'down' } } : { value: [hit()] }))
  const agent = { id: 'session-6' }
  await step(agent, [userMessage('m1', 'Gmail MCP 凭据怎么配')])
  const first = registered.contexts[0].text({ agent })
  fail = true
  await step(agent, [userMessage('m2', '换个问题')])
  assert.equal(registered.contexts[0].text({ agent }), first)
})
