/**
 * dsh-cc-switch-local —— 把 cc-switch 的「本地路由」和供应商一起接进 DeepSeek Harness。
 *
 * 与 dsh-cc-switch 的区别：
 *   1. 读取 cc-switch 本地路由（proxy_config + 客户端实时配置），把
 *      127.0.0.1:15721 作为一条 anthropic-messages 路由接进来 —— 与 Claude Code
 *      共用同一条路由，cc-switch 里切供应商 / 开故障转移立刻生效；
 *   2. 直连上游与本地路由可以分别开关，随时切换；
 *   3. 支持自定义供应商（配置文件 + Web 管理面板），API 格式可选
 *      openai-completions / openai-responses / anthropic-messages。
 *
 * 真正的协议实现仍然由 DSH 自带的 pi-ai 适配器完成，本插件只做探测、翻译与写入。
 */

import { homedir } from 'node:os'

import { KNOWN_APP_TYPES, databaseStamp, readProviders, resolvePaths } from './ccswitch.js'
import { convertRecord } from './convert.js'
import { customEnvRef, customIdOf, customModelsOf, customVariants, mergeCustomProviders, normalizeCustomApi, normalizeCustomProvider } from './custom.js'
import { detectLocalRoute, liveConfigStamp, localRouteVariant, probeLocalHealth } from './localroute.js'
import { normalizeReasoningLevels, reasoningLevelsLabel } from './reasoning.js'
import { buildPlanPro, profileDiffKeys, profileMatches } from './plan-pro.js'
import { readStatePro, sanitizeCustomProvider, statePathFor, writeStatePro } from './state-pro.js'

export const name = 'cc-switch-local'

export const inject = ['tools']

/** 默认导入的 app 类型。 */
const DEFAULT_APP_TYPES = ['claude', 'claude-desktop', 'codex', 'openclaw', 'mcode', 'pi', 'opencode', 'hermes', 'grokbuild', 'gemini']

/** Web 面板与 Host 之间的 RPC 通道。 */
export const RPC_CHANNEL = '/dsh-cc-switch-local'

const MASK = '••••'



// ═══ 小工具 ═══════════════════════════════════════════════════════════════

