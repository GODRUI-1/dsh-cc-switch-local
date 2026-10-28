# dsh-cc-switch-local

把 **cc-switch 的本地路由**、cc-switch 里的供应商、以及**自己声明的供应商**一起接进
DeepSeek Harness。和 `dsh-cc-switch` 相比，补上的正是最容易卡住的那一块：
**本地路由（127.0.0.1:15721）没有被当成一条可用路由接进来**。

```
cc-switch                                     DeepSeek Harness
──────────                                    ─────────────────
providers 表 ──────┐
proxy_config ──────┤   localroute.js / custom.js / plan-pro.js
~/.claude/settings ┼──────────────►  路由变体  ──────────►  llm-pi-ai providers
~/.codex/config    │                  │                     ├─ ccswitchlocal-local-claude
自定义供应商 ───────┘                  │                     ├─ ccswitchlocal-claude-*
                                     └── 凭据存储 ◄──────────┘
```

两条关键事实（实测）：

- cc-switch 本地路由在 `127.0.0.1:15721` 监听时，Claude Code 的
  `ANTHROPIC_BASE_URL` 就是它，Key 是占位符 `PROXY_MANAGED`；
- DSH 用 **anthropic-messages** 协议打同一个地址，会走和 Claude Code 完全相同的
  路由：cc-switch 里换供应商、开故障转移，DSH 下一次请求立即生效。

## cc-switch 字段怎么用

| cc-switch 字段 | 插件里的用途 |
| --- | --- |
| `ANTHROPIC_BASE_URL` | 直连模式的 `baseURL`；本地模式改用 `proxy_config` 的监听地址 |
| `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` | 直连模式写进凭据存储；本地模式客户端只用 `PROXY_MANAGED` |
| `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU,FABLE}_MODEL` | 本地路由的模型 id（例如 `claude-opus-4-8[1M]`） |
| `*_MODEL_NAME` | 拼成展示名，例如 `Opus · deepseek-v4.1-flash-1017`，避免四个槽位同名 |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 也作为本地路由模型提供（`[1M]` 会按 1M 上下文处理） |
| `CLAUDE_CODE_EFFORT_LEVEL` | 路由级默认思考等级，写入 pi-ai profile 的 `reasoning` |
| `meta.apiFormat` | 直连协议；`openai_chat` → `openai-completions` |
| `proxy_config` | 本地路由地址/端口/监听判断 |
| `proxy_request_logs` | 用真实用过的模型名补充模型清单 |
| `is_current` | 当前供应商展示、本地路由接管判定 |
| `theme` | 与模型无关，忽略 |

故障转移队列、重试、超时、断路器这些属于「本地路由」本身，插件不复制一份，
DSH 请求经过 127.0.0.1:15721 时直接复用 cc-switch 的设置。

---

## 为什么「OpenAI Chat Completions 需要开启路由」

cc-switch 里给 Claude Code 选 **OpenAI Chat Completions** 作为上游格式时，界面会提示
需要开启本地路由：Claude Code 只会说 Anthropic Messages，必须由 cc-switch 把请求
转成 Chat Completions 再发出去。

在 DSH 里有两种用法，本插件都覆盖：

1. **本地路由模式**（推荐）：DSH 说 Anthropic Messages → cc-switch 转成 Chat
   Completions → 上游。和 Claude Code 共用一条路由。
2. **直连模式**：DSH 的 pi-ai 适配器本身就说 OpenAI Chat Completions，直接连
   `baseURL`，不需要 cc-switch 在场。

两种模式可以同时开：当前 Claude 供应商由本地路由接管，其余供应商走直连。

---

## 已安装状态

本插件已通过 `plugin_manager` 安装进 `web` profile（`link:` 到当前目录），
`cc-switch-local` 条目已在运行。**Web 页面需要刷新一次**，新的设置页才会出现。

装好后：

- 侧栏「设置 → **CC Switch**」打开管理面板；
- 模型选择器里出现 `cc-switch 本地路由 · <当前供应商>` 这条路由；
- 工具列表里出现 `cc_switch_local`。

