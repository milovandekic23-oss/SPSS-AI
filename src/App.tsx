import { useState } from 'react'
import { VariableView } from './modules/VariableView'
import { TestSuggester } from './modules/TestSuggester'
import { Insights } from './modules/Insights'
import type { DatasetState } from './types'

function App() {
  const [dataset, setDataset] = useState<DatasetState | null>(null)
  const [activeModule, setActiveModule] = useState<'variable' | 'tests' | 'insights'>('variable')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ padding: '1rem 1.5rem', background: '#2c3e50', color: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>AI Statistics Assistant</h1>
        <nav style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => setActiveModule('variable')}
            style={{
              background: activeModule === 'variable' ? '#3498db' : 'transparent',
              color: '#fff',
              border: '1px solid #fff',
              padding: '0.35rem 0.75rem',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Variable View
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('tests')}
            disabled={!dataset?.variableViewConfirmed}
            style={{
              background: activeModule === 'tests' ? '#3498db' : 'transparent',
              color: dataset?.variableViewConfirmed ? '#fff' : '#999',
              border: '1px solid #fff',
              padding: '0.35rem 0.75rem',
              borderRadius: 4,
              cursor: dataset?.variableViewConfirmed ? 'pointer' : 'not-allowed',
            }}
          >
            Test Suggester
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('insights')}
            disabled={!dataset?.variableViewConfirmed}
            style={{
              background: activeModule === 'insights' ? '#3498db' : 'transparent',
              color: dataset?.variableViewConfirmed ? '#fff' : '#999',
              border: '1px solid #fff',
              padding: '0.35rem 0.75rem',
              borderRadius: 4,
              cursor: dataset?.variableViewConfirmed ? 'pointer' : 'not-allowed',
            }}
          >
            Insights & Charts
          </button>
        </nav>
      </header>

      <main style={{ flex: 1, padding: '1.5rem' }}>
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
