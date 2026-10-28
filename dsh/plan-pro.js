/**
 * 同步计划（Pro）：把已经生成好的路由变体变成「要往 llm-pi-ai 写什么」。
 *
 * 与 dsh-cc-switch 的 plan.js 同构，但输入不再是 cc-switch 记录，而是三类
 * 变体合流后的结果：直连上游、本地路由、自定义供应商。所有权模型保持不变：
 * 只管理清单里记录过的路由键，绝不删除别人的配置。
 */

/** 是否为本插件生成的路由键。 */
export function isOwnedKey(key, prefix = 'ccswitchlocal') {
  return typeof key === 'string' && key.startsWith(`${prefix}-`)
}

/** 深比较（只用于普通 JSON 数据）。 */
export function sameJson(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => sameJson(item, b[index]))
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]))
}

/**
 * 读回来的路由是否已经和要写的一致。
 *
 * `settings.describe()` 返回的是 schemastery 解析后的配置：pi-ai 会给每个模型
 * 补上 `input`、`reasoningEfforts` 等默认字段。全等比较会把「本来就没变」误判成
 * 每轮都变，于是每次同步都重写一次配置。这里逐层做子集比较：只要求我们生成的
 * 字段都存在且相等，用户或适配器补的字段一律忽略。
 */
export function profileMatches(existing, generated) {
  return subsetMatches(existing, generated)
}

/** 递归子集比较：对象只比 generated 的键；数组要求同长并逐项子集比较。 */
export function subsetMatches(existing, generated) {
  if (generated === null || typeof generated !== 'object') return existing === generated
  if (Array.isArray(generated)) {
    if (!Array.isArray(existing) || existing.length !== generated.length) return false
    return generated.every((item, index) => subsetMatches(existing[index], item))
  }
  if (existing === null || typeof existing !== 'object') return false
  return Object.entries(generated).every(([key, value]) => subsetMatches(existing[key], value))
}

/** 差异字段（诊断用）。 */
export function profileDiffKeys(existing, generated) {
  if (existing === null || typeof existing !== 'object') return Object.keys(generated)
  return Object.entries(generated)
    .filter(([key, value]) => !subsetMatches(existing[key], value))
    .map(([key]) => key)
}

/**
 * 构造同步计划。
 * @param options.variants - `{ routeKey, profile, apiKey, apiKeyEnv, source, problems }[]`
 * @param options.config - `{ routePrefix, onConflict, importUnsupported, pruneOwnedRoutes }`
 * @param options.currentProviders - 目标条目当前的 providers 字典
 * @param options.manifest - 上一次同步的清单
 * @param options.credentialState - `{ [ref]: { value, source } }`
 */
export function buildPlanPro({
  variants = [],
  config = {},
  currentProviders = {},
  manifest = { routes: [], credentials: [] },
  credentialState = {},
} = {}) {
  const prefix = config.routePrefix ?? 'ccswitchlocal'
  const ownedLast = new Set(Array.isArray(manifest.routes) ? manifest.routes : [])
  const ownedCredentialsLast = new Set(Array.isArray(manifest.credentials) ? manifest.credentials : [])
  const onConflict = config.onConflict === 'overwrite' ? 'overwrite' : 'skip'
  const importUnsupported = config.importUnsupported === true

  const routes = {}
  const credentials = []
  const credentialValues = {}
  const skipped = []
  const warnings = []
  const conflicts = []
  const add = []
  const update = []
  const unchanged = []
  const sources = {}

  for (const variant of variants) {
    const problems = Array.isArray(variant.problems) ? variant.problems : []
    if (problems.length > 0 && !importUnsupported) {
      skipped.push({
        appType: variant.source?.appType ?? 'unknown',
        name: variant.source?.name ?? variant.routeKey,
        id: variant.source?.id,
        reason: problems.join('；'),
      })
      continue
    }
    const routeKey = variant.routeKey
    const profile = variant.profile
    const existing = Object.hasOwn(currentProviders, routeKey) ? currentProviders[routeKey] : undefined
    const owned = ownedLast.has(routeKey)
    if (existing !== undefined && !owned && onConflict === 'skip') {
      conflicts.push(routeKey)
      warnings.push(`路由键 "${routeKey}" 已被 llm-pi-ai 里的其它配置占用，已跳过（如需覆盖请把 onConflict 设为 "overwrite"）`)
      continue
    }
    routes[routeKey] = profile
    sources[routeKey] = variant.source ?? { appType: 'unknown', name: routeKey }
    if (variant.apiKeyEnv !== undefined) {
      // 即使这条路由的 Key 已直接写进凭据存储（自定义供应商），也要把引用记进
      // managedCredentials，否则本轮同步会把它当成「不再使用」而误删。
      credentials.push({ ref: variant.apiKeyEnv, value: variant.apiKey, routeKey })
      credentialValues[variant.apiKeyEnv] = variant.apiKey ?? ''
    }
    if (existing === undefined) add.push(routeKey)
    else if (profileMatches(existing, profile)) unchanged.push(routeKey)
    else update.push(routeKey)
  }

  const remove = []
  if (config.pruneOwnedRoutes !== false) {
    for (const key of ownedLast) {
      if (Object.hasOwn(routes, key)) continue
      if (!Object.hasOwn(currentProviders, key)) continue
      remove.push(key)
    }
  }

  const credentialWrites = []
  const credentialSkips = []
  for (const entry of credentials) {
    if (typeof entry.value !== 'string' || entry.value === '') continue
    const state = credentialState[entry.ref]
    if (state !== undefined && state.source === 'env') {
      credentialSkips.push({ ref: entry.ref, reason: '同名凭据由启动环境提供（只读），已跳过写入' })
      continue
    }
    if (state !== undefined && state.value === entry.value) continue
    credentialWrites.push(entry)
  }
  const credentialRemovals = []
  if (config.pruneOwnedRoutes !== false) {
    for (const ref of ownedCredentialsLast) {
      if (Object.hasOwn(credentialValues, ref)) continue
      if (credentialState[ref] === undefined || credentialState[ref].source === 'env') continue
      credentialRemovals.push(ref)
    }
  }

  const changed =
    add.length > 0 || update.length > 0 || remove.length > 0 || credentialWrites.length > 0 || credentialRemovals.length > 0

  return {
    prefix,
    routes,
    sources,
    add,
    update,
    remove,
    unchanged,
    conflicts,
    skipped,
    warnings,
    credentials,
    credentialWrites,
    credentialRemovals,
    credentialSkips,
    managedRoutes: Object.keys(routes).sort(),
    managedCredentials: [...new Set(credentials.map((entry) => entry.ref))].sort(),
    changed,
  }
}

/** 供状态汇报：目标条目里属于本插件的路由键。 */
export function ownedRoutesIn(currentProviders = {}, prefix = 'ccswitchlocal', manifest = {}) {
  const known = new Set(Array.isArray(manifest.routes) ? manifest.routes : [])
  return Object.keys(currentProviders)
    .filter((key) => known.has(key) || isOwnedKey(key, prefix))
    .sort()
}
