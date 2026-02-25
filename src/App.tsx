import { useState, useEffect, useMemo, Component, type ErrorInfo } from 'react'
import { VariableView } from './modules/VariableView'
import { TestSuggester } from './modules/TestSuggester'
import { Insights } from './modules/Insights'
import { DataReadinessPanel, getDataReadinessForApp } from './modules/DataReadinessPanel'
import { canProceedToTests } from './lib/dataReadiness'
import type { DatasetState } from './types'
import { styles } from './theme'

class MainErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <main style={{ ...styles.main, padding: 24 }}>
          <div style={{ padding: 24, background: '#fff5f5', border: '1px solid #e74c3c', borderRadius: 8 }}>
            <strong>Something went wrong</strong>
            <p style={{ margin: '12px 0 0', fontSize: 13 }}>{this.state.error.message}</p>
            <button
              type="button"
              style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

function App() {
  const [dataset, setDataset] = useState<DatasetState | null>(null)
  const [activeModule, setActiveModule] = useState<'variable' | 'tests' | 'insights'>('variable')

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
      body { background-color: #F7F7F5; }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  const tabs = [
    { id: 'variable' as const, label: 'Variable View' },
    { id: 'tests' as const, label: 'Test Suggester' },
    { id: 'insights' as const, label: 'Insights & Charts' },
  ]
  const readiness = useMemo(() => getDataReadinessForApp(dataset), [dataset])
  const canUseTests = Boolean(dataset?.variableViewConfirmed && readiness && canProceedToTests(readiness))

  return (
    <div style={styles.root}>
      <header style={styles.appHeader}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={styles.textHero}>
            Statistics<br />
            Assistant
          </h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={styles.appDesc}>
            Automated statistical analysis tool. Upload datasets to generate hypothesis tests,
            p-value calculations, and distribution insights with minimal configuration.
          </p>
        </div>
      </header>

      <nav style={styles.appNav}>
        <div style={styles.navTabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={{
                ...styles.navTabBase,
                ...(activeModule === tab.id ? styles.navTabActive : styles.navTabInactive),
                ...(tab.id !== 'variable' && !canUseTests ? styles.navTabDisabled : {}),
              }}
              onClick={() => (tab.id === 'variable' || canUseTests) && setActiveModule(tab.id)}
              disabled={tab.id !== 'variable' && !canUseTests}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={styles.navMeta}>
          <span>En</span>
          <span>Ver 2.4</span>
        </div>
      </nav>

      {dataset?.variableViewConfirmed && (
        <DataReadinessPanel
          dataset={dataset}
          onDatasetChange={setDataset}
          onOpenVariableView={() => setActiveModule('variable')}
        />
      )}

      <main style={styles.main}>
        <MainErrorBoundary>
          {activeModule === 'variable' && (
            <VariableView dataset={dataset} onDatasetChange={setDataset} />
          )}
          {activeModule === 'tests' && dataset?.variableViewConfirmed && (
            <TestSuggester dataset={dataset} />
          )}
          {activeModule === 'insights' && dataset?.variableViewConfirmed && (
            <Insights dataset={dataset} />
          )}
        </MainErrorBoundary>
      </main>
    </div>
  )
}

export default App
