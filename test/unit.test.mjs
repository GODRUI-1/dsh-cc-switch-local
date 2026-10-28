import assert from 'node:assert/strict'
import test from 'node:test'

import { claudeModelsFromEnv, listenTargetOf, pointsAtLocal } from '../dsh/localroute.js'
import { buildPlanPro, subsetMatches } from '../dsh/plan-pro.js'
import { customModelsOf, customVariants, normalizeCustomProvider } from '../dsh/custom.js'
import { inferModelCapacity } from '../dsh/capacity.js'
import { normalizeEffortLevel, normalizeReasoningLevels, reasoningEffortsMap } from '../dsh/reasoning.js'
import { sanitizeCustomProvider } from '../dsh/state-pro.js'

test('自定义供应商把 openai_chat 归一成 openai-completions', () => {
  const provider = normalizeCustomProvider(
    {
      name: 'My Gateway',
      api: 'openai_chat',
      baseURL: 'https://gateway.example.com/v1/',
      apiKey: 'sk-secret',
      models: 'deepseek-chat, deepseek-reasoner',
    },
    { prefix: 'ccswitchlocal' },
  )
  assert.equal(provider.api, 'openai-completions')
  assert.equal(provider.baseURL, 'https://gateway.example.com/v1')
  assert.deepEqual(provider.models.map((model) => model.id), ['deepseek-chat', 'deepseek-reasoner'])
  assert.equal(provider.apiKey, 'sk-secret')
  assert.match(provider.apiKeyEnv, /^CCSWITCHLOCAL_CUSTOM_.*_API_KEY$/)
})

test('自定义供应商缺端点时不生成路由', () => {
  const provider = normalizeCustomProvider({ name: 'broken', models: 'x' }, { prefix: 'ccswitchlocal' })
  const { variants, skipped } = customVariants([provider], { prefix: 'ccswitchlocal' })
  assert.equal(variants.length, 0)
  assert.equal(skipped.length, 1)
  assert.match(skipped[0].reason, /baseURL/)
})

test('自定义供应商生成 cp 路由与模型对象', () => {
  const provider = normalizeCustomProvider(
    {
      id: 'acme',
      displayName: 'Acme',
      api: 'openai-completions',
      baseURL: 'https://acme.example.com/v1',
      models: [{ id: 'acme-large', contextWindow: 131072, maxTokens: 8192 }],
    },
    { prefix: 'ccswitchlocal' },
  )
  const { variants } = customVariants([provider], { prefix: 'ccswitchlocal' })
  assert.equal(variants.length, 1)
  assert.equal(variants[0].routeKey, 'ccswitchlocal-custom-acme')
  assert.deepEqual(variants[0].profile.models, [{ id: 'acme-large', contextWindow: 131072, maxTokens: 8192 }])
  assert.equal(variants[0].profile.api, 'openai-completions')
})

test('模型输入支持逗号、换行和对象', () => {
  assert.deepEqual(customModelsOf('a, b\nc').map((model) => model.id), ['a', 'b', 'c'])
  assert.deepEqual(customModelsOf([{ id: 'd', name: 'D' }])[0], { id: 'd', name: 'D' })
})

test('子集比较容忍适配器补的默认字段', () => {
  const generated = { displayName: 'x', models: [{ id: 'm' }] }
  const existing = { displayName: 'x', models: [{ id: 'm', input: [], reasoningEfforts: {} }], retryPolicy: { mode: 'normal' } }
  assert.equal(subsetMatches(existing, generated), true)
  assert.equal(subsetMatches({ displayName: 'y' }, generated), false)
})

test('计划：新增路由并保留无 Key 的自定义凭据引用', () => {
  const variants = [
    {
      routeKey: 'ccswitchlocal-custom-acme',
      apiKeyEnv: 'CCSWITCHLOCAL_CUSTOM_ACME_API_KEY',
      apiKey: undefined,
      profile: { displayName: 'Acme', api: 'openai-completions', baseURL: 'https://acme.example.com', apiKeyEnv: 'CCSWITCHLOCAL_CUSTOM_ACME_API_KEY', models: [{ id: 'm' }] },
      source: { appType: 'custom', name: 'Acme', id: 'acme' },
      problems: [],
    },
  ]
  const plan = buildPlanPro({ variants, config: { routePrefix: 'ccswitchlocal' }, currentProviders: {}, manifest: { routes: [], credentials: [] } })
  assert.deepEqual(plan.add, ['ccswitchlocal-custom-acme'])
  assert.deepEqual(plan.managedCredentials, ['CCSWITCHLOCAL_CUSTOM_ACME_API_KEY'])
  assert.equal(plan.credentialWrites.length, 0)
  assert.equal(plan.changed, true)
})

