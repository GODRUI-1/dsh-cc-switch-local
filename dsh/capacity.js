/**
 * 从模型 id 推断容量（上下文窗口 / 最大输出）。
 *
 * 为什么需要：pi-ai 的手写路由默认 contextWindow = 262144。如果实际模型是
 * 1M 上下文（名字里的 `[1M]`），会话超过 262k 后适配器会把 max_tokens 夹到
 * 极小值，模型只吐一个 token（典型表现：输出 1 token、finish=max-tokens、
 * 只有 "The" 这种残缺回复），压缩也会因为「token 上限」失败。
 *
 * 这里只对能明确判断的命名做推断，显式声明的 contextWindow / maxTokens 优先。
 */

/** `[1M]` 模型的容量。 */
export const ONE_MILLION_CONTEXT = 1_000_000
export const ONE_MILLION_MAX_OUTPUT = 65_536

/** 普通 Claude 模型的容量（Anthropic 当前公开值）。 */
export const CLAUDE_CONTEXT = 200_000
export const CLAUDE_MAX_OUTPUT = 32_768

/**
 * @param {string} id 模型 id，例如 `claude-opus-4-8[1M]`
 * @returns {{ contextWindow: number, maxTokens: number } | undefined}
 */
export function inferModelCapacity(id) {
  const text = String(id ?? '').trim()
  if (text === '') return undefined
  if (/\[1m\]/i.test(text)) {
    return { contextWindow: ONE_MILLION_CONTEXT, maxTokens: ONE_MILLION_MAX_OUTPUT }
  }
  if (/^claude-(opus|sonnet|haiku|fable)/i.test(text)) {
    return { contextWindow: CLAUDE_CONTEXT, maxTokens: CLAUDE_MAX_OUTPUT }
  }
  return undefined
}
