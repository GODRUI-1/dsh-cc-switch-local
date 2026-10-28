# Changelog

## 0.2.0

- 项目/包名从 `dsh-cc-switch-pro` 更名为 `dsh-cc-switch-local`；路由前缀改为
  `ccswitchlocal`，旧清单会在首次同步时被读取并清理旧路由/旧凭据。

- 新增「思考等级」：本地路由与自定义供应商都可以勾选
  `low / medium / high / xhigh / max`，写入 pi-ai 的 `reasoningEfforts`。
- 设置页默认中文，新增 `中文 / EN` 切换（`localStorage` 记忆）。
- 修复 Web RPC 未注册导致的 `HTTP 405`：注册 `connection.rpc` 时同时注入
  `webServer`，并把 `webServer` 作为显式属性挂到上下文。
- 修复设置页 `Failed to load plugins / failed`：Client 半补齐
  `inject: ['slots', 'locale', 'connection']`。
- 按模型名推断上下文容量：`[1M]` → 1,000,000 / 65,536，`claude-*` →
  200,000 / 32,768；修复长会话「只输出 1 个 token、finish=max-tokens」。
- 读取 `CLAUDE_CODE_EFFORT_LEVEL` 作为本地路由的默认 `reasoning`；
  读取 `*_MODEL_NAME` 生成「Opus · deepseek-...」这类槽位展示名。
- `local-probe` 增加上下文与思考等级诊断。

## 0.1.0

- 首个版本：读取 cc-switch 数据库与本地路由，导入直连供应商，支持自定义供应商
  （openai-completions / openai-responses / anthropic-messages），写入
  `llm-pi-ai` 并管理凭据。
