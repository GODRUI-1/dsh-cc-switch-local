/**
 * cc-switch 本地路由（Local Router）探测与路由生成。
 *
 * cc-switch 的本地路由在本机起一个 HTTP 服务（默认 127.0.0.1:15721）：
 *   - Claude Code 把 ANTHROPIC_BASE_URL 指到它，用 Anthropic Messages 协议；
 *   - 路由按「当前供应商」转发，并在需要时把请求转成上游的 OpenAI Chat /
 *     Responses / Gemini 格式；Key 由路由注入，客户端拿到的是 PROXY_MANAGED。
 *
 * 因此 DSH 只要用 anthropic-messages 协议指向同一个地址，就能和 Claude Code
 * 共用同一条路由：在 cc-switch 里切供应商、开故障转移，DSH 下一次请求立即跟上。
 *
 * 本模块只读：cc-switch 数据库的 proxy_config、~/.cc-switch/settings.json、
 * 以及各客户端的实时配置（~/.claude/settings.json、~/.codex/config.toml）。
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'

import { toModel } from './convert.js'
import { normalizeEffortLevel, reasoningEffortsMap } from './reasoning.js'
import { parseToml } from './toml.js'

/** cc-switch 本地路由默认端口。 */
export const DEFAULT_LOCAL_PORT = 15721

/** 本地路由写入客户端配置的占位 Key（真实 Key 留在 cc-switch 里）。 */
export const PROXY_MANAGED = 'PROXY_MANAGED'

/** 本地路由可承载的客户端侧协议：DSH 走 Anthropic Messages。 */
export const LOCAL_ROUTE_API = 'anthropic-messages'

/** 安全读 JSON。 */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** 安全读文本。 */
function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/** 归一化监听地址：0.0.0.0 / :: 在本机访问时用回环地址。 */
export function loopbackFor(address) {
  const value = String(address ?? '').trim()
  if (value === '' || value === '0.0.0.0' || value === '::' || value === '[::]') return '127.0.0.1'
  if (value === 'localhost') return '127.0.0.1'
  return value
}

/** 从 cc-switch 的 proxy_config 表里挑出监听地址与端口（claude 优先）。 */
export function listenTargetOf(proxyConfig = []) {
  const rows = Array.isArray(proxyConfig) ? proxyConfig : []
  const first = rows.find((row) => String(row?.app_type ?? '') === 'claude') ?? rows[0] ?? {}
  const port = Number(first.listen_port ?? DEFAULT_LOCAL_PORT)
  const address = String(first.listen_address ?? '127.0.0.1')
  return {
    address: loopbackFor(address),
    rawAddress: address,
    port: Number.isFinite(port) && port > 0 && port < 65536 ? Math.floor(port) : DEFAULT_LOCAL_PORT,
  }
}

/**
 * 每个 app 的路由开关。
 * proxy_enabled 表示该 app 处于「路由」模式；enabled 表示这行配置启用。
 */
export function appRoutesOf(proxyConfig = []) {
  const rows = Array.isArray(proxyConfig) ? proxyConfig : []
  const out = {}
  for (const row of rows) {
    const appType = String(row?.app_type ?? '')
    if (appType === '') continue
    out[appType] = {
      proxyEnabled: Number(row?.proxy_enabled ?? 0) === 1,
      rowEnabled: Number(row?.enabled ?? 0) === 1,
      listenAddress: String(row?.listen_address ?? ''),
      listenPort: Number(row?.listen_port ?? 0),
      logging: Number(row?.enable_logging ?? 0) === 1,
    }
  }
  return out
}

/**
 * TCP 探活：本地路由是否真的在监听。
 * 只连一下端口，不发请求，不会产生上游计费。
 */
