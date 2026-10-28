# Contributing

欢迎二次开发。这个插件刻意保持**零运行时依赖**：一个 Host 半、一个 Client 半、
一组纯函数模块，改完就能用 `node --check` 和单元测试验证。

## 开发环境

- Node.js >= 22.13（需要 `node:sqlite`；DSH 自带 Node 24 满足）
- DSH 已安装，且 profile 里能加载 bundle
- 不需要 `pnpm install`：本包没有运行时依赖

```sh
git clone <your-fork>
cd dsh-cc-switch-local
node --test test/unit.test.mjs
npm pack --dry-run        # 确认 tarball 只含运行时文件
```

## 本地安装 / 调试

DSH 的 profile 是插件包的父级；最简单的做法是用 DSH 的插件管理器把**目录**
安装成 bundle（`plugin_manager install_bundle`，target 为本目录绝对路径），
或在 profile 里用 `link:`：

```sh
dsh plugin --profile web add "link:/absolute/path/to/dsh-cc-switch-local"
```

调试循环：

1. 改 Host 代码（`dsh/`）后，在「设置 → 插件」里把 `cc-switch-local` 关掉再打开，
   让 Host 模块重新加载；
2. 改 Client 代码（`client.js`）后刷新页面；
3. `cc_switch_local action=list` 会显示 `connection ✓ / Web RPC ✓`，用来确认
   Host RPC 通道已注册。

## 代码地图

| 文件 | 职责 |
| --- | --- |
| `dsh/index.js` | Host 插件：同步、Web RPC、`cc_switch_local` 工具、自动轮询 |
| `dsh/ccswitch.js` | 只读读取 cc-switch SQLite（WAL 时复制快照）与旧版 JSON |
| `dsh/convert.js` | cc-switch 供应商 → pi-ai 路由变体（含协议/端点/模型） |
| `dsh/localroute.js` | 本地路由探测：proxy_config、客户端配置、模型、effort |
| `dsh/custom.js` | 自定义供应商归一化与变体生成 |
| `dsh/plan-pro.js` | 同步计划、路由所有权、子集比较 |
| `dsh/state-pro.js` | 清单文件（路由/凭据引用/自定义供应商/模式） |
| `dsh/capacity.js` | 从模型名推断 `contextWindow` / `maxTokens` |
| `dsh/reasoning.js` | 思考等级归一化与 pi-ai `reasoningEfforts` 映射 |
| `client.js` | 「设置 → CC Switch」页面、语言切换、RPC 调用 |

数据流：

```text
cc-switch DB + ~/.claude/settings.json
        │
        ├─ localroute.js / convert.js / custom.js
        ▼
   plan-pro.js（只增删自己写过的 ccswitchlocal-*）
        ▼
settings.mutate('llm-pi-ai')  +  credentials.set(...)
        ▼
DSH 模型选择器 / pi-ai 适配器
```

## 所有权和安全

- 只管理 `ccswitchlocal-` 前缀、且记在 `$DSH_HOME/cc-switch-local-state.json` 里的路由；
- 绝不删除用户手写或其它插件写入的 `llm-pi-ai` 路由；
- 真实 API Key 只进 harness 凭据存储，**不要**提交
  `~/.dsh/.credentials.yaml`、`cc-switch-local-state.json` 或带真实 Key 的
  `cordis.patch.yml`；
- README / 测试里的 `sk-...` 一律是占位符。如果你在 issue/PR 里贴了真实 Key，
  先去供应商后台轮换。

## 测试与发布

提交前：

```sh
node --test test/unit.test.mjs
for f in dsh/*.js client.js; do node --check "$f"; done
npx tsc --noEmit 2>/dev/null || true   # 本包没有 TS 工程，可忽略
npm pack --dry-run
```

发布：

```sh
npm version minor
# 更新 CHANGELOG.md
npm publish --access public
git push --follow-tags
```

## License

MIT。`dsh/convert.js`、`dsh/ccswitch.js`、`dsh/toml.js` 的部分逻辑来自
[LightingHa/dsh-cc-switch](https://github.com/LightingHa/dsh-cc-switch)（MIT），
衍生作品保留原版权声明；详见 [LICENSE](LICENSE)。