## 设置面板

「设置 → CC Switch」提供（默认中文，右上角可切 `中文 / EN`）：

- 本地路由状态：地址、监听、Claude Code 是否正在使用、当前供应商、可用模型；
  「检测」会同时检查 `/health`、DSH 路由注册和思考等级；
- 本地路由的**思考等级**：`低 / 中 / 高 / 超高 / 最高` 五个 chip，勾选后立即写入
  本地路由的每个模型；DSH 的模型选择器里就会出现对应的思考等级控制；
- 路由模式：**本地路由**、**直连上游**两个开关，随时切换，立即重写路由；
- cc-switch 供应商列表：哪家已接入、哪家被本地路由接管、哪家为什么不能接入；
- 自定义供应商：新增 / 编辑 / 删除，API 格式可选
  **OpenAI Chat Completions / OpenAI Responses / Anthropic Messages**，并可给该供应商的
  所有模型勾选思考等级；
- 已写入 DSH 的路由清单；
- 「立即同步」按钮。

Key 只写入 harness 凭据存储，面板只显示「已保存 / 未保存」，不回显明文。

## 配置文件里的自定义供应商

除了面板，也可以直接写在 `~/.dsh/profiles/web/cordis.patch.yml` 的插件配置里：

```yaml
- id: cc-switch-local
  name: 'dsh-cc-switch-local'
  config:
    includeLocalRoute: true
    includeDirectRoutes: true
    customProviders:
      - id: my-gateway
        displayName: My Gateway
        api: openai-completions        # openai-completions | openai-responses | anthropic-messages
        baseURL: https://gateway.example.com/v1
        apiKey: sk-...                 # 同步时写入凭据存储，不落 cordis.patch.yml
        models:
          - id: deepseek-chat
          - id: deepseek-reasoner
            contextWindow: 131072
            maxTokens: 8192
        reasoningEfforts: low,high,max   # 可选：low / medium / high / xhigh / max
```

面板保存的供应商写在 `$DSH_HOME/cc-switch-local-state.json`，同 id 时面板来源优先。
两条来源合并后统一同步。配置文件来源的供应商在面板里可以编辑（会生成一条面板覆盖），
删除需要改配置文件；面板来源的供应商可以直接在面板里删除。

插件本身没有运行时依赖（不需要 `pnpm install`），`link:` 安装即可加载。

## 工具：`cc_switch_local`

| action | 作用 |
| --- | --- |
| `status` | 本地路由、模式、已写路由、未接入原因 |
| `sync` | 立即同步（`dry_run: true` 只预演） |
| `plan` | 只计算不写入 |
| `list` | 列出 cc-switch 供应商与路由 |
| `mode` | 传 `local` / `direct` 布尔值切换模式 |
| `local-probe` | 检测本地路由健康、DSH 路由注册与思考等级 |
| `reasoning` | 设置本地路由思考等级，`levels="low,high,max"`（空字符串=关闭） |
| `route-test` | 通过 DSH 的 llm 适配器真打一次极小请求，验证路由真的能对话 |
| `custom-list` | 列出自定义供应商 |
| `custom-save` | 传 `id`/`name`/`api`/`base_url`/`api_key`/`models`/`reasoning` 新增或更新 |
| `custom-remove` | 传 `id` 删除，并清理它写过的路由与凭据 |

示例：

```text
cc_switch_local action=local-probe
cc_switch_local action=custom-save name="My Gateway" api=openai-completions \
              base_url=https://gateway.example.com/v1 api_key=sk-... \
              models="deepseek-chat,deepseek-reasoner"
cc_switch_local action=mode local=false direct=true
cc_switch_local action=reasoning levels="low,high,max"
```

## 所有权与清理

- 只管理 `ccswitchlocal-` 前缀、且记在清单里的路由；手写或其它插件的路由永不被删；
- 清单：`$DSH_HOME/cc-switch-local-state.json`（路由、凭据引用、自定义供应商、模式）；
- cc-switch 数据库只读：只读打开，WAL 占用时复制快照再读，绝不写回；
- 本地路由的 Key 固定写 `PROXY_MANAGED`，真实 Key 留在 cc-switch。

