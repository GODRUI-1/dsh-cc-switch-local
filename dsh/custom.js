/**
 * 「自定义供应商」：完全由用户声明，不依赖 cc-switch。
 *
 * 一条声明可以是配置文件里的（cordis.patch.yml -> customProviders），也可以是
 * 通过 Web 面板保存的（落在状态清单里）。两种来源合并后转成与 convertRecord
 * 同构的路由变体，再交给同步计划统一处理。
 *
 * 密钥永远不落清单：配置文件里的 apiKey 只在同步时写进 harness 凭据存储；
 * 面板保存的 Key 也在保存时直接写入凭据，清单里只留 apiKeyEnv 引用。
 */

import { envRefFor, slugify, shortHash, toModel } from './convert.js'
import { normalizeReasoningLevels, reasoningEffortsMap } from './reasoning.js'

/** 允许的 API 协议（与当前 DSH pi-ai 适配器一致）。 */
export const CUSTOM_APIS = ['openai-completions', 'openai-responses', 'anthropic-messages']

const DEFAULT_API = 'openai-completions'

/** 安全字符串。 */
function str(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** 去掉 baseURL 末尾斜杠。 */
function cleanBaseUrl(value) {
  const text = str(value)
  if (text === undefined) return undefined
  return text.replace(/\/+$/g, '')
}

/** 协议归一化；只接受当前 pi-ai 支持的三种。 */
export function normalizeCustomApi(value) {
  const text = String(value ?? '').toLowerCase().trim()
  if (text === '') return DEFAULT_API
  if (text.includes('anthropic')) return 'anthropic-messages'
  if (text.includes('response')) return 'openai-responses'
  if (text.includes('completion') || text.includes('chat') || text === 'openai') return 'openai-completions'
  return undefined
}

/** 自定义供应商的稳定 id。 */
export function customIdOf(provider) {
  const explicit = slugify(provider?.id ?? '', 32)
  if (explicit !== '') return explicit
  const fromName = slugify(provider?.displayName ?? provider?.name ?? '', 32)
  if (fromName !== '') return fromName
  return `custom-${shortHash(`${provider?.baseURL ?? ''}|${provider?.displayName ?? ''}`)}`
}

/** 自定义供应商的凭据引用名。 */
export function customEnvRef(prefix, id) {
  return envRefFor({ appType: 'custom', id, name: id }, prefix, '')
}

/** 模型清单归一：接受字符串、"id:name" 或对象。 */
export function customModelsOf(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,，;；]+/) : []
  const out = []
  const seen = new Set()
  for (const entry of list) {
    const model = typeof entry === 'string' ? toModel(entry) : toModel(entry)
    if (model === undefined) continue
    if (seen.has(model.id)) continue
    seen.add(model.id)
    out.push(model)
  }
  return out
}

/**
 * 归一化一条自定义供应商声明（不校验可用性，只整理字段）。
 * 返回的对象可以安全地落在状态清单里（不含 apiKey）。
 */
export function normalizeCustomProvider(raw, { prefix = 'ccswitchlocal' } = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const id = customIdOf(raw)
  const displayName = str(raw.displayName, raw.name) ?? id
  const api = normalizeCustomApi(raw.api ?? raw.apiFormat ?? raw.api_format)
  const baseURL = cleanBaseUrl(raw.baseURL ?? raw.baseUrl ?? raw.base_url ?? raw.url)
  const apiKeyEnv = str(raw.apiKeyEnv) ?? customEnvRef(prefix, id)
  const models = customModelsOf(raw.models ?? raw.model)
  const headers = raw.headers !== null && typeof raw.headers === 'object' && !Array.isArray(raw.headers)
    ? Object.fromEntries(Object.entries(raw.headers).filter(([key, value]) => typeof key === 'string' && key !== '' && typeof value === 'string'))
    : undefined
  const enabled = raw.enabled !== false
  return {
    id,
    displayName,
    api,
    baseURL,
    apiKeyEnv,
    models,
    headers,
    enabled,
    notes: str(raw.notes),
    reasoningEfforts: normalizeReasoningLevels(raw.reasoningEfforts ?? raw.reasoning ?? raw.thinkingLevels),
    // 仅内存字段：同步时写入凭据，绝不落清单
    apiKey: str(raw.apiKey),
  }
}

/** 合并配置文件来源与面板来源：同 id 时面板来源优先。 */
export function mergeCustomProviders(configProviders = [], stateProviders = [], { prefix } = {}) {
  const merged = new Map()
  for (const raw of Array.isArray(configProviders) ? configProviders : []) {
    const provider = normalizeCustomProvider(raw, { prefix })
    if (provider !== undefined) merged.set(provider.id, provider)
  }
  for (const raw of Array.isArray(stateProviders) ? stateProviders : []) {
    const provider = normalizeCustomProvider(raw, { prefix })
    if (provider !== undefined) merged.set(provider.id, provider)
  }
  return [...merged.values()]
}

/**
 * 自定义供应商 -> 路由变体。
 * @returns `{ variants: [], skipped: [] }`
 */
export function customVariants(providers = [], { prefix = 'ccswitchlocal' } = {}) {
  const variants = []
  const skipped = []
  for (const provider of providers) {
    if (provider.enabled === false) {
      skipped.push({ appType: 'custom', name: provider.displayName, reason: '已停用' })
      continue
    }
    const problems = []
    if (provider.api === undefined) {
      problems.push('API 协议不支持：当前 DSH 只支持 openai-completions / openai-responses / anthropic-messages')
    }
    if (provider.baseURL === undefined) {
      problems.push('缺少 baseURL（必须是以 http:// 或 https:// 开头的端点）')
    } else if (!/^https?:\/\//i.test(provider.baseURL)) {
      problems.push('baseURL 必须以 http:// 或 https:// 开头')
    }
    if (provider.models.length === 0) problems.push('至少声明一个模型 id')
    if (problems.length > 0) {
      skipped.push({ appType: 'custom', name: provider.displayName, reason: problems.join('；') })
      continue
    }
    const routeKey = `${prefix}-custom-${provider.id}`
    const efforts = reasoningEffortsMap(provider.reasoningEfforts)
    const models = efforts === undefined
      ? provider.models
      : provider.models.map((model) => ({ ...model, reasoningEfforts: { ...efforts } }))
    const profile = {
      displayName: provider.displayName,
      api: provider.api,
      baseURL: provider.baseURL,
      apiKeyEnv: provider.apiKeyEnv,
      models,
    }
    if (provider.headers !== undefined && Object.keys(provider.headers).length > 0) profile.headers = provider.headers
    variants.push({
      routeKey,
      apiKeyEnv: provider.apiKeyEnv,
      apiKey: provider.apiKey,
      protocol: provider.api,
      baseURL: provider.baseURL,
      models: provider.models,
      displayName: provider.displayName,
      headers: provider.headers,
      profile,
      problems: [],
      notes: [],
      source: {
        appType: 'custom',
        name: provider.displayName,
        id: provider.id,
        kind: 'custom',
        protocol: provider.api,
        baseURL: provider.baseURL,
      },
    })
  }
  return { variants, skipped }
}