test('计划：清单里消失的自有路由会被回收', () => {
  const plan = buildPlanPro({
    variants: [],
    config: { routePrefix: 'ccswitchlocal', pruneOwnedRoutes: true },
    currentProviders: { 'ccswitchlocal-local-claude': { displayName: 'old' } },
    manifest: { routes: ['ccswitchlocal-local-claude'], credentials: ['CCSWITCHLOCAL_LOCAL_PROXY_API_KEY'] },
    credentialState: { CCSWITCHLOCAL_LOCAL_PROXY_API_KEY: { value: 'PROXY_MANAGED', source: 'store' } },
  })
  assert.deepEqual(plan.remove, ['ccswitchlocal-local-claude'])
  assert.deepEqual(plan.credentialRemovals, ['CCSWITCHLOCAL_LOCAL_PROXY_API_KEY'])
})

test('本地路由监听地址与端口从 proxy_config 读取', () => {
  const target = listenTargetOf([
    { app_type: 'codex', listen_address: '0.0.0.0', listen_port: 15721 },
    { app_type: 'claude', listen_address: '127.0.0.1', listen_port: 18000 },
  ])
  assert.deepEqual(target, { address: '127.0.0.1', rawAddress: '127.0.0.1', port: 18000 })
})

test('本地路由地址判定只认回环与同端口', () => {
  assert.equal(pointsAtLocal('http://127.0.0.1:15721', { address: '127.0.0.1', port: 15721 }), true)
  assert.equal(pointsAtLocal('http://localhost:15721', { address: '127.0.0.1', port: 15721 }), true)
  assert.equal(pointsAtLocal('http://127.0.0.1:15722', { address: '127.0.0.1', port: 15721 }), false)
  assert.equal(pointsAtLocal('https://api.morouter.com', { address: '127.0.0.1', port: 15721 }), false)
})

test('从 Claude 实时配置收集模型，不重复', () => {
  const models = claudeModelsFromEnv({
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8[1M]',
    ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'deepseek-v4.1-flash-1017',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6[1M]',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-opus-4-8[1M]',
  })
  assert.deepEqual(models, [
    { id: 'claude-opus-4-8[1M]', name: 'Opus · deepseek-v4.1-flash-1017' },
    { id: 'claude-sonnet-4-6[1M]' },
  ])
})

test('思考等级归一化并生成 pi-ai 映射', () => {
  assert.deepEqual(normalizeReasoningLevels('low, high, max'), ['low', 'high', 'max'])
  assert.deepEqual(normalizeReasoningLevels(['max', 'off', 'low', 'MAX']), ['low', 'max'])
  assert.deepEqual(normalizeReasoningLevels({ low: 'low', high: 'high', xhigh: null }), ['low', 'high'])
  assert.deepEqual(normalizeReasoningLevels(''), [])
  assert.deepEqual(reasoningEffortsMap(['low', 'high', 'max']), {
    off: null,
    low: 'low',
    high: 'high',
    max: 'max',
  })
  assert.equal(reasoningEffortsMap([]), undefined)
  assert.equal(normalizeEffortLevel('MAX'), 'max')
  assert.equal(normalizeEffortLevel('bogus'), undefined)
})

test('自定义供应商的思考等级落到每个模型上', () => {
  const provider = normalizeCustomProvider(
    {
      id: 'acme',
      displayName: 'Acme',
      api: 'openai-completions',
      baseURL: 'https://acme.example.com/v1',
      models: 'm1, m2',
      reasoningEfforts: 'low,high,max',
    },
    { prefix: 'ccswitchlocal' },
  )
  const { variants } = customVariants([provider], { prefix: 'ccswitchlocal' })
  assert.deepEqual(variants[0].profile.models.map((model) => model.reasoningEfforts), [
    { off: null, low: 'low', high: 'high', max: 'max' },
    { off: null, low: 'low', high: 'high', max: 'max' },
  ])
})

test('[1M] 模型推断出 1M 上下文，显式声明优先', () => {
  assert.deepEqual(inferModelCapacity('deepseek-v4.1-flash-1017[1M]'), { contextWindow: 1_000_000, maxTokens: 65_536 })
  assert.deepEqual(inferModelCapacity('claude-opus-4-8[1M]'), { contextWindow: 1_000_000, maxTokens: 65_536 })
  assert.deepEqual(inferModelCapacity('claude-haiku-4-5'), { contextWindow: 200_000, maxTokens: 32_768 })
  assert.equal(inferModelCapacity('custom-model'), undefined)
})

test('状态清单永不含明文 Key', () => {
  const entry = sanitizeCustomProvider({
    id: 'acme',
    displayName: 'Acme',
    api: 'openai-completions',
    baseURL: 'https://acme.example.com',
    apiKey: 'sk-secret',
    models: [{ id: 'm' }],
  })
  assert.equal(Object.hasOwn(entry, 'apiKey'), false)
  assert.equal(JSON.stringify(entry).includes('sk-secret'), false)
})