export function checkTcp(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/** 任意文件的时间戳+大小；不存在时返回 'missing'。 */
function fileStamp(file) {
  try {
    const stat = statSync(file)
    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return 'missing'
  }
}

/**
 * 客户端实时配置的变更戳。
 * cc-switch 切换供应商时会改写这些文件（模型名、端点都可能变），
 * 轮询它们才能让「热切换」自动反映到 DSH 的模型清单里。
 */
export function liveConfigStamp(home = homedir()) {
  return [
    fileStamp(path.join(home, '.claude', 'settings.json')),
    fileStamp(path.join(home, '.codex', 'config.toml')),
    fileStamp(path.join(home, '.cc-switch', 'settings.json')),
  ].join('|')
}

/** 读取 cc-switch 自己的 settings.json（全局开关、语言等）。 */
export function readCcSwitchSettings(home = homedir()) {
  const file = path.join(home, '.cc-switch', 'settings.json')
  const raw = readJson(file)
  return {
    file,
    exists: existsSync(file),
    enableLocalProxy: raw?.enableLocalProxy === true,
    proxyConfirmed: raw?.proxyConfirmed === true,
    language: typeof raw?.language === 'string' ? raw.language : undefined,
  }
}

/** 读取 Claude Code 的实时配置（进入路由后这里会被改写成本地地址）。 */
export function readClaudeLive(home = homedir()) {
  const file = path.join(home, '.claude', 'settings.json')
  const raw = readJson(file)
  const env = raw?.env !== null && typeof raw?.env === 'object' ? raw.env : {}
  return {
    file,
    exists: existsSync(file),
    env,
    baseURL: typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL.trim() : '',
    authToken: typeof env.ANTHROPIC_AUTH_TOKEN === 'string' ? env.ANTHROPIC_AUTH_TOKEN : '',
    apiKey: typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '',
    effortLevel: normalizeEffortLevel(env.CLAUDE_CODE_EFFORT_LEVEL),
    models: claudeModelsFromEnv(env),
  }
}

/** 读取 Codex 的实时配置（用于状态展示与判断是否也在路由）。 */
export function readCodexLive(home = homedir()) {
  const file = path.join(home, '.codex', 'config.toml')
  const text = readText(file)
  if (text === undefined) return { file, exists: false, baseURL: '', wireApi: '', model: '', provider: '' }
  let parsed
  try {
    parsed = parseToml(text)
  } catch {
    parsed = {}
  }
  const providerName = typeof parsed?.model_provider === 'string' ? parsed.model_provider : ''
  const table = parsed?.model_providers?.[providerName] ?? parsed?.model_providers?.custom ?? {}
  return {
    file,
    exists: true,
    baseURL: typeof table?.base_url === 'string' ? table.base_url.trim() : '',
    wireApi: typeof table?.wire_api === 'string' ? table.wire_api.trim() : '',
    model: typeof parsed?.model === 'string' ? parsed.model.trim() : '',
    provider: providerName,
  }
}

/** 从 ANTHROPIC_* 环境变量收集路由能接受的模型名。 */
export function claudeModelsFromEnv(env = {}) {
  const pairs = [
    ['ANTHROPIC_MODEL', 'ANTHROPIC_MODEL_NAME', 'Claude'],
    ['ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME', 'Opus'],
    ['ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME', 'Sonnet'],
    ['ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME', 'Haiku'],
    ['ANTHROPIC_DEFAULT_FABLE_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME', 'Fable'],
    ['ANTHROPIC_SMALL_FAST_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL_NAME', 'Small/Fast'],
    ['CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_NAME', 'Subagent'],
  ]
  const out = []
  const seen = new Set()
  for (const [idKey, nameKey, slot] of pairs) {
    const id = typeof env?.[idKey] === 'string' ? env[idKey].trim() : ''
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    // 同一个上游模型会同时映射到 opus/sonnet/haiku 多个 Claude 模型名；直接拿
    // *_MODEL_NAME 当展示名会四条一模一样，所以带上槽位前缀，既保留映射关系又可区分。
    const upstream = typeof env?.[nameKey] === 'string' ? env[nameKey].trim() : ''
    out.push(upstream !== '' && upstream !== id ? { id, name: `${slot} · ${upstream}` } : { id })
  }
  return out
}

/**
 * 判断一个客户端 base URL 是否指向本地路由。
 * @returns `true` 当 host 是回环地址且端口与路由一致（或未显式给端口）。
 */
export function pointsAtLocal(baseURL, { address, port } = {}) {
  if (typeof baseURL !== 'string' || baseURL.trim() === '') return false
  let url
  try {
    url = new URL(baseURL)
  } catch {
    return false
  }
  const host = url.hostname
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  if (!isLoopback) return false
  const expectedPort = Number(port) > 0 ? Number(port) : DEFAULT_LOCAL_PORT
  const actualPort = url.port !== '' ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  return actualPort === expectedPort
}

/**
 * 探测本地路由全貌。
 * @returns 结构化结果（不抛异常）。
 */
export async function detectLocalRoute({
  records = [],
  proxyConfig = [],
  ccSettings = {},
  home = homedir(),
  probeTimeoutMs = 800,
} = {}) {
  const target = listenTargetOf(proxyConfig)
  const apps = appRoutesOf(proxyConfig)
  const settingsJson = readCcSwitchSettings(home)
  const cc = ccSettings !== undefined && ccSettings !== null ? { ...settingsJson, ...ccSettings } : settingsJson
  const claudeLive = readClaudeLive(home)
  const codexLive = readCodexLive(home)
  const listening = await checkTcp(target.address, target.port, probeTimeoutMs)

  const claudeRouted = pointsAtLocal(claudeLive.baseURL, target)
  const codexRouted = pointsAtLocal(codexLive.baseURL, target)
  const currentClaude = records.find((record) => record.appType === 'claude' && record.isCurrent === true)
  const recordEnv = currentClaude?.config?.env ?? {}
  // 实时配置优先；cc-switch 的供应商条目作为兜底（直连模式下实时配置可能没有这一项）。
  const effortLevel = claudeLive.effortLevel ?? normalizeEffortLevel(recordEnv.CLAUDE_CODE_EFFORT_LEVEL)
  const models = claudeLive.models.length > 0
    ? claudeLive.models
    : modelsFromRecord(currentClaude)

  return {
    ...target,
    baseURL: `http://${target.address}:${target.port}`,
    api: LOCAL_ROUTE_API,
    listening,
    apps,
    claude: { ...claudeLive, effortLevel, routed: claudeRouted },
    codex: { ...codexLive, routed: codexRouted },
    currentProvider: currentClaude ? { id: currentClaude.id, name: currentClaude.name } : undefined,
    models,
    settings: {
      enableLocalProxy: cc.enableLocalProxy === true,
      proxyConfirmed: cc.proxyConfirmed === true,
      settingsFile: settingsJson.file,
    },
  }
}

/** 当前供应商从记录里能提取出的 Claude 模型名（实时配置缺失时的兜底）。 */
function modelsFromRecord(record) {
  if (record === undefined || record === null) return []
  const env = record.config?.env ?? {}
  return claudeModelsFromEnv(env)
}

/**
 * 把探测结果转成一条 pi-ai 路由变体（与 convertRecord 的变体同构）。
 * @returns `{ variant?, skipped? }`
 */
export function localRouteVariant(detection, { prefix = 'ccswitchlocal', reasoningEfforts = [], defaultEffort } = {}) {
  if (detection === undefined || detection === null) {
    return { skipped: { appType: 'claude', name: '本地路由', reason: '没有探测到 cc-switch 本地路由配置' } }
  }
  if (!detection.listening) {
    return {
      skipped: {
        appType: 'claude',
        name: '本地路由',
        reason: `cc-switch 本地路由没有在 ${detection.address}:${detection.port} 监听（在 cc-switch 里「开始路由」或启动服务）`,
      },
    }
  }
  const claudeRouteActive = detection.claude?.routed === true || detection.apps?.claude?.proxyEnabled === true
  if (!claudeRouteActive) {
    return {
      skipped: {
        appType: 'claude',
        name: '本地路由',
        reason: 'cc-switch 的 Claude Code 当前处于「直连」模式；先在 cc-switch 应用页点「开始路由」，本地路由才有转发目标',
      },
    }
  }
  const models = Array.isArray(detection.models) ? detection.models : []
  if (models.length === 0) {
    return {
      skipped: {
        appType: 'claude',
        name: '本地路由',
        reason: '本地路由在运行，但没有识别到可用的 Claude 模型名（检查 ~/.claude/settings.json 的 ANTHROPIC_DEFAULT_*_MODEL）',
      },
    }
  }
  const routeKey = `${prefix}-local-claude`
  const apiKeyEnv = `${String(prefix).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_LOCAL_PROXY_API_KEY`
  const providerName = detection.currentProvider?.name
  const displayName = providerName ? `cc-switch 本地路由 · ${providerName}` : 'cc-switch 本地路由'
  const efforts = reasoningEffortsMap(reasoningEfforts)
  const routeModels = models.map((model) => toModel(model)).filter(Boolean)
  const profile = {
    displayName,
    api: LOCAL_ROUTE_API,
    baseURL: detection.baseURL,
    apiKeyEnv,
    models: efforts === undefined
      ? routeModels
      : routeModels.map((model) => ({ ...model, reasoningEfforts: { ...efforts } })),
  }
  // Claude Code 的 CLAUDE_CODE_EFFORT_LEVEL 作为路由级默认思考等级。
  // 只有在该等级确实被 pi-ai 元数据声明时才写，否则会触发 UNSUPPORTED_REASONING_EFFORT。
  const preferred = normalizeEffortLevel(defaultEffort ?? detection.claude?.effortLevel)
  if (efforts !== undefined && preferred !== undefined && (preferred === 'off' || efforts[preferred] !== undefined)) {
    profile.reasoning = preferred
  }
  return {
    variant: {
      routeKey,
      apiKeyEnv,
      apiKey: PROXY_MANAGED,
      protocol: LOCAL_ROUTE_API,
      baseURL: detection.baseURL,
      models: profile.models,
      displayName,
      headers: undefined,
      profile,
      problems: [],
      notes: [`与 Claude Code 共用 cc-switch 本地路由（${detection.baseURL}）；在 cc-switch 里切供应商会立即作用于 DSH`],
      source: {
        appType: 'claude',
        name: '本地路由',
        id: 'local',
        kind: 'local',
        protocol: LOCAL_ROUTE_API,
        baseURL: detection.baseURL,
      },
    },
  }
}

/** 路由健康检查（GET /health），用于面板上的「检测」按钮。 */
export async function probeLocalHealth(detection, { timeoutMs = 2500 } = {}) {
  if (detection === undefined || detection === null) return { ok: false, reason: '没有本地路由配置' }
  const startedAt = Date.now()
  try {
    const response = await fetch(`${detection.baseURL}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    })
    const latencyMs = Date.now() - startedAt
    if (!response.ok) return { ok: false, status: response.status, latencyMs, reason: `HTTP ${response.status}` }
    let body
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    return { ok: body?.status === 'healthy' || body?.status === undefined, status: response.status, latencyMs, body }
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - startedAt, reason: error?.message || String(error) }
  }
}
