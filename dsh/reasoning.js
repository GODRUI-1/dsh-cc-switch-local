/**
 * 思考等级（reasoning efforts）的归一化与 pi-ai 映射。
 *
 * pi-ai 的模型条目用 `reasoningEfforts` 对象声明「这个模型支持哪些思考等级、
 * 每个等级发给上游的 wire 值是什么」。例如：
 *
 *   reasoningEfforts:
 *     off: null
 *     low: low
 *     medium: medium
 *     high: high
 *     max: max
 *
 * `off: null` 表示支持关闭思考、且关闭时不发送任何参数；其余等级必须给出
 * 非空字符串。没有声明的等级会被 pi-ai 固定为「不支持」，所以这里只生成
 * 用户在面板里勾选的等级，并始终补上 `off`。
 */

/** pi-ai 接受的思考等级（顺序即 UI 顺序）。 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/** 面板里提供给用户勾选的等级（off 隐式支持，不单独展示）。 */
export const OFFERED_THINKING_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

/** 单个等级归一化（保留 off）。 */
export function normalizeEffortLevel(value) {
  const level = String(value ?? '').trim().toLowerCase()
  return THINKING_LEVELS.includes(level) ? level : undefined
}

/** 把各种来源的等级声明整理成去重、有序的数组（不含 off）。 */
export function normalizeReasoningLevels(value) {
  let raw = []
  if (Array.isArray(value)) raw = value
  else if (typeof value === 'string') raw = value.split(/[,;，；\s]+/)
  else if (value !== null && typeof value === 'object') {
    // 允许配置文件直接写 pi-ai 风格的 { low: 'low', high: 'high' }
    raw = Object.entries(value)
      .filter(([, wire]) => wire !== null && wire !== false && wire !== '')
      .map(([level]) => level)
  }
  const out = []
  for (const item of raw) {
    const level = String(item ?? '').trim().toLowerCase()
    if (!THINKING_LEVELS.includes(level) || level === 'off') continue
    if (!out.includes(level)) out.push(level)
  }
  return THINKING_LEVELS.filter((level) => out.includes(level))
}

/**
 * 等级数组 -> pi-ai `reasoningEfforts` 对象。
 * 没有勾选任何等级时返回 undefined（保持模型原样，不出现思考控制）。
 */
export function reasoningEffortsMap(levels) {
  const normalized = normalizeReasoningLevels(levels)
  if (normalized.length === 0) return undefined
  const out = { off: null }
  for (const level of normalized) out[level] = level
  return out
}

/** 展示用：'low, high, max'。 */
export function reasoningLevelsLabel(levels) {
  const normalized = normalizeReasoningLevels(levels)
  return normalized.length === 0 ? '未启用' : normalized.join(', ')
}
