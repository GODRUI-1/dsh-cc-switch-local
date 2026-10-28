window.__ModuleLoader__.load({
  id: 'dsh-cc-switch-local',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'cc-switch-local'
    const CHANNEL = '/dsh-cc-switch-local'
    const LANG_KEY = 'cc-switch-local.lang'

    function initialLang() {
      try {
        const saved = localStorage.getItem(LANG_KEY)
        if (saved === 'zh-CN' || saved === 'en') return saved
      } catch {
        /* localStorage 不可用时用默认值 */
      }
      return 'zh-CN'
    }

    const messages = {
      'zh-CN': {
        'nav.label': 'CC Switch',
        'page.title': 'CC Switch Local',
        'page.subtitle': '把 cc-switch 的本地路由、直连供应商和自己的 OpenAI 兼容供应商接进 DSH。',
        'common.refresh': '刷新',
        'common.sync': '立即同步',
        'common.syncing': '同步中…',
        'common.probe': '检测',
        'common.cancel': '取消',
        'common.save': '保存',
        'common.saving': '保存中…',
        'common.delete': '删除',
        'common.edit': '编辑',
        'common.add': '添加供应商',
        'common.loading': '正在读取 cc-switch…',
        'common.none': '暂无',
        'common.models': '模型',
        'common.current': '当前',
        'common.on': '开',
        'common.off': '关',
        'common.yes': '是',
        'common.no': '否',
        'common.empty': '还没有数据。',
        'local.title': 'cc-switch 本地路由',
        'local.listening': '监听中',
        'local.notListening': '未监听',
        'local.routed': 'Claude Code 正在使用',
        'local.currentProvider': '当前供应商',
        'local.address': '地址',
        'local.models': '可用模型',
        'local.reasoning': '思考等级',
        'local.reasoningHint': '勾选后写进本地路由的每个模型；不勾选则不显示思考控制。',
        'local.reasoningNone': '未启用',
        'local.effortLevel': 'Claude Code 默认思考等级',
        'level.low': '低',
        'level.medium': '中',
        'level.high': '高',
        'level.xhigh': '超高',
        'level.max': '最高',
        'local.healthOk': '健康检查通过',
        'local.healthFail': '健康检查失败',
        'local.hint': '开启后 DSH 与 Claude Code 共用同一条路由：在 cc-switch 里切供应商、开故障转移会立即生效。',
        'mode.title': '路由模式',
        'mode.local': '本地路由',
        'mode.localDesc': '请求先到 cc-switch（127.0.0.1:15721），由它转发并转换格式。',
        'mode.direct': '直连上游',
        'mode.directDesc': '每家供应商按自己的 baseURL 直连，不经过 cc-switch。',
        'mode.bothHint': '两种模式可以同时开：当前 Claude 供应商由本地路由接管，其余供应商走直连。',
        'providers.title': 'cc-switch 供应商',
        'providers.count': '共 {n} 家',
        'providers.imported': '已接入 {n} 家',
        'providers.importable': '可接入',
        'providers.unavailable': '不可接入',
        'providers.reason': '原因',
        'providers.route': '路由',
        'providers.takeover': '由本地路由接管',
        'custom.title': '自定义供应商',
        'custom.desc': '不走 cc-switch，直接声明端点和 API 格式；支持 OpenAI Chat Completions。',
        'custom.addTitle': '添加自定义供应商',
        'custom.editTitle': '编辑自定义供应商',
        'custom.name': '显示名',
        'custom.id': '供应商 ID',
        'custom.idHint': '留空自动生成；已存在时用于定位条目。',
        'custom.api': 'API 格式',
        'custom.baseURL': 'Base URL',
        'custom.apiKey': 'API Key',
        'custom.apiKeyHint': '已保存时留空表示保持不变。Key 只写入凭据存储，不回显。',
        'custom.models': '模型',
        'custom.modelsHint': '逗号或换行分隔，例如：deepseek-chat, deepseek-reasoner',
        'custom.reasoning': '思考等级',
        'custom.reasoningHint': '应用到该供应商的所有模型；不勾选则不显示思考控制。',
        'custom.keySaved': 'Key 已保存',
        'custom.keyMissing': 'Key 未保存',
        'custom.originPanel': '面板',
        'custom.originConfig': '配置文件',
        'custom.deleteConfirm': '确定删除供应商 "{name}"？它写入的路由和凭据会一并清理。',
        'routes.title': '已写入 DSH 的路由',
        'routes.desc': '这些路由会出现在「设置 → 模型」里，可在对话的模型选择器中直接选中。',
        'routes.managed': '本插件管理',
        'routes.count': '共 {n} 条',
        'error.title': '操作失败',
        'notice.synced': '同步完成。',
        'notice.mode': '路由模式已更新。',
        'notice.saved': '自定义供应商已保存。',
        'notice.removed': '自定义供应商已删除。',
        'notice.probe': '本地路由检测完成。',
        'notice.reasoning': '思考等级已更新。',
        'status.database': '读取自 cc-switch 数据库',
        'status.missing': '没有找到 cc-switch 数据',
        'skipped.title': '没有接入的条目',
      },
      en: {
        'nav.label': 'CC Switch',
        'page.title': 'CC Switch Local',
        'page.subtitle': 'Bring the cc-switch local router, direct providers, and your own OpenAI-compatible providers into DSH.',
        'common.refresh': 'Refresh',
        'common.sync': 'Sync now',
        'common.syncing': 'Syncing…',
        'common.probe': 'Probe',
        'common.cancel': 'Cancel',
        'common.save': 'Save',
        'common.saving': 'Saving…',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.add': 'Add provider',
        'common.loading': 'Reading cc-switch…',
        'common.none': 'None',
        'common.models': 'Models',
        'common.current': 'Current',
        'common.on': 'On',
        'common.off': 'Off',
        'common.yes': 'Yes',
        'common.no': 'No',
        'common.empty': 'No data yet.',
        'local.title': 'cc-switch local router',
        'local.listening': 'Listening',
        'local.notListening': 'Not listening',
        'local.routed': 'Claude Code is using it',
        'local.currentProvider': 'Current provider',
        'local.address': 'Address',
        'local.models': 'Available models',
        'local.reasoning': 'Thinking levels',
        'local.reasoningHint': 'When checked, every model of the local router offers these levels; leave empty for no thinking control.',
        'local.reasoningNone': 'Not enabled',
        'local.effortLevel': 'Claude Code default effort',
        'level.low': 'Low',
        'level.medium': 'Medium',
        'level.high': 'High',
        'level.xhigh': 'Extra high',
        'level.max': 'Max',
        'local.healthOk': 'Health check passed',
        'local.healthFail': 'Health check failed',
        'local.hint': 'When enabled, DSH shares the same route as Claude Code: switching providers or failover in cc-switch applies immediately.',
        'mode.title': 'Route mode',
        'mode.local': 'Local router',
        'mode.localDesc': 'Requests go through cc-switch (127.0.0.1:15721) for forwarding and format conversion.',
        'mode.direct': 'Direct upstream',
        'mode.directDesc': 'Each provider connects to its own baseURL, bypassing cc-switch.',
        'mode.bothHint': 'Both modes can be on: the current Claude provider is covered by the local router and other providers connect directly.',
        'providers.title': 'cc-switch providers',
        'providers.count': '{n} total',
        'providers.imported': '{n} imported',
        'providers.importable': 'Importable',
        'providers.unavailable': 'Unavailable',
        'providers.reason': 'Reason',
        'providers.route': 'Route',
        'providers.takeover': 'Covered by local router',
        'custom.title': 'Custom providers',
        'custom.desc': 'Declare an endpoint and API format without cc-switch; OpenAI Chat Completions is supported.',
        'custom.addTitle': 'Add custom provider',
        'custom.editTitle': 'Edit custom provider',
        'custom.name': 'Display name',
        'custom.id': 'Provider ID',
        'custom.idHint': 'Leave blank to generate one; used to locate the entry when it already exists.',
        'custom.api': 'API format',
        'custom.baseURL': 'Base URL',
        'custom.apiKey': 'API key',
        'custom.apiKeyHint': 'Leave blank to keep the saved key. Keys are stored in credentials and never echoed.',
        'custom.models': 'Models',
        'custom.modelsHint': 'Comma or newline separated, for example: deepseek-chat, deepseek-reasoner',
        'custom.reasoning': 'Thinking levels',
        'custom.reasoningHint': 'Applies to every model of this provider; no levels means no thinking control.',
        'custom.keySaved': 'Key saved',
        'custom.keyMissing': 'Key missing',
        'custom.originPanel': 'Panel',
        'custom.originConfig': 'Config file',
        'custom.deleteConfirm': 'Delete provider "{name}"? Its routes and credentials will be cleaned up.',
        'routes.title': 'Routes written to DSH',
        'routes.desc': 'These routes appear under Settings → Models and in the composer model picker.',
        'routes.managed': 'Managed by this plugin',
        'routes.count': '{n} total',
        'error.title': 'Operation failed',
        'notice.synced': 'Sync complete.',
        'notice.mode': 'Route mode updated.',
        'notice.saved': 'Custom provider saved.',
        'notice.removed': 'Custom provider removed.',
        'notice.probe': 'Local router probe finished.',
        'notice.reasoning': 'Thinking levels updated.',
        'status.database': 'Read from the cc-switch database',
        'status.missing': 'cc-switch data not found',
        'skipped.title': 'Items not imported',
      },
    }

    function translate(template, params) {
      if (params === undefined) return template
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (params[key] === undefined ? match : String(params[key])))
    }

    function makeApi(connection) {
      return {
        async call(endpoint, payload) {
          const response = await connection.rpc.call(CHANNEL, endpoint, payload === undefined ? {} : payload)
          if (!response?.ok) {
            const message = response?.error?.message || 'RPC failed'
            throw new Error(message)
          }
          return response.value
        },
      }
    }

    const S = {
      page: {
        padding: '28px 32px 72px',
        maxWidth: 960,
        margin: '0 auto',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 14,
        lineHeight: 1.55,
      },
      header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 },
      title: { fontSize: 24, fontWeight: 600, margin: 0 },
      subtitle: { margin: '6px 0 0', color: 'var(--dsw-alias-label-secondary)', maxWidth: 720 },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 12,
        padding: '18px 20px',
        marginBottom: 16,
      },
      sectionHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
      h2: { fontSize: 16, fontWeight: 600, margin: 0 },
      hint: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, margin: '4px 0 0' },
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      rowBetween: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12.5 },
      dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flex: '0 0 auto' },
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        padding: '1px 8px',
        fontSize: 12,
        lineHeight: 1.7,
        border: '1px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      button: {
        appearance: 'none',
        font: 'inherit',
        fontSize: 13,
        borderRadius: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
      },
      buttonPrimary: {
        appearance: 'none',
        font: 'inherit',
        fontSize: 13,
        borderRadius: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
      },
      buttonDanger: {
        appearance: 'none',
        font: 'inherit',
        fontSize: 13,
        borderRadius: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      item: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 0',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      itemFirst: { borderTop: 'none', paddingTop: 0 },
      itemMain: { minWidth: 0, flex: '1 1 auto' },
      itemName: { fontWeight: 550, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      itemMeta: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, marginTop: 2, wordBreak: 'break-all' },
      toggleTrack: {
        position: 'relative',
        width: 40,
        height: 22,
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)',
        padding: 0,
        cursor: 'pointer',
        flex: '0 0 auto',
        transition: 'background 120ms ease',
      },
      toggleThumb: {
        position: 'absolute',
        top: 2,
        left: 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        transition: 'transform 120ms ease',
      },
      field: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 },
      label: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      input: {
        font: 'inherit',
        fontSize: 13,
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 8,
        padding: '7px 10px',
        width: '100%',
        boxSizing: 'border-box',
      },
      banner: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        padding: '9px 12px',
        marginBottom: 14,
        fontSize: 13,
        wordBreak: 'break-word',
      },
      chips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
      chip: {
        appearance: 'none',
        font: 'inherit',
        fontSize: 12,
        lineHeight: 1.6,
        padding: '3px 10px',
        borderRadius: 999,
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      chipActive: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-brand-primary)',
        background: 'transparent',
        fontWeight: 550,
      },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 6,
        padding: '1px 6px',
      },
      formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' },
      empty: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, padding: '10px 0' },
    }

    function Dot({ tone }) {
      const color =
        tone === 'ok'
          ? 'var(--dsw-alias-state-success-primary)'
          : tone === 'warn'
            ? 'var(--dsw-alias-state-warn-primary)'
            : tone === 'error'
              ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-state-idle-primary)'
      return h('span', { style: { ...S.dot, background: color }, 'aria-hidden': true })
    }

    function Badge({ children, tone }) {
      const color =
        tone === 'brand'
          ? 'var(--dsw-alias-brand-primary)'
          : tone === 'ok'
            ? 'var(--dsw-alias-state-success-primary)'
            : tone === 'warn'
              ? 'var(--dsw-alias-state-warn-primary)'
              : tone === 'error'
                ? 'var(--dsw-alias-state-error-primary)'
                : undefined
      return h('span', { style: color === undefined ? S.badge : { ...S.badge, color, borderColor: color } }, children)
    }

    const THINKING_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

    function sortLevels(levels) {
      return THINKING_LEVELS.filter((level) => levels.includes(level))
    }

    function LevelChip({ level, active, onClick, disabled, label }) {
      return h(
        'button',
        {
          type: 'button',
          'aria-pressed': active === true,
          onClick,
          disabled: disabled === true,
          style: active === true ? { ...S.chip, ...S.chipActive } : S.chip,
        },
        label,
      )
    }

    function Button({ children, onClick, variant, disabled, type }) {
      const style = variant === 'primary' ? S.buttonPrimary : variant === 'danger' ? S.buttonDanger : S.button
      return h(
        'button',
        {
          type: type || 'button',
          onClick,
          disabled: disabled === true,
          style: disabled === true ? { ...style, opacity: 0.55, cursor: 'default' } : style,
        },
        children,
      )
    }

    function Toggle({ checked, onChange, label, description, disabled }) {
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0' } },
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': checked === true,
            'aria-label': label,
            disabled: disabled === true,
            onClick: () => onChange(!checked),
            style: {
              ...S.toggleTrack,
              marginTop: 2,
              background: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-2)',
              borderColor: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)',
              opacity: disabled === true ? 0.5 : 1,
            },
          },
          h('span', { style: { ...S.toggleThumb, transform: checked ? 'translateX(18px)' : 'none' } }),
        ),
        h(
          'div',
          null,
          h('div', { style: { fontWeight: 550 } }, label),
          description ? h('div', { style: S.hint }, description) : null,
        ),
      )
    }

    function Field({ label, hint, children }) {
      return h('label', { style: S.field }, h('span', { style: S.label }, label), children, hint ? h('span', { style: S.hint }, hint) : null)
    }

    function Empty({ children }) {
      return h('div', { style: S.empty }, children)
    }

    function ModelChips({ models }) {
      if (!Array.isArray(models) || models.length === 0) return null
      return h(
        'div',
        { style: S.chips },
        models.slice(0, 12).map((model) => h('span', { key: model, style: S.code }, model)),
        models.length > 12 ? h('span', { style: S.code }, `+${models.length - 12}`) : null,
      )
    }

    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        if (typeof console !== 'undefined') console.error('[cc-switch-local] panel crashed', error, info)
      }

      render() {
        if (this.state.error !== null) {
          return h(
            'div',
            { style: { ...S.card, color: 'var(--dsw-alias-state-error-primary)' } },
            `CC Switch panel failed: ${this.state.error?.message || String(this.state.error)}`,
          )
        }
        return this.props.children
      }
    }

    function Panel({ connection }) {
      const api = useMemo(() => makeApi(connection), [connection])
      const [lang, setLang] = useState(initialLang)
      const t = useCallback(
        (key, params) => translate(messages[lang]?.[key] ?? messages['en']?.[key] ?? key, params),
        [lang],
      )
      const switchLang = useCallback((next) => {
        if (next !== 'zh-CN' && next !== 'en') return
        setLang(next)
        try {
          localStorage.setItem(LANG_KEY, next)
        } catch {
          /* localStorage 不可用时只影响下次打开 */
        }
      }, [])

      const [snapshot, setSnapshot] = useState(null)
      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [editing, setEditing] = useState(null)
      const [health, setHealth] = useState(null)
      const mounted = useRef(true)

      useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
        }
      }, [])

      const load = useCallback(async () => {
        setLoading(true)
        try {
          const state = await api.call('state', {})
          if (mounted.current) {
            setSnapshot(state)
            setError('')
          }
        } catch (cause) {
          if (mounted.current) setError(cause?.message || String(cause))
        } finally {
          if (mounted.current) setLoading(false)
        }
      }, [api])

      useEffect(() => {
        void load()
      }, [load])

      const run = useCallback(
        async (endpoint, payload, successText) => {
          setBusy(true)
          setError('')
          setNotice('')
          try {
            const result = await api.call(endpoint, payload === undefined ? {} : payload)
            if (result?.state !== undefined) setSnapshot(result.state)
            else await load()
            const report = result?.report
            if (report !== undefined && report.ok === false) {
              setError(report.message || t('error.title'))
            } else if (result?.ok === false || (result?.report !== undefined && result.report.ok === false)) {
              setError(result?.message || result?.report?.message || t('error.title'))
            } else {
              setNotice(successText)
            }
            return result
          } catch (cause) {
            setError(cause?.message || String(cause))
            return undefined
          } finally {
            if (mounted.current) setBusy(false)
          }
        },
        [api, load, t],
      )

      const onToggle = useCallback(
        async (next) => {
          if (snapshot === null) return
          const mode = { local: snapshot.mode.local, direct: snapshot.mode.direct, ...next }
          await run('mode', mode, t('notice.mode'))
        },
        [snapshot, run, t],
      )

      const toggleLocalLevel = useCallback(
        async (level) => {
          if (snapshot === null) return
          const current = Array.isArray(snapshot.localReasoningEfforts) ? snapshot.localReasoningEfforts : []
          const next = current.includes(level) ? current.filter((item) => item !== level) : sortLevels([...current, level])
          await run('local.reasoning', { levels: next }, t('notice.reasoning'))
        },
        [snapshot, run, t],
      )

      const onProbe = useCallback(async () => {
        setBusy(true)
        setError('')
        setNotice('')
        try {
          const result = await api.call('local.probe', {})
          setHealth(result)
          setNotice(result?.ok ? t('local.healthOk') : t('local.healthFail'))
        } catch (cause) {
          setError(cause?.message || String(cause))
        } finally {
          if (mounted.current) setBusy(false)
        }
      }, [api, t])

      const startAdd = useCallback(() => {
        setEditing({ originalId: '', name: '', id: '', api: 'openai-completions', baseURL: '', apiKey: '', models: '', levels: [] })
      }, [])

      const startEdit = useCallback((provider) => {
        setEditing({
          originalId: provider.id,
          name: provider.displayName,
          id: provider.id,
          api: provider.api,
          baseURL: provider.baseURL,
          apiKey: '',
          models: (provider.models || []).join('\n'),
          levels: provider.reasoningEfforts || [],
          hasKey: provider.hasKey,
        })
      }, [])

      const submitForm = useCallback(async () => {
        if (editing === null) return
        const provider = {
          originalId: editing.originalId || undefined,
          id: editing.id || undefined,
          displayName: editing.name,
          api: editing.api,
          baseURL: editing.baseURL,
          apiKey: editing.apiKey === '' ? undefined : editing.apiKey,
          models: editing.models,
          reasoningEfforts: editing.levels || [],
        }
        const result = await run('custom.save', { provider }, t('notice.saved'))
        if (result !== undefined && (result.ok !== false)) setEditing(null)
      }, [editing, run, t])

      const removeProvider = useCallback(
        async (provider) => {
          const message = translate(t('custom.deleteConfirm'), { name: provider.displayName })
          if (typeof window !== 'undefined' && typeof window.confirm === 'function' && window.confirm(message) !== true) return
          await run('custom.remove', { id: provider.id }, t('notice.removed'))
        },
        [run, t],
      )

      if (loading && snapshot === null) {
        return h('div', { style: S.page }, h('div', { style: S.empty }, t('common.loading')))
      }
      if (snapshot === null) {
        return h(
          'div',
          { style: S.page },
          h('div', { style: { ...S.banner, color: 'var(--dsw-alias-state-error-primary)' } }, error || t('common.empty')),
          h(Button, { onClick: load }, t('common.refresh')),
        )
      }

      const local = snapshot.localRoute || {}
      const cc = snapshot.ccswitch || { providers: [] }
      const providers = cc.providers || []
      const customProviders = snapshot.customProviders || []
      const routes = snapshot.routes || []
      const importable = providers.filter((provider) => provider.importable === true).length
      const statusTone = local.listening ? 'ok' : 'warn'
      const localHealthText = (() => {
        if (health === null) return ''
        if (health.ok) return `${t('local.healthOk')} · ${health.health?.latencyMs ?? '-'}ms`
        return `${t('local.healthFail')}${health.health?.reason ? ` · ${health.health.reason}` : ''}`
      })()

      return h(
        'div',
        { style: S.page },
        h(
          'header',
          { style: S.header },
          h(
            'div',
            null,
            h('h1', { style: S.title }, t('page.title')),
            h('p', { style: S.subtitle }, t('page.subtitle')),
            h(
              'div',
              { style: { ...S.itemMeta, marginTop: 6 } },
              `${cc.source === 'missing' ? t('status.missing') : t('status.database')}${cc.path ? ` · ${cc.path}` : ''}`,
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' } },
            h(
              'div',
              { style: { display: 'flex', gap: 4, alignItems: 'center' } },
              h(
                'button',
                {
                  type: 'button',
                  'aria-pressed': lang === 'zh-CN',
                  onClick: () => switchLang('zh-CN'),
                  style: lang === 'zh-CN' ? { ...S.chip, ...S.chipActive } : S.chip,
                },
                '中文',
              ),
              h(
                'button',
                {
                  type: 'button',
                  'aria-pressed': lang === 'en',
                  onClick: () => switchLang('en'),
                  style: lang === 'en' ? { ...S.chip, ...S.chipActive } : S.chip,
                },
                'EN',
              ),
            ),
            h(Button, { onClick: load, disabled: busy }, t('common.refresh')),
            h(Button, { variant: 'primary', onClick: () => run('sync', { dryRun: false }, t('notice.synced')), disabled: busy }, busy ? t('common.syncing') : t('common.sync')),
          ),
        ),
        error ? h('div', { role: 'alert', style: { ...S.banner, color: 'var(--dsw-alias-state-error-primary)' } }, `${t('error.title')}：${error}`) : null,
        notice ? h('div', { role: 'status', style: { ...S.banner, color: 'var(--dsw-alias-label-secondary)' } }, notice) : null,
        h(
          'section',
          { style: S.card },
          h(
            'div',
            { style: S.sectionHead },
            h(
              'div',
              { style: S.row },
              h(Dot, { tone: statusTone }),
              h('h2', { style: S.h2 }, t('local.title')),
              h(Badge, { tone: local.listening ? 'ok' : 'warn' }, local.listening ? t('local.listening') : t('local.notListening')),
              local.routed ? h(Badge, { tone: 'brand' }, t('local.routed')) : null,
            ),
            h(Button, { onClick: onProbe, disabled: busy }, t('common.probe')),
          ),
          h(
            'div',
            { style: S.row, marginBottom: 6 },
            h('span', { style: S.label }, `${t('local.address')}：`),
            h('code', { style: S.code }, local.baseURL || '—'),
            local.currentProvider ? h('span', { style: S.itemMeta }, `${t('local.currentProvider')}：${local.currentProvider}`) : null,
          ),
          localHealthText ? h('div', { style: { ...S.itemMeta, marginBottom: 6 } }, localHealthText) : null,
          local.models && local.models.length > 0
            ? h('div', { style: S.row }, h('span', { style: S.label }, `${t('local.models')}：`), h(ModelChips, { models: local.models }))
            : null,
          h('p', { style: S.hint }, t('local.hint')),
          h(
            'div',
            { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--dsw-alias-border-l1)' } },
            h(
              'div',
              { style: S.row },
              h('span', { style: S.label }, `${t('local.reasoning')}：`),
              h(
                'div',
                { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                THINKING_LEVELS.map((level) =>
                  h(LevelChip, {
                    key: level,
                    level,
                    label: t(`level.${level}`),
                    active: (snapshot.localReasoningEfforts || []).includes(level),
                    onClick: () => toggleLocalLevel(level),
                    disabled: busy,
                  }),
                ),
              ),
            ),
            h('p', { style: S.hint }, t('local.reasoningHint')),
            snapshot.localRoute?.effortLevel
              ? h('p', { style: S.hint }, `${t('local.effortLevel')}：${snapshot.localRoute.effortLevel}`)
              : null,
          ),
          h(
            'div',
            { style: { marginTop: 10, borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 10 } },
            h(
              'div',
              { style: S.rowBetween },
              h(
                'div',
                null,
                h(Toggle, {
                  checked: snapshot.mode.local === true,
                  onChange: (value) => onToggle({ local: value }),
                  label: t('mode.local'),
                  description: t('mode.localDesc'),
                  disabled: busy,
                }),
                h(Toggle, {
                  checked: snapshot.mode.direct === true,
                  onChange: (value) => onToggle({ direct: value }),
                  label: t('mode.direct'),
                  description: t('mode.directDesc'),
                  disabled: busy,
                }),
              ),
            ),
            h('p', { style: S.hint }, t('mode.bothHint')),
          ),
        ),
        h(
          'section',
          { style: S.card },
          h(
            'div',
            { style: S.sectionHead },
            h(
              'div',
              null,
              h('h2', { style: S.h2 }, t('providers.title')),
              h('p', { style: S.hint }, `${translate(t('providers.count'), { n: providers.length })} · ${translate(t('providers.imported'), { n: importable })}`),
            ),
          ),
          providers.length === 0
            ? h(Empty, null, t('common.empty'))
            : providers.map((provider, index) =>
                h(
                  'div',
                  { key: `${provider.appType}:${provider.id}`, style: index === 0 ? { ...S.item, ...S.itemFirst } : S.item },
                  h(
                    'div',
                    { style: S.itemMain },
                    h(
                      'div',
                      { style: S.itemName },
                      h('span', null, provider.name),
                      provider.isCurrent ? h(Badge, { tone: 'brand' }, t('common.current')) : null,
                      h(Badge, null, provider.appType),
                      provider.suppressed
                        ? h(Badge, { tone: 'brand' }, t('providers.takeover'))
                        : provider.importable
                          ? h(Badge, { tone: 'ok' }, t('providers.importable'))
                          : h(Badge, { tone: 'warn' }, t('providers.unavailable')),
                    ),
                    h(
                      'div',
                      { style: S.itemMeta },
                      provider.api ? `${provider.api} · ${provider.baseURL || '—'}` : provider.reason || '—',
                    ),
                    h(ModelChips, { models: provider.models }),
                  ),
                  h(
                    'div',
                    { style: { textAlign: 'right', flex: '0 0 auto' } },
                    provider.routeKeys && provider.routeKeys.length > 0
                      ? h('div', { style: S.mono }, provider.routeKeys.slice(0, 2).join(', '))
                      : h('div', { style: S.itemMeta }, '—'),
                  ),
                ),
              ),
        ),
        h(
          'section',
          { style: S.card },
          h(
            'div',
            { style: S.sectionHead },
            h(
              'div',
              null,
              h('h2', { style: S.h2 }, t('custom.title')),
              h('p', { style: S.hint }, t('custom.desc')),
            ),
            h(Button, { variant: 'primary', onClick: startAdd, disabled: busy || editing !== null }, t('common.add')),
          ),
          editing !== null
            ? h(
                'div',
                { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, background: 'var(--dsw-alias-bg-layer-2)' } },
                h('div', { style: { fontWeight: 600, marginBottom: 10 } }, editing.originalId === '' ? t('custom.addTitle') : t('custom.editTitle')),
                h(
                  'div',
                  { style: S.formGrid },
                  h(Field, { label: t('custom.name') }, h('input', { style: S.input, value: editing.name, onChange: (event) => setEditing({ ...editing, name: event.target.value }) })),
                  h(
                    Field,
                    { label: t('custom.id'), hint: t('custom.idHint') },
                    h('input', { style: S.input, value: editing.id, onChange: (event) => setEditing({ ...editing, id: event.target.value }) }),
                  ),
                  h(
                    Field,
                    { label: t('custom.api') },
                    h(
                      'select',
                      { style: S.input, value: editing.api, onChange: (event) => setEditing({ ...editing, api: event.target.value }) },
                      h('option', { value: 'openai-completions' }, 'OpenAI Chat Completions'),
                      h('option', { value: 'openai-responses' }, 'OpenAI Responses'),
                      h('option', { value: 'anthropic-messages' }, 'Anthropic Messages'),
                    ),
                  ),
                  h(
                    Field,
                    { label: t('custom.baseURL') },
                    h('input', {
                      style: S.input,
                      value: editing.baseURL,
                      placeholder: 'https://api.example.com/v1',
                      onChange: (event) => setEditing({ ...editing, baseURL: event.target.value }),
                    }),
                  ),
                ),
                h(
                  Field,
                  { label: t('custom.apiKey'), hint: t('custom.apiKeyHint') },
                  h('input', {
                    style: S.input,
                    type: 'password',
                    autoComplete: 'new-password',
                    value: editing.apiKey,
                    placeholder: editing.hasKey ? '••••••••' : '',
                    onChange: (event) => setEditing({ ...editing, apiKey: event.target.value }),
                  }),
                ),
                h(
                  Field,
                  { label: t('custom.models'), hint: t('custom.modelsHint') },
                  h('textarea', {
                    style: { ...S.input, minHeight: 70, resize: 'vertical' },
                    value: editing.models,
                    placeholder: 'deepseek-chat\ndeepseek-reasoner',
                    onChange: (event) => setEditing({ ...editing, models: event.target.value }),
                  }),
                ),
                h(
                  Field,
                  { label: t('custom.reasoning'), hint: t('custom.reasoningHint') },
                  h(
                    'div',
                    { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    THINKING_LEVELS.map((level) =>
                      h(LevelChip, {
                        key: level,
                        level,
                        label: t(`level.${level}`),
                        active: (editing.levels || []).includes(level),
                        onClick: () => {
                          const current = editing.levels || []
                          const next = current.includes(level) ? current.filter((item) => item !== level) : sortLevels([...current, level])
                          setEditing({ ...editing, levels: next })
                        },
                      }),
                    ),
                  ),
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
                  h(Button, { onClick: () => setEditing(null), disabled: busy }, t('common.cancel')),
                  h(Button, { variant: 'primary', onClick: submitForm, disabled: busy }, busy ? t('common.saving') : t('common.save')),
                ),
              )
            : null,
          customProviders.length === 0
            ? h(Empty, null, t('common.empty'))
            : customProviders.map((provider, index) =>
                h(
                  'div',
                  { key: provider.id, style: index === 0 ? { ...S.item, ...S.itemFirst } : S.item },
                  h(
                    'div',
                    { style: S.itemMain },
                    h(
                      'div',
                      { style: S.itemName },
                      h('span', null, provider.displayName),
                      h(Badge, null, provider.id),
                      h(Badge, { tone: provider.hasKey ? 'ok' : 'warn' }, provider.hasKey ? t('custom.keySaved') : t('custom.keyMissing')),
                      h(Badge, null, provider.origin === 'panel' ? t('custom.originPanel') : t('custom.originConfig')),
                      provider.reasoningEfforts && provider.reasoningEfforts.length > 0
                        ? h(Badge, { tone: 'brand' }, `${t('custom.reasoning')}: ${provider.reasoningEfforts.join(', ')}`)
                        : null,
                    ),
                    h('div', { style: S.itemMeta }, `${provider.api} · ${provider.baseURL}`),
                    h(ModelChips, { models: provider.models }),
                  ),
                  h(
                    'div',
                    { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                    h(Button, { onClick: () => startEdit(provider), disabled: busy }, t('common.edit')),
                    provider.origin === 'panel'
                      ? h(Button, { variant: 'danger', onClick: () => removeProvider(provider), disabled: busy }, t('common.delete'))
                      : null,
                  ),
                ),
              ),
        ),
        h(
          'section',
          { style: S.card },
          h(
            'div',
            { style: S.sectionHead },
            h(
              'div',
              null,
              h('h2', { style: S.h2 }, t('routes.title')),
              h('p', { style: S.hint }, t('routes.desc')),
            ),
            h(Badge, null, translate(t('routes.count'), { n: routes.length })),
          ),
          routes.length === 0
            ? h(Empty, null, t('common.empty'))
            : routes.map((route, index) =>
                h(
                  'div',
                  { key: route.key, style: index === 0 ? { ...S.item, ...S.itemFirst } : S.item },
                  h(
                    'div',
                    { style: S.itemMain },
                    h(
                      'div',
                      { style: S.itemName },
                      h('span', { style: S.mono }, route.key),
                      route.managed ? h(Badge, { tone: 'brand' }, t('routes.managed')) : null,
                    ),
                    h('div', { style: S.itemMeta }, `${route.api} · ${route.displayName || '—'} · ${route.baseURL || '—'}`),
                    h(ModelChips, { models: route.models }),
                  ),
                ),
              ),
        ),
        snapshot.skipped && snapshot.skipped.length > 0
          ? h(
              'section',
              { style: S.card },
              h('h2', { style: S.h2 }, t('skipped.title')),
              snapshot.skipped.map((entry, index) =>
                h(
                  'div',
                  { key: `${entry.appType}:${entry.name}:${index}`, style: index === 0 ? { ...S.item, ...S.itemFirst } : S.item },
                  h(
                    'div',
                    { style: S.itemMain },
                    h('div', { style: S.itemName }, h('span', null, entry.name), h(Badge, null, entry.appType)),
                    h('div', { style: S.itemMeta }, entry.reason),
                  ),
                ),
              ),
            )
          : null,
      )
    }

    return {
      // 客户端服务必须声明依赖：apply 里会用到 locale 和 connection，
      // 只写 slots 时 locale 可能还没挂载，`ctx.locale.register` 会直接抛错，
      // 整个 Client 条目就会进入 failed 状态（页面显示 Failed to load plugins）。
      inject: ['slots', 'locale', 'connection'],
      apply(ctx) {
        ctx.effect(() => {
          const disposeZh = ctx.locale.register(NS, 'zh-CN', messages['zh-CN'])
          const disposeEn = ctx.locale.register(NS, 'en', messages.en)
          return () => {
            try {
              disposeZh()
            } catch {
              /* ignore */
            }
            try {
              disposeEn()
            } catch {
              /* ignore */
            }
          }
        })
        const navT = ctx.locale.bind(NS)
        const Page = (props) => h(PanelBoundary, null, h(Panel, { ...props, connection: ctx.connection }))
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'cc-switch-local',
              order: 12,
              label: () => navT('nav.label'),
            },
            Page,
          ),
        )
      },
    }
  },
})