## 从 dsh-cc-switch-pro 升级

包名、路由前缀（`ccswitchpro-*` → `ccswitchlocal-*`）和状态文件名都变了：

1. 先从 profile 移除旧 bundle；
2. 安装 `dsh-cc-switch-local`；
3. 新插件会读取旧的 `cc-switch-pro-state.json`，首次同步时把旧路由和旧凭据
   一起清理，然后再写新前缀的路由。

## 与 dsh-cc-switch 的关系

两个插件可以并存，但会各自生成一组路由。要避免模型选择器里出现两套同名供应商，
在「设置 → 插件」里停用旧的 `dsh-cc-switch` 即可；本插件已经覆盖它的直连导入能力，
并额外提供本地路由与自定义供应商：

- 旧：`ccswitch-claude-morouter`（直连）
- 新：`ccswitchlocal-local-claude`（本地路由，默认）+ `ccswitchlocal-claude-*`（直连模式）

## 主要配置项

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `includeLocalRoute` | `true` | 接入本地路由 |
| `includeDirectRoutes` | `true` | 直连导入 cc-switch 供应商 |
| `routePrefix` | `ccswitchlocal` | 路由名前缀，也是所有权判定 |
| `targetEntry` | `llm-pi-ai` | 写入哪个条目 |
| `watchSeconds` | `30` | 数据库变化轮询；`0` 关闭 |
| `syncOnLoad` | `true` | 加载后自动同步一次 |
| `customProviders` | `[]` | 配置文件来源的自定义供应商 |
| `toolName` | `cc_switch_local` | 工具名 |
| `debug` | `false` | 输出同步细节 |

## 排错

- **面板里说「未监听」**：在 cc-switch 的应用页点「开始路由」，或到
  「设置 → 本地路由」启动服务；确认 `127.0.0.1:15721` 有监听。
- **本地路由在跑，但显示「Claude Code 处于直连模式」**：先在 cc-switch 的
  Claude Code 应用页点「开始路由」；本地路由需要有一个转发目标。
- **本地路由在跑，但没有模型**：检查 `~/.claude/settings.json` 里的
  `ANTHROPIC_DEFAULT_*_MODEL`；DSH 用这些模型名向本地路由发请求。
- **面板没出现**：安装后刷新一次页面；仍没有就重启 DSH。
- **刷新后显示 `Failed to load plugins` / `dsh-cc-switch-local: failed`**：这是
  Client 半在 `apply` 时用到了 `ctx.locale` / `ctx.connection`，但没有在插件对象里
  声明 `inject: ['slots', 'locale', 'connection']`，导致 locale 尚未挂载时直接抛错。
  0.1.1 已修复；重新安装后刷新页面即可。
- **面板显示 `transport failure ... HTTP 405`**：Host 的 Web RPC 通道没有注册。
  `connection.rpc.handle` 内部要用 `owner.webServer.register` 暴露通道，所以消费方
  上下文必须同时注入 `webServer`，并把 `webServer` 作为显式属性挂到上下文上
  （与 dsh-mnemon 的做法一致）。0.1.2 已修复；插件重载后点面板的「刷新」即可，
  不需要再次刷新整个页面。
- **长会话只回一个 token / `finish=max-tokens`**：模型的 `contextWindow` 太小。
  0.2.0 会按 `[1M]` 推断 1,000,000 上下文，同步后 `local-probe` 会显示
  `上下文 1000000`；旧会话如果已经卡在失败的压缩检查点，开一个新会话最稳。
- **模型选择器里看不到新路由**：点「立即同步」，再到「设置 → 模型」确认；
  `cc_switch_local action=status` 会显示它管理的路由。
- **改了插件源码**：`link:` 安装是即时链接，但宿主模块需要重新加载；在
  「设置 → 插件」里关掉再打开 `cc-switch-local` 即可（Client 模块仍需刷新页面）。

## 发布到 npm / 插件市场