export function parseList(value) {
  return String(value ?? '')
    .split(/[,;，；\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

export function parseFilters(value) {
  return String(value ?? '')
    .split(/[,;，；]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

export function maskKey(value) {
  if (typeof value !== 'string' || value === '') return ''
  if (value.length <= 8) return MASK
  return `${value.slice(0, 4)}${MASK}`
}

function getService(ctx, name) {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get(name) : undefined
    if (viaGet !== undefined && viaGet !== null) return viaGet
  } catch {
    /* 服务未挂载 */
  }
  return ctx[name]
}

function matchesFilter(record, token) {
  const needle = token.toLowerCase()
  return String(record.name ?? '').toLowerCase().includes(needle) || String(record.id ?? '').toLowerCase().includes(needle)
}

export function selectRecords(records, { appTypes = [], include = '', exclude = '' } = {}) {
  const types = new Set(appTypes)
  const includes = parseFilters(include)
  const excludes = parseFilters(exclude)
  const isForced = (record) => includes.length > 0 && includes.some((token) => matchesFilter(record, token))
  return records.filter((record) => {
    if (typeof record.appType !== 'string' || record.appType === '' || record.appType === 'unknown') return false
    const forced = isForced(record)
    if (includes.length > 0 && !forced) return false
    if (!forced && types.size > 0 && !types.has(record.appType)) return false
    if (excludes.some((token) => matchesFilter(record, token))) return false
    return true
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isPermanentWriteError(error) {
  const message = String(error?.message ?? error)
  return (
    message.includes('is not volatile') ||
    message.includes('No configurable plugin entry') ||
    message.includes('no volatile fields') ||
    message.includes('is no longer configurable')
  )
}

// ═══ 插件主体 ═════════════════════════════════════════════════════════════

export function apply(ctx, config = {}) {
  const log = {
    info: (...args) => {
      try {
        ctx.logger?.info?.(...args)
      } catch {
        /* logger 不可用时静默 */
      }
    },
    warn: (...args) => {
      try {
        ctx.logger?.warn?.(...args)
      } catch {
        /* 同上 */
      }
    },
    error: (...args) => {
      try {
        ctx.logger?.error?.(...args)
      } catch {
        /* 同上 */
      }
    },
    debug: (message) => {
      if (config.debug !== true) return
      try {
        ctx.logger?.info?.(`[cc-switch-local] ${message}`)
      } catch {
        /* 同上 */
      }
    },
  }

  const current = () => ({
    enabled: config.enabled !== false,
    dbPath: typeof config.dbPath === 'string' ? config.dbPath : '',
    appTypes: parseList(config.appTypes).length > 0 ? parseList(config.appTypes) : DEFAULT_APP_TYPES,
    include: config.include ?? '',
    exclude: config.exclude ?? '',
    routePrefix: typeof config.routePrefix === 'string' && config.routePrefix.trim() !== '' ? config.routePrefix.trim() : 'ccswitchlocal',
    targetEntry: typeof config.targetEntry === 'string' && config.targetEntry.trim() !== '' ? config.targetEntry.trim() : 'llm-pi-ai',
    mode: config.mode === 'plan' ? 'plan' : 'apply',
    onConflict: config.onConflict === 'overwrite' ? 'overwrite' : 'skip',
    importUnsupported: config.importUnsupported === true,
    pruneOwnedRoutes: config.pruneOwnedRoutes !== false,
    writeCredentials: config.writeCredentials !== false,
    usageModelHints: config.usageModelHints !== false,
    syncOnLoad: config.syncOnLoad !== false,
    loadDelayMs: Number.isFinite(Number(config.loadDelayMs)) && Number(config.loadDelayMs) >= 0 ? Number(config.loadDelayMs) : 2500,
    watchSeconds: Number.isFinite(Number(config.watchSeconds)) && Number(config.watchSeconds) >= 0 ? Number(config.watchSeconds) : 30,
    statePath: statePathFor({ statePath: config.statePath ?? '' }),
    includeLocalRoute: config.includeLocalRoute !== false,
    includeDirectRoutes: config.includeDirectRoutes !== false,
    customProviders: Array.isArray(config.customProviders) ? config.customProviders : [],
    localReasoningEfforts: normalizeReasoningLevels(config.localReasoningEfforts ?? config.reasoningEfforts),
  })

  const runtime = {
    chain: Promise.resolve(),
    lastStamp: undefined,
    lastSummary: undefined,
    lastSync: undefined,
    rpcRegistered: false,
    rpcError: undefined,
    rpcInjectRan: false,
  }

  function modeOf(cfg, state) {
    return {
      local: typeof state.mode.local === 'boolean' ? state.mode.local : cfg.includeLocalRoute,
      direct: typeof state.mode.direct === 'boolean' ? state.mode.direct : cfg.includeDirectRoutes,
    }
  }

  function currentProvidersOf(settings, targetEntry) {
    const rows = settings.describe()
    const row = rows.find((entry) => entry.ns === targetEntry)
    if (row === undefined) return { row: undefined, providers: {} }
    const providers = row.value?.providers
    return { row, providers: providers !== undefined && providers !== null && typeof providers === 'object' ? providers : {} }
  }

  async function resolveCredentialState(credentials, refs) {
    const state = {}
    if (credentials === undefined) return state
    for (const ref of [...new Set(refs)]) {
      try {
        const hit = await credentials.resolve(ref)
        if (hit !== undefined && hit !== null) state[ref] = { value: hit.value, source: hit.source }
      } catch {
        /* 解析失败按「未知」处理 */
      }
    }
    return state
  }

  /**
   * 收集一次同步/快照所需的全部事实（不写任何东西）。
   */
  async function collect({ selection } = {}) {
    const cfg = current()
    const state = readStatePro(cfg.statePath)
    const mode = modeOf(cfg, state)
    const appTypes = selection?.appTypes !== undefined && selection.appTypes.length > 0 ? selection.appTypes : cfg.appTypes
    const include = selection?.include !== undefined ? selection.include : cfg.include
    const exclude = selection?.exclude !== undefined ? selection.exclude : cfg.exclude

    const source = await readProviders({ dbPath: cfg.dbPath, appTypes, logger: { debug: log.debug, warn: log.warn } })
    const records = source.source === 'missing'
      ? []
      : selectRecords(source.records, { appTypes, include, exclude })
    if (cfg.usageModelHints !== true) {
      for (const record of records) record.usedModels = []
    }

    const detection = await detectLocalRoute({
      records,
      proxyConfig: source.proxyConfig ?? [],
      home: homedir(),
      ccSettings: undefined,
      probeTimeoutMs: 800,
    })

    const variants = []
    const skipped = []
    const warnings = []
    if (source.warning !== undefined) warnings.push(source.warning)

    // 1) 本地路由
    const localReasoning = state.localReasoningEfforts.length > 0 ? state.localReasoningEfforts : cfg.localReasoningEfforts
    let localUsable = false
    if (mode.local) {
      const built = localRouteVariant(detection, { prefix: cfg.routePrefix, reasoningEfforts: localReasoning })
      if (built.variant !== undefined) {
        variants.push(built.variant)
        localUsable = true
      } else if (built.skipped !== undefined) {
        skipped.push(built.skipped)
      }
    }

    // 2) 直连上游
    if (mode.direct) {
      for (const record of records) {
        const converted = convertRecord(record, { prefix: cfg.routePrefix, overrides: {} })
        if (converted.variants.length === 0) {
          skipped.push({
            appType: record.appType,
            name: record.name,
            id: record.id,
            reason: converted.problems.join('；') || '没有可导入的路由',
          })
          continue
        }
        for (const variant of converted.variants) {
          if (!variant.usable) {
            skipped.push({
              appType: record.appType,
              name: record.name,
              id: record.id,
              reason: `${variant.routeKey}：${variant.problems.join('；')}`,
            })
            continue
          }
          if (localUsable && record.appType === 'claude' && record.isCurrent === true) {
            skipped.push({
              appType: record.appType,
              name: record.name,
              id: record.id,
              reason: '当前 Claude 供应商已由本地路由接管（想直连它，请在面板里切到「仅直连」）',
            })
            continue
          }
          variants.push({
            ...variant,
            source: { appType: record.appType, name: record.name, id: record.id, kind: 'direct', protocol: variant.protocol, baseURL: variant.baseURL },
          })
        }
      }
    }

    // 3) 自定义供应商（配置文件 + 面板）
    const customs = mergeCustomProviders(cfg.customProviders, state.customProviders, { prefix: cfg.routePrefix })
    const customBuilt = customVariants(customs, { prefix: cfg.routePrefix })
    variants.push(...customBuilt.variants)
    skipped.push(...customBuilt.skipped)

    return { cfg, state, mode, source, records, detection, variants, skipped, warnings, localUsable, customs, localReasoning }
  }

  async function runOnce({ reason = 'manual', dryRun = false, selection } = {}) {
    const cfg = current()
    const settings = getService(ctx, 'settings')
    const credentials = getService(ctx, 'credentials')
    const report = {
      ok: false,
      reason,
      applied: false,
      dryRun,
      changed: false,
      targetEntry: cfg.targetEntry,
      routePrefix: cfg.routePrefix,
      mode: { local: cfg.includeLocalRoute, direct: cfg.includeDirectRoutes },
      source: 'missing',
      sourcePath: undefined,
      localRoute: undefined,
      routes: { add: [], update: [], remove: [], unchanged: [], conflicts: [], total: 0, detail: {} },
      credentials: { written: 0, removed: 0, skipped: [] },
      skipped: [],
      warnings: [],
      custom: { total: 0 },
      message: '',
    }

    if (settings === undefined) {
      report.message = '没有挂载 settings 服务，无法写入 llm-pi-ai 配置（该服务由 DSH 基础组合提供）'
      return report
    }

    let collected
    try {
      collected = await collect({ selection })
    } catch (error) {
      report.message = `读取 cc-switch 失败：${error?.message || error}`
      return report
    }
    const { state, mode, source, detection, variants, skipped, warnings, customs, localReasoning, cfg: cfg2 } = collected
    report.mode = { ...mode }
    report.source = source.source
    report.sourcePath = source.path
    report.localRoute = summarizeDetection(detection)
    report.custom.total = customs.length
    report.warnings.push(...warnings)
    report.skipped = skipped

    const manifest = { routes: state.routes, credentials: state.credentials }
    const planConfig = {
      routePrefix: cfg2.routePrefix,
      onConflict: cfg2.onConflict,
      importUnsupported: cfg2.importUnsupported,
      pruneOwnedRoutes: cfg2.pruneOwnedRoutes,
    }

    let currentProviders
    try {
      currentProviders = currentProvidersOf(settings, cfg2.targetEntry).providers
    } catch (error) {
      report.message = `读取 ${cfg2.targetEntry} 当前配置失败：${error?.message || error}`
      return report
    }

    const preliminary = buildPlanPro({ variants, config: planConfig, currentProviders, manifest, credentialState: {} })
    const refs = [...preliminary.managedCredentials, ...state.credentials]
    const credentialState = await resolveCredentialState(credentials, refs)
    const plan = buildPlanPro({ variants, config: planConfig, currentProviders, manifest, credentialState })

    report.skipped.push(...plan.skipped)
    report.warnings.push(...plan.warnings)
    report.changed = plan.changed
    report.routes = {
      add: [...plan.add],
      update: [...plan.update],
      remove: [...plan.remove],
      unchanged: [...plan.unchanged].slice(0, 50),
      conflicts: [...plan.conflicts],
      total: plan.managedRoutes.length,
      detail: Object.fromEntries(
        Object.entries(plan.sources).map(([key, value]) => [
          key,
          {
            ...value,
            models: (plan.routes[key]?.models ?? []).map((model) => model.id),
            api: plan.routes[key]?.api,
            displayName: plan.routes[key]?.displayName,
            baseURL: plan.routes[key]?.baseURL,
          },
        ]),
      ),
    }

    const willApply = cfg2.mode === 'apply' && !dryRun && plan.changed
    if (cfg2.mode !== 'apply') report.warnings.push('插件处于 plan 模式：只计算计划，不写入配置')

    if (!plan.changed) {
      report.ok = true
      report.message = `cc-switch 与 ${cfg2.targetEntry} 已经一致（${plan.managedRoutes.length} 条路由），无需变更`
      runtime.lastSummary = { at: new Date().toISOString(), mode: { ...mode }, source: source.source, routes: plan.managedRoutes }
      runtime.lastSync = runtime.lastSummary
      if (cfg2.mode === 'apply' && !dryRun) {
        try {
          writeStatePro(cfg2.statePath, {
            routes: plan.managedRoutes,
            credentials: plan.managedCredentials,
            customProviders: state.customProviders,
            localReasoningEfforts: state.localReasoningEfforts,
            mode,
            source: source.source,
          })
        } catch (error) {
          report.warnings.push(`清单写入失败：${error?.message || error}`)
        }
      }
      return report
    }

    if (!willApply) {
      report.ok = true
      report.plan = {
        routes: plan.managedRoutes,
        credentials: plan.credentials.map((entry) => ({ ref: entry.ref, routeKey: entry.routeKey, key: maskKey(entry.value) })),
      }
      report.message =
        dryRun || cfg2.mode !== 'apply'
          ? `预演：将新增 ${plan.add.length} 条、更新 ${plan.update.length} 条、删除 ${plan.remove.length} 条路由`
          : '没有写入'
      return report
    }

    // 先写凭据，再写路由：路由一旦注册就能立刻用
    if (cfg2.writeCredentials && credentials !== undefined) {
      for (const entry of plan.credentialWrites) {
        try {
          await credentials.set(entry.ref, entry.value)
          report.credentials.written += 1
        } catch (error) {
          report.warnings.push(`凭据 ${entry.ref} 写入失败：${error?.message || error}`)
        }
      }
      for (const ref of plan.credentialRemovals) {
        try {
          await credentials.unset(ref)
          report.credentials.removed += 1
        } catch (error) {
          report.warnings.push(`凭据 ${ref} 清理失败：${error?.message || error}`)
        }
      }
    } else if (!cfg2.writeCredentials) {
      report.warnings.push('writeCredentials=false：API Key 未写入凭据存储，请在「设置 → 模型」里手工填写')
    } else {
      report.warnings.push('没有挂载 credentials 服务：API Key 未写入，请在「设置 → 模型」里手工填写')
    }

    const ops = []
    for (const [key, profile] of Object.entries(plan.routes)) {
      const existing = currentProviders[key]
      if (existing !== undefined && profileMatches(existing, profile)) continue
      if (existing !== undefined && cfg2.debug) {
        log.debug(`[cc-switch-local] 路由 ${key} 需要更新，差异字段：${profileDiffKeys(existing, profile).join(', ')}`)
      }
      ops.push({ op: 'set', path: ['providers', key], value: profile })
    }
    for (const key of plan.remove) ops.push({ op: 'unset', path: ['providers', key] })

    if (ops.length > 0) {
      const failure = await writeProviders(settings, cfg2.targetEntry, ops)
      if (failure !== undefined) {
        report.ok = false
        report.message = `写入 ${cfg2.targetEntry} 失败：${failure?.message || failure}`
        return report
      }
      report.applied = true
    }

    try {
      writeStatePro(cfg2.statePath, {
        routes: plan.managedRoutes,
        credentials: plan.managedCredentials,
        customProviders: state.customProviders,
        localReasoningEfforts: state.localReasoningEfforts,
        mode,
        source: source.source,
      })
    } catch (error) {
      report.warnings.push(`清单写入失败：${error?.message || error}`)
    }

    report.ok = true
    report.message =
      `已同步 ${plan.managedRoutes.length} 条路由到 ${cfg2.targetEntry}` +
      `（新增 ${plan.add.length}，更新 ${plan.update.length}，删除 ${plan.remove.length}，凭据 ${report.credentials.written} 个）` +
      `；模式：本地路由 ${mode.local ? '开' : '关'} / 直连 ${mode.direct ? '开' : '关'}`
    runtime.lastSummary = { at: new Date().toISOString(), mode: { ...mode }, source: source.source, routes: plan.managedRoutes }
    runtime.lastSync = runtime.lastSummary
    return report
  }

  function summarizeDetection(detection) {
    if (detection === undefined) return undefined
    return {
      address: detection.address,
      port: detection.port,
      baseURL: detection.baseURL,
      listening: detection.listening,
      routed: detection.claude?.routed === true,
      effortLevel: detection.claude?.effortLevel,
      currentProvider: detection.currentProvider?.name,
      models: (detection.models ?? []).map((model) => model.id),
      claudeBaseURL: detection.claude?.baseURL ?? '',
      codexBaseURL: detection.codex?.baseURL ?? '',
      codexRouted: detection.codex?.routed === true,
      enableLocalProxy: detection.settings?.enableLocalProxy === true,
    }
  }

  function writeProviders(service, targetEntry, ops) {
    let lastError
    return (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await service.mutate(targetEntry, ops, undefined)
          return undefined
        } catch (error) {
          lastError = error
          if (isPermanentWriteError(error)) return lastError
          log.warn(`[cc-switch-local] 写入 ${targetEntry} 第 ${attempt + 1} 次失败，准备重试：${error?.message || error}`)
          await delay(200 * (attempt + 1))
        }
      }
      return lastError
    })()
  }

  function sync(options = {}) {
    const run = runtime.chain.then(async () => {
      try {
        return await runOnce(options)
      } catch (error) {
        log.error(`[cc-switch-local] 同步失败：${error?.stack || error}`)
        return {
          ok: false,
          reason: options.reason ?? 'manual',
          source: 'error',
          mode: { local: false, direct: false },
          routes: { add: [], update: [], remove: [], unchanged: [], conflicts: [], total: 0, detail: {} },
          credentials: { written: 0, removed: 0, skipped: [] },
          skipped: [],
          warnings: [],
          message: `同步失败：${error?.message || error}`,
        }
      }
    })
    runtime.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  // ── 面板数据与操作 ───────────────────────────────────────────────────────

  async function describe() {
    const cfg = current()
    const state = readStatePro(cfg.statePath)
    const mode = modeOf(cfg, state)
    const credentials = getService(ctx, 'credentials')
    const settings = getService(ctx, 'settings')
    const collected = await collect({})
    const { source, records, detection, variants, skipped, localReasoning } = collected
    const customs = collected.customs

    let currentProviders = {}
    if (settings !== undefined) {
      try {
        currentProviders = currentProvidersOf(settings, cfg.targetEntry).providers
      } catch {
        currentProviders = {}
      }
    }

    const localTakesOver = mode.local === true && detection?.listening === true
    const providers = records.map((record) => {
      const converted = convertRecord(record, { prefix: cfg.routePrefix, overrides: {} })
      const usable = converted.variants.filter((variant) => variant.usable)
      const primary = usable[0]
      const skip = skipped.find((entry) => entry.appType === record.appType && (entry.id === record.id || entry.name === record.name))
      const suppressed = localTakesOver && record.appType === 'claude' && record.isCurrent === true
      return {
        id: record.id,
        appType: record.appType,
        name: record.name,
        category: record.category,
        isCurrent: record.isCurrent === true,
        apiFormat: record.meta?.apiFormat,
        baseURL: primary?.baseURL,
        api: primary?.protocol,
        models: (primary?.models ?? []).map((model) => model.id),
        routeKeys: suppressed ? [] : usable.map((variant) => variant.routeKey),
        importable: usable.length > 0,
        suppressed,
        reason: skip?.reason,
      }
    })

    const routes = Object.keys(currentProviders)
      .filter((key) => key.startsWith(`${cfg.routePrefix}-`))
      .sort()
      .map((key) => {
        const profile = currentProviders[key] ?? {}
        return {
          key,
          displayName: profile.displayName,
          api: profile.api,
          baseURL: profile.baseURL,
          models: (profile.models ?? []).map((model) => model.id),
          managed: state.routes.includes(key),
        }
      })

    const customDetails = []
    for (const provider of customs) {
      let configured = false
      if (credentials !== undefined) {
        try {
          const info = await credentials.describe(provider.apiKeyEnv)
          configured = info?.configured === true
        } catch {
          configured = false
        }
      }
      customDetails.push({
        id: provider.id,
        displayName: provider.displayName,
        api: provider.api,
        baseURL: provider.baseURL,
        models: provider.models.map((model) => model.id),
        reasoningEfforts: provider.reasoningEfforts ?? [],
        apiKeyEnv: provider.apiKeyEnv,
        enabled: provider.enabled !== false,
        hasKey: configured,
        origin: state.customProviders.some((entry) => entry.id === provider.id) ? 'panel' : 'config',
      })
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      targetEntry: cfg.targetEntry,
      routePrefix: cfg.routePrefix,
      mode,
      ccswitch: {
        source: source.source,
        path: source.path,
        appTypes: source.appTypes,
        providers,
      },
      localReasoningEfforts: localReasoning,
      localRoute: {
        ...summarizeDetection(detection),
        reasoningEfforts: localReasoning,
        health: undefined,
      },
      routes,
      customProviders: customDetails,
      skipped,
      warnings: [...collected.warnings, ...skipped.map((entry) => `[${entry.appType}] ${entry.name}：${entry.reason}`)],
      lastSync: runtime.lastSummary ?? null,
      diagnostics: {
        connection: getService(ctx, 'connection') !== undefined,
        llm: getService(ctx, 'llm') !== undefined,
        rpcRegistered: runtime.rpcRegistered === true,
        rpcInjectRan: runtime.rpcInjectRan === true,
        rpcChannel: RPC_CHANNEL,
        rpcError: runtime.rpcError,
      },
    }
  }

  async function setMode({ local, direct }) {
    const cfg = current()
    const state = readStatePro(cfg.statePath)
    const nextMode = {
      local: typeof local === 'boolean' ? local : modeOf(cfg, state).local,
      direct: typeof direct === 'boolean' ? direct : modeOf(cfg, state).direct,
    }
    writeStatePro(cfg.statePath, {
      routes: state.routes,
      credentials: state.credentials,
      customProviders: state.customProviders,
      localReasoningEfforts: state.localReasoningEfforts,
      mode: nextMode,
      source: state.source,
    })
    const report = await sync({ reason: 'mode' })
    return { report, mode: nextMode }
  }

  async function setLocalReasoning({ levels } = {}) {
    const cfg = current()
    const state = readStatePro(cfg.statePath)
    const next = normalizeReasoningLevels(levels)
    writeStatePro(cfg.statePath, {
      routes: state.routes,
      credentials: state.credentials,
      customProviders: state.customProviders,
      localReasoningEfforts: next,
      mode: state.mode,
      source: state.source,
    })
    const report = await sync({ reason: 'local-reasoning' })
    return { report, localReasoningEfforts: next }
  }

  async function saveCustomProvider(input = {}) {
    const cfg = current()
    const credentials = getService(ctx, 'credentials')
    if (credentials === undefined) {
      return { ok: false, message: '没有挂载 credentials 服务，无法保存自定义供应商的 Key' }
    }
    const normalized = normalizeCustomProvider(
      {
        ...input,
        id: input.id ?? input.originalId,
        baseURL: input.baseURL ?? input.base_url,
        displayName: input.displayName ?? input.name,
        apiKey: input.apiKey ?? input.api_key,
        reasoningEfforts: input.reasoningEfforts ?? input.reasoning,
      },
      { prefix: cfg.routePrefix },
    )
    if (normalized === undefined) return { ok: false, message: '供应商参数无效' }
    if (normalized.baseURL === undefined) return { ok: false, message: '缺少 baseURL' }
    if (normalized.api === undefined) return { ok: false, message: 'API 格式不支持：请选择 openai-completions / openai-responses / anthropic-messages' }
    if (normalized.models.length === 0) return { ok: false, message: '至少填写一个模型 id' }

    const state = readStatePro(cfg.statePath)
    const originalId = typeof input.originalId === 'string' && input.originalId !== '' ? input.originalId : normalized.id
    const previous = state.customProviders.find((entry) => entry.id === originalId)
    const entry = sanitizeCustomProvider({
      id: normalized.id,
      displayName: normalized.displayName,
      api: normalized.api,
      baseURL: normalized.baseURL,
      apiKeyEnv: previous?.apiKeyEnv ?? normalized.apiKeyEnv ?? customEnvRef(cfg.routePrefix, normalized.id),
      models: normalized.models,
      enabled: normalized.enabled,
      headers: normalized.headers,
      notes: normalized.notes,
      reasoningEfforts: normalized.reasoningEfforts,
    })
    if (entry === undefined) return { ok: false, message: '供应商参数无效' }

    const key = typeof (input.apiKey ?? input.api_key) === 'string' ? String(input.apiKey ?? input.api_key).trim() : ''
    if (key !== '') {
      try {
        await credentials.set(entry.apiKeyEnv, key)
      } catch (error) {
        return { ok: false, message: `API Key 写入失败：${error?.message || error}` }
      }
    }

    const others = state.customProviders.filter((item) => item.id !== originalId && item.id !== entry.id)
    // 同时允许删除配置文件里同 id 的声明后由面板接管；这里只写面板清单
    writeStatePro(cfg.statePath, {
      routes: state.routes,
      credentials: state.credentials,
      customProviders: [...others, entry],
      localReasoningEfforts: state.localReasoningEfforts,
      mode: state.mode,
      source: state.source,
    })
    const report = await sync({ reason: 'custom-save' })
    return { ok: report.ok === true, report, provider: { ...entry, apiKey: undefined } }
  }

  async function removeCustomProvider(input = {}) {
    const cfg = current()
    const id = String(input.id ?? input.originalId ?? '').trim()
    if (id === '') return { ok: false, message: '缺少供应商 id' }
    const state = readStatePro(cfg.statePath)
    const existing = state.customProviders.find((entry) => entry.id === id)
    if (existing === undefined) return { ok: false, message: `没有找到面板保存的供应商 "${id}"` }
    const credentials = getService(ctx, 'credentials')
    writeStatePro(cfg.statePath, {
      routes: state.routes,
      credentials: state.credentials,
      customProviders: state.customProviders.filter((entry) => entry.id !== id),
      localReasoningEfforts: state.localReasoningEfforts,
      mode: state.mode,
      source: state.source,
    })
    if (credentials !== undefined) {
      try {
        await credentials.unset(existing.apiKeyEnv)
      } catch {
        /* 凭据清理失败不影响路由清理 */
      }
    }
    const report = await sync({ reason: 'custom-remove' })
    return { ok: report.ok === true, report }
  }

  async function probeLocal() {
    const cfg = current()
    const source = await readProviders({ dbPath: cfg.dbPath, logger: { debug: log.debug, warn: log.warn } })
    const detection = await detectLocalRoute({
      records: source.records ?? [],
      proxyConfig: source.proxyConfig ?? [],
      home: homedir(),
    })
    const health = await probeLocalHealth(detection)
    const routeKey = `${cfg.routePrefix}-local-claude`
    let registry
    const llm = getService(ctx, 'llm')
    if (llm !== undefined && typeof llm.listModels === 'function') {
      try {
        const models = await llm.listModels(routeKey)
        registry = { registered: true, routeKey, models: models.map((model) => model.id) }
        if (models.length > 0 && typeof llm.resolveModelInfo === 'function') {
          try {
            const info = await llm.resolveModelInfo(routeKey, models[0].id)
            registry.reasoning = info?.reasoning?.efforts?.map((effort) => effort.id) ?? []
            registry.defaultEffort = info?.reasoning?.defaultEffort
            registry.contextWindow = info?.context?.contextWindow
            registry.maxTokens = info?.defaultMaxTokens
          } catch {
            registry.reasoning = []
          }
        }
      } catch (error) {
        registry = { registered: false, routeKey, reason: error?.message || String(error) }
      }
    }
    return { ok: health.ok === true, health, detection: summarizeDetection(detection), registry }
  }

  // ── 自动同步 ─────────────────────────────────────────────────────────────

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings', 'credentials'], (scope) => {
      scope.effect(() => {
        const cfg = current()
        if (!cfg.enabled) return () => {}
        const timers = []
        if (cfg.syncOnLoad) {
          timers.push(setTimeout(() => {
            void sync({ reason: 'load' }).then((report) => {
              if (report?.message) log.info(`[cc-switch-local] ${report.message}`)
              for (const warning of report?.warnings ?? []) log.warn(`[cc-switch-local] ${warning}`)
            })
          }, cfg.loadDelayMs))
        }
        if (Number.isFinite(cfg.watchSeconds) && cfg.watchSeconds > 0) {
          const watchPath = cfg.dbPath !== '' ? cfg.dbPath : resolvePaths({ dbPath: '' }).database
          const stampOf = () => `${databaseStamp(watchPath) ?? 'missing'}|${liveConfigStamp()}`
          runtime.lastStamp = stampOf()
          timers.push(setInterval(() => {
            const stamp = stampOf()
            if (stamp === runtime.lastStamp) return
            runtime.lastStamp = stamp
            void sync({ reason: 'watch' }).then((report) => {
              if (report?.message) log.info(`[cc-switch-local] ${report.message}`)
            })
          }, cfg.watchSeconds * 1000))
        }
        return () => {
          for (const timer of timers) {
            clearTimeout(timer)
            clearInterval(timer)
          }
        }
      })
    })
  }

  // ── Web 面板 RPC ─────────────────────────────────────────────────────────

  if (typeof ctx.inject === 'function') {
    // `connection.rpc.handle` 在内部用 owner.webServer.register 暴露通道，
    // 所以消费方上下文必须同时注入 webServer，否则注册会抛
    // `cannot get property "webServer" without inject`。
    ctx.inject(['connection', 'webServer'], (scope) => {
      runtime.rpcInjectRan = true
      scope.effect(() => {
        // `connection.rpc.handle` 内部执行 owner.webServer.register(route)，
        // 而 Cordis 的服务追踪会把 owner 解析成当前上下文。这里把 webServer
        // 作为显式属性挂到上下文上（与 dsh-mnemon 的做法一致），
        // 否则会抛 `cannot get property "webServer" without inject`。
        let owner = scope
        try {
          const webServer = scope.get('webServer')
          if (webServer !== undefined && typeof scope.extend === 'function') owner = scope.extend({ webServer })
        } catch {
          /* extend 不可用时退回 scope 本身 */
        }
        if (owner.connection === undefined || typeof owner.connection.rpc?.handle !== 'function') {
          runtime.rpcError = 'connection 服务没有 rpc.handle（当前组合可能不是 Web 载体）'
          return () => {}
        }
        let dispose
        try {
          dispose = owner.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload, _signal, peer) => {
          try {
            if (peer?.principal?.kind !== 'owner') {
              return { ok: false, error: { code: 'forbidden', message: '只有本机 owner 可以管理供应商', details: {} } }
            }
            const input = payload !== null && typeof payload === 'object' ? payload : {}
            if (endpoint === 'state') return { ok: true, value: await describe() }
            if (endpoint === 'sync') {
              const report = await sync({ reason: 'panel', dryRun: input.dryRun === true })
              return { ok: true, value: { report, state: await describe() } }
            }
            if (endpoint === 'mode') {
              const result = await setMode({ local: input.local, direct: input.direct })
              return { ok: true, value: { report: result.report, mode: result.mode, state: await describe() } }
            }
            if (endpoint === 'custom.save') {
              const result = await saveCustomProvider(input.provider ?? input)
              return { ok: true, value: { ...result, state: await describe() } }
            }
            if (endpoint === 'custom.remove') {
              const result = await removeCustomProvider(input)
              return { ok: true, value: { ...result, state: await describe() } }
            }
            if (endpoint === 'local.reasoning') {
              const result = await setLocalReasoning({ levels: input.levels })
              return { ok: true, value: { ...result, state: await describe() } }
            }
            if (endpoint === 'local.probe') {
              return { ok: true, value: await probeLocal() }
            }
            return { ok: false, error: { code: 'unknown-endpoint', message: `未知操作：${endpoint}`, details: {} } }
          } catch (error) {
            log.error(`[cc-switch-local] RPC ${endpoint} 失败：${error?.stack || error}`)
            return { ok: false, error: { code: 'internal', message: error?.message || String(error), details: {} } }
          }
          })
        } catch (error) {
          runtime.rpcError = error?.message || String(error)
          log.error(`[cc-switch-local] Web RPC 注册失败：${error?.stack || error}`)
          return () => {}
        }
        runtime.rpcRegistered = true
        runtime.rpcError = undefined
        return () => {
          runtime.rpcRegistered = false
          try {
            void dispose?.()
          } catch {
            /* 卸载失败无影响 */
          }
        }
      })
    })
  }

  // ── 工具 ─────────────────────────────────────────────────────────────────

  const actions = ['status', 'sync', 'plan', 'list', 'mode', 'local-probe', 'route-test', 'reasoning', 'custom-list', 'custom-save', 'custom-remove']

  function formatReport(report) {
    const lines = []
    lines.push(report.ok ? '✅ cc-switch Local 接入状态' : '⚠️ cc-switch Local 接入状态')
    lines.push(`· 数据源：${report.source}${report.sourcePath ? ` (${report.sourcePath})` : ''}`)
    lines.push(`· 目标条目：${report.targetEntry}（路由前缀 ${report.routePrefix}）`)
    if (report.mode) lines.push(`· 模式：本地路由 ${report.mode.local ? '开' : '关'} / 直连上游 ${report.mode.direct ? '开' : '关'}`)
    if (report.localRoute) {
      const local = report.localRoute
      lines.push(
        `· 本地路由：${local.baseURL} ${local.listening ? '✅ 监听中' : '❌ 未监听'}` +
          `${local.routed ? '（Claude Code 正在使用）' : ''}${local.currentProvider ? `，当前供应商 ${local.currentProvider}` : ''}`,
      )
      if (local.models?.length) lines.push(`  模型：${local.models.join(', ')}`)
    }
    if (report.routes) {
      if (report.snapshot === true) {
        lines.push(`· 已写入路由：${report.routes.total} 条`)
      } else {
        lines.push(
          `· 本次管理路由：${report.routes.total} 条（新增 ${report.routes.add.length}，更新 ${report.routes.update.length}，` +
            `删除 ${report.routes.remove.length}，未变 ${report.routes.unchanged.length}）`,
        )
      }
      for (const key of report.routes.conflicts) lines.push(`  - ⚠ ${key} 与已有配置同名，已按 onConflict 处理`)
      for (const [key, info] of Object.entries(report.routes.detail ?? {})) {
        const models = info.models?.length ? info.models.join(', ') : '(未声明模型)'
        lines.push(`  - ${key} → ${info.api} @ ${info.baseURL} [${models}]`)
      }
    }
    if (report.credentials) {
      lines.push(`· 凭据：写入 ${report.credentials.written}，清理 ${report.credentials.removed}`)
    }
    if (report.skipped?.length) {
      lines.push(`· 未导入 ${report.skipped.length} 项：`)
      for (const entry of report.skipped.slice(0, 20)) lines.push(`  - [${entry.appType}] ${entry.name}：${entry.reason}`)
    }
    for (const warning of report.warnings ?? []) lines.push(`· 提示：${warning}`)
    if (report.message) lines.push('', report.message)
    return lines.join('\n')
  }

  function formatDescribe(state) {
    const lines = [`CC Switch Local（${state.ccswitch.source}${state.ccswitch.path ? `：${state.ccswitch.path}` : ''}）`]
    if (state.localRoute) {
      lines.push(
        `本地路由 ${state.localRoute.baseURL}：${state.localRoute.listening ? '监听中' : '未监听'}` +
          `${state.localRoute.routed ? '，Claude Code 正在使用' : ''}` +
          `${state.localRoute.currentProvider ? `，当前供应商 ${state.localRoute.currentProvider}` : ''}`,
      )
      if (state.localRoute.models?.length) lines.push(`  模型：${state.localRoute.models.join(', ')}`)
      lines.push(
        `  思考等级：${reasoningLevelsLabel(state.localRoute.reasoningEfforts)}` +
          `${state.localRoute.effortLevel ? `（Claude Code 默认 ${state.localRoute.effortLevel}）` : ''}`,
      )
    }
    lines.push(`模式：本地路由 ${state.mode.local ? '开' : '关'} / 直连上游 ${state.mode.direct ? '开' : '关'}`)
    lines.push(`cc-switch 供应商（${state.ccswitch.providers.length}）：`)
    for (const provider of state.ccswitch.providers) {
      const mark = provider.importable ? (provider.routeKeys.length > 0 ? '✓' : '·') : '×'
      lines.push(
        `  ${mark} [${provider.appType}] ${provider.name}${provider.isCurrent ? '（当前）' : ''}` +
          `${provider.api ? ` → ${provider.api} @ ${provider.baseURL}` : ''}` +
          `${provider.models?.length ? ` [${provider.models.slice(0, 6).join(', ')}${provider.models.length > 6 ? ' …' : ''}]` : ''}` +
          `${provider.reason ? ` — ${provider.reason}` : ''}`,
      )
    }
    if (state.customProviders.length > 0) {
      lines.push(`自定义供应商（${state.customProviders.length}）：`)
      for (const provider of state.customProviders) {
        lines.push(
          `  · ${provider.displayName}（${provider.id}）→ ${provider.api} @ ${provider.baseURL} [${provider.models.join(', ')}]` +
            `${provider.hasKey ? '，Key 已保存' : '，Key 未保存'}` +
            `${provider.reasoningEfforts?.length ? `，思考等级 ${provider.reasoningEfforts.join(', ')}` : ''}`,
        )
      }
    }
    if (state.skipped.length > 0) {
      lines.push(`未导入（${state.skipped.length}）：`)
      for (const entry of state.skipped) lines.push(`  · [${entry.appType}] ${entry.name}：${entry.reason}`)
    }
    if (state.diagnostics !== undefined) {
      const d = state.diagnostics
      lines.push(
        `诊断：connection ${d.connection ? '✓' : '×'} / Web RPC ${d.rpcRegistered ? '✓' : '×'}` +
          `${d.rpcError ? `（${d.rpcError}）` : ''}`,
      )
    }
    return lines.join('\n')
  }

  /**
   * 通过 DSH 的 llm 服务真打一次模型请求，验证路由不只是在配置里存在。
   * 只发一个极小的请求（maxTokens 很小），失败时返回真实错误。
   */
  async function testRoute({ provider, model, effort } = {}) {
    const cfg = current()
    const llm = getService(ctx, 'llm')
    if (llm === undefined || typeof llm.stream !== 'function') {
      return { ok: false, message: '没有挂载 llm 服务，无法实测' }
    }
    const routeKey = typeof provider === 'string' && provider.trim() !== '' ? provider.trim() : `${cfg.routePrefix}-local-claude`
    let modelId = typeof model === 'string' && model.trim() !== '' ? model.trim() : ''
    if (modelId === '') {
      try {
        const models = await llm.listModels(routeKey)
        modelId = models[0]?.id ?? ''
      } catch (error) {
        return { ok: false, provider: routeKey, message: `路由未注册：${error?.message || error}` }
      }
    }
    if (modelId === '') return { ok: false, provider: routeKey, message: '该路由没有可用模型' }
    let text = ''
    let finish
    let usage
    try {
      const stream = llm.stream({
        provider: routeKey,
        model: modelId,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
        maxTokens: 16,
        ...(typeof effort === 'string' && effort !== '' ? { reasoningEffort: effort } : {}),
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'finish') finish = chunk.reason
        else if (chunk.type === 'usage') usage = chunk.usage
      }
    } catch (error) {
      return { ok: false, provider: routeKey, model: modelId, message: error?.message || String(error) }
    }
    const kind = finish?.kind
    const ok = kind === 'stop' || kind === 'max-tokens'
    return {
      ok,
      provider: routeKey,
      model: modelId,
      finish: kind,
      text,
      usage,
      message: ok ? '模型请求成功' : `模型请求结束于 ${kind ?? '未知状态'}${finish?.failure?.message ? `：${finish.failure.message}` : ''}`,
    }
  }

  const toolDefinition = {
    name: typeof config.toolName === 'string' && config.toolName.trim() !== '' ? config.toolName.trim() : 'cc_switch_local',
    description:
      '接入 cc-switch 的本地路由与供应商：读取 cc-switch 数据库和客户端配置，把「本地路由」接成 anthropic-messages 路由（与 Claude Code 共用），' +
      '也能直连导入上游供应商，并管理自定义供应商（openai-completions / openai-responses / anthropic-messages）。' +
      'action=status 看现状，action=sync 立即同步，action=plan 只预演，action=list 列出供应商，action=local-probe 检测本地路由，' +
      'action=reasoning 设置本地路由的思考等级，action=route-test 实测对话；' +
      'action=custom-list / custom-save / custom-remove 管理自定义供应商。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: actions, description: '要执行的操作' },
        app_types: { type: 'string', description: '本次要导入的 app 类型（逗号分隔），留空用插件配置' },
        include: { type: 'string', description: '本次只处理名称/ID 命中这些关键字的供应商（逗号分隔）' },
        exclude: { type: 'string', description: '本次排除名称/ID 命中这些关键字的供应商（逗号分隔）' },
        dry_run: { type: 'boolean', description: 'true=只预演不写入（action=sync 时有效）' },
        id: { type: 'string', description: '自定义供应商 id（custom-save 可省略，自动生成；custom-remove 必填）' },
        name: { type: 'string', description: '自定义供应商显示名' },
        api: { type: 'string', description: 'API 格式：openai-completions / openai-responses / anthropic-messages' },
        base_url: { type: 'string', description: '自定义供应商的 baseURL' },
        api_key: { type: 'string', description: '自定义供应商的 API Key（写入凭据存储，不回显）' },
        models: { type: 'string', description: '模型 id（逗号/换行分隔）' },
        local: { type: 'boolean', description: 'action=mode：是否启用本地路由' },
        direct: { type: 'boolean', description: 'action=mode：是否启用直连上游' },
        provider: { type: 'string', description: 'action=route-test：要测试的路由键，留空用本地路由' },
        model: { type: 'string', description: 'action=route-test：要测试的模型 id，留空用该路由第一个模型' },
        effort: { type: 'string', description: 'action=route-test：思考等级，如 low/high/max；留空用模型默认' },
        levels: { type: 'string', description: 'action=reasoning：本地路由思考等级，逗号分隔，如 low,medium,high,max（空字符串=关闭）' },
        reasoning: { type: 'string', description: 'action=custom-save：自定义供应商思考等级，逗号分隔，如 low,high,max' },
      },
      required: [],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          ok: { type: 'boolean' },
          source: { type: 'string' },
          routes: { type: 'number' },
          imported: { type: 'number' },
          skipped: { type: 'number' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text ?? '' }],
    },
    timeoutMs: 120000,
    isConcurrencySafe: () => false,
    presentCall: (args) => ({ card: 'generic', title: toolDefinition.name, kind: 'call', rawInput: args }),
    async execute(args = {}) {
      const action = typeof args.action === 'string' && actions.includes(args.action) ? args.action : 'status'
      const selection = {}
      if (typeof args.app_types === 'string' && args.app_types.trim() !== '') selection.appTypes = parseList(args.app_types)
      if (typeof args.include === 'string' && args.include.trim() !== '') selection.include = args.include
      if (typeof args.exclude === 'string' && args.exclude.trim() !== '') selection.exclude = args.exclude

      if (action === 'local-probe') {
        const probed = await probeLocal()
        const registryText = probed.registry === undefined
          ? ''
          : probed.registry.registered === true
            ? `，DSH 路由已注册（${probed.registry.models.length} 个模型）` +
              `${probed.registry.contextWindow ? `，上下文 ${probed.registry.contextWindow}` : ''}` +
              `${probed.registry.reasoning?.length ? `，思考等级 ${probed.registry.reasoning.join(', ')}${probed.registry.defaultEffort ? `（默认 ${probed.registry.defaultEffort}）` : ''}` : '，未启用思考等级'}`
            : `，但 DSH 路由未注册：${probed.registry.reason}`
        const text = probed.ok
          ? `✅ 本地路由健康：${probed.detection?.baseURL}（${probed.health.latencyMs}ms）${registryText}`
          : `❌ 本地路由不可用：${probed.health?.reason ?? probed.detection?.baseURL ?? '未知原因'}${registryText}`
        return { text, ok: probed.ok, source: 'cc-switch', routes: 0, imported: 0, skipped: 0 }
      }
      if (action === 'route-test') {
        const result = await testRoute({ provider: args.provider, model: args.model, effort: args.effort })
        const detail = result.ok
          ? `✅ 路由可用：${result.provider} / ${result.model}（finish=${result.finish}）${result.text ? `\n回复：${result.text.slice(0, 120)}` : ''}`
          : `❌ 路由不可用：${result.provider ?? ''}${result.model ? ` / ${result.model}` : ''}\n${result.message}`
        return { text: detail, ok: result.ok === true, source: 'cc-switch-local', routes: 1, imported: 1, skipped: 0 }
      }
      if (action === 'reasoning') {
        const result = await setLocalReasoning({ levels: args.levels ?? args.reasoning ?? '' })
        const text = formatReport(result.report)
        return {
          text: `本地路由思考等级已更新：${reasoningLevelsLabel(result.localReasoningEfforts)}\n\n${text}`,
          ok: result.report.ok === true,
          source: String(result.report.source ?? ''),
          routes: result.report.routes?.total ?? 0,
          imported: result.report.routes?.total ?? 0,
          skipped: result.report.skipped?.length ?? 0,
        }
      }
      if (action === 'mode') {
        const result = await setMode({ local: args.local, direct: args.direct })
        const text = formatReport(result.report)
        return {
          text: `模式已更新：本地路由 ${result.mode.local ? '开' : '关'} / 直连上游 ${result.mode.direct ? '开' : '关'}\n\n${text}`,
          ok: result.report.ok === true,
          source: String(result.report.source ?? ''),
          routes: result.report.routes?.total ?? 0,
          imported: result.report.routes?.total ?? 0,
          skipped: result.report.skipped?.length ?? 0,
        }
      }
      if (action === 'status' || action === 'list') {
        const state = await describe()
        const text = action === 'list'
          ? formatDescribe(state)
          : formatReport({
              ok: true,
              source: state.ccswitch.source,
              sourcePath: state.ccswitch.path,
              targetEntry: state.targetEntry,
              routePrefix: state.routePrefix,
              mode: state.mode,
              localRoute: state.localRoute,
              snapshot: true,
              routes: {
                total: state.routes.length,
                add: [],
                update: [],
                remove: [],
                unchanged: [],
                conflicts: [],
                detail: Object.fromEntries(state.routes.map((route) => [
                  route.key,
                  { api: route.api, baseURL: route.baseURL, displayName: route.displayName, models: route.models, kind: 'managed' },
                ])),
              },
              skipped: state.skipped,
              warnings: [],
            })
        return { text, ok: true, source: state.ccswitch.source, routes: state.routes.length, imported: state.routes.length, skipped: state.skipped.length }
      }
      if (action === 'custom-list') {
        const state = await describe()
        return { text: formatDescribe(state), ok: true, source: state.ccswitch.source, routes: state.routes.length, imported: state.routes.length, skipped: state.skipped.length }
      }
      if (action === 'custom-save') {
        const result = await saveCustomProvider({
          id: args.id,
          displayName: args.name,
          api: args.api,
          baseURL: args.base_url,
          apiKey: args.api_key,
          models: typeof args.models === 'string' ? customModelsOf(args.models) : args.models,
          reasoningEfforts: args.reasoning,
        })
        if (!result.ok) return { text: `❌ 保存失败：${result.message ?? result.report?.message ?? '未知原因'}`, ok: false, source: 'cc-switch-local', routes: 0, imported: 0, skipped: 0 }
        const state = await describe()
        return { text: `✅ 已保存自定义供应商 ${args.name ?? args.id}\n\n${formatDescribe(state)}`, ok: true, source: state.ccswitch.source, routes: state.routes.length, imported: state.routes.length, skipped: state.skipped.length }
      }
      if (action === 'custom-remove') {
        const result = await removeCustomProvider({ id: args.id })
        if (!result.ok) return { text: `❌ 删除失败：${result.message ?? result.report?.message ?? '未知原因'}`, ok: false, source: 'cc-switch-local', routes: 0, imported: 0, skipped: 0 }
        const state = await describe()
        return { text: `✅ 已删除自定义供应商 ${args.id}\n\n${formatDescribe(state)}`, ok: true, source: state.ccswitch.source, routes: state.routes.length, imported: state.routes.length, skipped: state.skipped.length }
      }

      const dryRun = action === 'plan' || args.dry_run === true
      const report = await sync({ reason: `tool:${action}`, dryRun, selection })
      const text = action === 'list' ? formatReport(report) : formatReport(report)
      return {
        text,
        ok: report.ok === true,
        source: String(report.source ?? ''),
        routes: report.routes?.total ?? 0,
        imported: report.routes?.total ?? 0,
        skipped: report.skipped?.length ?? 0,
      }
    },
  }

  try {
    ctx.tools.register(toolDefinition)
    log.debug(`已注册工具 ${toolDefinition.name}`)
  } catch (error) {
    log.error(`[cc-switch-local] 工具注册失败：${error?.message || error}`)
  }
}

/** 供测试与自检使用。 */
export const __internal = {
  DEFAULT_APP_TYPES,
  parseList,
  parseFilters,
  selectRecords,
  maskKey,
  normalizeCustomApi,
  normalizeCustomProvider,
  sanitizeCustomProvider,
}
