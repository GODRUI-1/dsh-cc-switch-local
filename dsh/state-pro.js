/**
 * dsh-cc-switch-local 的状态清单。
 *
 * 记录三件事：
 *   1. 上一次同步写进 llm-pi-ai 的路由键与凭据引用（撤销只清自己写过的）；
 *   2. Web 面板保存的自定义供应商（**不含 Key**，Key 只在凭据存储里）；
 *   3. 用户选的路由模式（本地路由 / 直连上游）。
 *
 * 清单只是派生状态：删掉它不会损坏任何配置，只会让「撤销」变成保守模式。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { normalizeReasoningLevels } from './reasoning.js'

/** 默认清单路径：`$DSH_HOME/cc-switch-local-state.json`。 */
export function statePathFor({ statePath = '', home = homedir(), env = process.env } = {}) {
  if (typeof statePath === 'string' && statePath.trim() !== '') return statePath.trim()
  const dshHome = env.DSH_HOME && env.DSH_HOME.trim() !== '' ? env.DSH_HOME.trim() : path.join(home, '.dsh')
  return path.join(dshHome, 'cc-switch-local-state.json')
}

const EMPTY = {
  version: 1,
  routes: [],
  credentials: [],
  customProviders: [],
  localReasoningEfforts: [],
  mode: {},
  updatedAt: null,
  source: null,
}

/** 只保留能被同步层安全消费的自定义供应商字段。 */
export function sanitizeCustomProvider(provider) {
  if (provider === null || typeof provider !== 'object' || Array.isArray(provider)) return undefined
  const out = {
    id: String(provider.id ?? ''),
    displayName: String(provider.displayName ?? provider.name ?? provider.id ?? ''),
    api: String(provider.api ?? 'openai-completions'),
    baseURL: String(provider.baseURL ?? ''),
    apiKeyEnv: String(provider.apiKeyEnv ?? ''),
    models: Array.isArray(provider.models)
      ? provider.models.map((model) => {
          if (typeof model === 'string') return { id: model }
          if (model === null || typeof model !== 'object') return undefined
          const clean = { id: String(model.id ?? '') }
          if (typeof model.name === 'string' && model.name !== '') clean.name = model.name
          if (Number.isFinite(Number(model.contextWindow))) clean.contextWindow = Math.floor(Number(model.contextWindow))
          if (Number.isFinite(Number(model.maxTokens))) clean.maxTokens = Math.floor(Number(model.maxTokens))
          if (Array.isArray(model.input)) clean.input = model.input.filter((item) => item === 'text' || item === 'image')
          return clean
        }).filter((model) => model !== undefined && model.id !== '')
      : [],
    enabled: provider.enabled !== false,
  }
  if (provider.headers !== null && typeof provider.headers === 'object' && !Array.isArray(provider.headers)) {
    out.headers = Object.fromEntries(
      Object.entries(provider.headers).filter(([key, value]) => typeof key === 'string' && key !== '' && typeof value === 'string'),
    )
  }
  if (typeof provider.notes === 'string' && provider.notes !== '') out.notes = provider.notes
  const reasoningEfforts = normalizeReasoningLevels(provider.reasoningEfforts ?? provider.reasoning)
  if (reasoningEfforts.length > 0) out.reasoningEfforts = reasoningEfforts
  return out
}

/** 读取清单；不存在或损坏时返回空清单。 */
export function readStatePro(file) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // 从 dsh-cc-switch-pro 改名过来时，新清单还不存在：读旧清单，
    // 让旧路由/旧凭据进入 manifest，下一次同步会把它们清理掉。
    try {
      parsed = JSON.parse(readFileSync(path.join(path.dirname(file), 'cc-switch-pro-state.json'), 'utf8'))
    } catch {
      return { ...EMPTY, customProviders: [], localReasoningEfforts: [], mode: {} }
    }
  }
  const mode = parsed?.mode !== null && typeof parsed?.mode === 'object' ? parsed.mode : {}
  return {
    version: 1,
    routes: Array.isArray(parsed?.routes) ? parsed.routes.filter((key) => typeof key === 'string') : [],
    credentials: Array.isArray(parsed?.credentials) ? parsed.credentials.filter((ref) => typeof ref === 'string') : [],
    customProviders: Array.isArray(parsed?.customProviders)
      ? parsed.customProviders.map(sanitizeCustomProvider).filter((provider) => provider !== undefined && provider.id !== '')
      : [],
    localReasoningEfforts: normalizeReasoningLevels(parsed?.localReasoningEfforts),
    mode: {
      local: typeof mode.local === 'boolean' ? mode.local : undefined,
      direct: typeof mode.direct === 'boolean' ? mode.direct : undefined,
    },
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    source: typeof parsed?.source === 'string' ? parsed.source : null,
  }
}

/** 原子写入清单。 */
export function writeStatePro(file, state) {
  const payload = {
    version: 1,
    routes: [...new Set(state.routes ?? [])].sort(),
    credentials: [...new Set(state.credentials ?? [])].sort(),
    customProviders: (state.customProviders ?? []).map(sanitizeCustomProvider).filter((provider) => provider !== undefined),
    localReasoningEfforts: normalizeReasoningLevels(state.localReasoningEfforts),
    mode: {
      ...(typeof state.mode?.local === 'boolean' ? { local: state.mode.local } : {}),
      ...(typeof state.mode?.direct === 'boolean' ? { direct: state.mode.direct } : {}),
    },
    updatedAt: new Date().toISOString(),
    source: state.source ?? null,
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
  return payload
}