这个包已经按 DSH bundle 的发布形态准备好（`private` 已去掉，`publishConfig`
为 public，`files` 只包含运行时文件）。npm 上 `dsh-cc-switch-local` 目前未被占用，
可以直接用这个包名。

发布前：

```sh
npm pack --dry-run        # 检查 tarball 内容，不应出现 node_modules / test
npm test                  # 14 项单元测试
npm version patch         # 或 minor / major，并更新 CHANGELOG
```

发布：

```sh
npm login                 # 需要 npm 账号与 2FA
npm publish --access public
npm view dsh-cc-switch-local version
```

发布后在一个**干净 profile** 里验收（不要用当前 `link:` 安装的 profile）：

```sh
dsh plugin --profile verify add dsh-cc-switch-local
dsh --profile verify web
```

验收清单：

- 「设置 → CC Switch」页面出现，默认中文；
- `cc_switch_local action=local-probe` 能看到本地路由、上下文和思考等级；
- `cc_switch_local action=route-test` 能真实返回；
- 自定义供应商增删改、路由模式切换正常；
- 刷新页面不出现 `Failed to load plugins`。

要进插件市场（dsh-market / awesome-dsh-plugin），需要把包发布到 npm 后提交一条
市场条目；包里的 `dsh.catalog`（分类、双语文案、能力列表）、`locale/*.json`
和 `icon.svg` 就是市场卡片读取的元数据。

> 当前环境 `npm whoami` 是 `ENEEDAUTH`，所以发布这一步需要你登录 npm 后执行；
> 我这边已经把包准备到可发布状态并用 `npm pack` 验证了内容。

## 私人 GitHub 仓库 / 二次开发

这个目录已经准备好 git 仓库所需的文件（`LICENSE`、`.gitignore`、
`CONTRIBUTING.md`）。创建**私有**仓库并推送：

```sh
# 本机目录当前仍叫 dsh-cc-switch-pro；GitHub 仓库名用 dsh-cc-switch-local
cd /home/izayoi/桌面/dsh-cc-switch-pro

# 方式 A：GitHub CLI（需先 gh auth login）
gh repo create dsh-cc-switch-local --private --source=. --remote=origin --push

# 方式 B：先在网页创建 private repo，再：
git remote add origin git@github.com:<你的用户名>/dsh-cc-switch-local.git
git push -u origin main
```

SSH 推送失败时，把 `~/.ssh/id_ed25519_srv.pub`（或你自己的公钥）加到 GitHub
的 SSH keys，或改用 HTTPS + Personal Access Token。

二次开发的目录结构、调试循环、所有权规则和发布流程见
[CONTRIBUTING.md](CONTRIBUTING.md)。本项目的读取/转换层衍生自
[LightingHa/dsh-cc-switch](https://github.com/LightingHa/dsh-cc-switch)（MIT），
衍生部分保留原版权声明。

## 开发

```sh
node --test test/unit.test.mjs
node --check dsh/index.js
```

已实测：

- `node --test test/unit.test.mjs`：14 项通过；
- 无运行时依赖：删掉本包的 `node_modules` 后仍能加载；
- `local-probe`：`/health` 200，DSH 路由已注册（5 个模型）；
- `route-test`：`ccswitchlocal-local-claude` 实际返回 `finish=max-tokens`，说明
  DSH → pi-ai（anthropic-messages）→ cc-switch 本地路由 → morouter 整条链路通；
- 思考等级：`reasoning levels="low,high,max"` 后，`local-probe` 显示
  `off, low, high, max`，`route-test` 仍然成功；
- 1M 上下文：`local-probe` 显示 `上下文 1000000`，修复长会话只输出 1 token；
- 直连模式：写入 `ccswitchlocal-claude-morouter`，撤掉本地路由与 `PROXY_MANAGED`；
- 两种模式同时开：写本地路由，当前 Claude 供应商的直连路由被标为「由本地路由接管」；
- 自定义供应商：新增 `openai-completions` 路由、写凭据；删除后路由与凭据都被清理。
