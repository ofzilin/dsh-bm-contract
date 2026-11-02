window.__ModuleLoader__.load({
  id: "dsh-bm-contract",
  factory: (require) => {
    const React = require("react")
    const { useCallback, useEffect, useState } = React
    const h = React.createElement

    const styles = {
      page: { padding: '4px 0', maxWidth: '100%' },
      title: { margin: '0 0 6px', fontSize: '14px', fontWeight: 600 },
      hint: { margin: '2px 0 8px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #666)' },
      code: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
      label: { display: 'block', margin: '14px 0 4px', fontSize: '12px', fontWeight: 600 },
      textarea: {
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: '11.5px',
        lineHeight: 1.5,
        padding: '8px',
        border: '1px solid var(--dsw-alias-border-l2, #ccc)',
        borderRadius: '6px',
        resize: 'vertical',
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
        color: 'inherit',
      },
      row: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' },
      button: { padding: '5px 12px', borderRadius: '6px', border: '1px solid #333', background: '#222', color: '#fff', cursor: 'pointer' },
      button2: { padding: '5px 12px', borderRadius: '6px', border: '1px solid #bbb', background: '#fff', color: '#222', cursor: 'pointer' },
      error: { color: '#b00020', fontSize: '12px' },
      ok: { color: '#0a7a33', fontSize: '12px' },
    }

    function Page(props) {
      if (props.view === 'summary') return null

      const [state, setState] = useState({ loading: true, contract: '', spec: '', paths: {}, customized: false })
      const [contract, setContract] = useState('')
      const [spec, setSpec] = useState('')
      const [status, setStatus] = useState('')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

      const applyState = useCallback((data) => {
        setState({ ...data, loading: false })
        setContract(data.contract || '')
        setSpec(data.spec || '')
      }, [])

      const load = useCallback(async () => {
        setError('')
        try {
          const res = await fetch('/bm-contract/state', { credentials: 'same-origin' })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          applyState(data)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setState((prev) => ({ ...prev, loading: false }))
        }
      }, [applyState])

      useEffect(() => { load() }, [load])

      const save = useCallback(async () => {
        setBusy(true)
        setStatus('')
        setError('')
        try {
          const res = await fetch('/bm-contract/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ contract, spec }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          applyState(data)
          setStatus('Saved. The next prompt uses the new contract.')
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, [applyState, contract, spec])

      const reset = useCallback(async () => {
        setBusy(true)
        setStatus('')
        setError('')
        try {
          const res = await fetch('/bm-contract/reset', { method: 'POST', credentials: 'same-origin' })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          applyState(data)
          setStatus('Reset to the bundled defaults.')
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, [applyState])

      const dirty = contract !== (state.contract || '') || spec !== (state.spec || '')

      return h('div', { style: styles.page },
        h('h3', { style: styles.title }, 'Knowledge base files'),
        h('p', { style: styles.hint },
          'CONTRACT.md: ', h('code', { style: styles.code }, state.paths?.contract || ''), ' · ',
          'SPEC.md: ', h('code', { style: styles.code }, state.paths?.spec || ''),
        ),
        state.loading
          ? h('p', null, 'Loading…')
          : h('div', null,
              h('label', { style: styles.label, htmlFor: 'bm-contract-contract' }, 'CONTRACT.md (injected rules)'),
              h('textarea', {
                id: 'bm-contract-contract',
                value: contract,
                onChange: (e) => setContract(e.target.value),
                rows: 18,
                spellCheck: false,
                style: styles.textarea,
              }),
              h('label', { style: styles.label, htmlFor: 'bm-contract-spec' }, 'SPEC.md (full specification)'),
              h('textarea', {
                id: 'bm-contract-spec',
                value: spec,
                onChange: (e) => setSpec(e.target.value),
                rows: 18,
                spellCheck: false,
                style: styles.textarea,
              }),
            ),
        h('div', { style: styles.row },
          h('button', { onClick: save, disabled: busy || !dirty, style: styles.button }, busy ? 'Saving…' : 'Save'),
          h('button', { onClick: reset, disabled: busy, style: styles.button2 }, 'Reset to default'),
          h('button', { onClick: () => { setContract(state.contract || ''); setSpec(state.spec || '') }, disabled: busy || !dirty, style: styles.button2 }, 'Discard'),
        ),
        h('p', { style: styles.hint }, state.customized ? 'Status: customized' : 'Status: default'),
        error ? h('p', { style: styles.error }, error) : null,
        status ? h('p', { style: styles.ok }, status) : null,
      )
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: 'dsh-bm-contract',
      }, Page))
    }

    const module = { exports: {} }
    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  }
})
