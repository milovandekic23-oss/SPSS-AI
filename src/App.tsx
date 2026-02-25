import { useState, useEffect } from 'react'
import { VariableView } from './modules/VariableView'
import { TestSuggester } from './modules/TestSuggester'
import { Insights } from './modules/Insights'
import type { DatasetState } from './types'
import { styles } from './theme'

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
    return () => document.head.removeChild(style)
  }, [])

  const tabs = [
    { id: 'variable' as const, label: 'Variable View' },
    { id: 'tests' as const, label: 'Test Suggester' },
    { id: 'insights' as const, label: 'Insights & Charts' },
  ]
  const canUseTests = dataset?.variableViewConfirmed ?? false

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

      <main style={styles.main}>
        {activeModule === 'variable' && (
          <VariableView dataset={dataset} onDatasetChange={setDataset} />
        )}
        {activeModule === 'tests' && dataset?.variableViewConfirmed && (
          <TestSuggester dataset={dataset} />
        )}
        {activeModule === 'insights' && dataset?.variableViewConfirmed && (
          <Insights dataset={dataset} />
        )}
      </main>
    </div>
  )
}

export default App
