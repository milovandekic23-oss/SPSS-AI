import { useState, useRef, useEffect } from 'react'
import type { DatasetState } from '../types'
import { getSuggestedVariables, runTest, type TestId, type TestResult } from '../lib/statsRunner'
import { getTestGuidance } from '../lib/statisticalGuidance'
import { TestResultPanel } from './TestResultPanel'

interface TestSuggesterProps {
  dataset: DatasetState
}

const TIER1: TestId[] = ['freq', 'desc', 'missing']
const TIER2: TestId[] = ['crosstab', 'corr', 'spearman', 'ttest', 'anova']
const TIER3: TestId[] = ['linreg', 'logreg', 'mann', 'paired']
const TIER4: TestId[] = ['pca']

export function TestSuggester({ dataset }: TestSuggesterProps) {
  const [result, setResult] = useState<TestResult | null>(null)
  const [runningId, setRunningId] = useState<TestId | null>(null)
  const resultPanelRef = useRef<HTMLDivElement>(null)
  const n = dataset.rows.length

  useEffect(() => {
    if (result && resultPanelRef.current && typeof resultPanelRef.current.scrollIntoView === 'function') {
      resultPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [result])

  const handleRun = (testId: TestId) => {
    setRunningId(testId)
    setResult(null)
    try {
      const res = runTest(testId, dataset)
      setResult(
        res ?? {
          testId,
          testName: getTestGuidance(testId).name,
          table: [{ Message: "This test couldn't run with your current data." }],
          insight: "Check Variable View: set measurement levels and ensure you have the required variable types, then try again.",
        }
      )
    } catch (err) {
      setResult({
        testId,
        testName: 'Error',
        table: [{ Error: err instanceof Error ? err.message : String(err) }],
        insight: 'Something went wrong running this test. Check your data and variable types.',
      })
    } finally {
      setRunningId(null)
    }
  }

  return (
    <section>
      <h2>Smart Test Suggester</h2>
      <p>
        Your dataset has <strong>{dataset.variables.length} variables</strong> and <strong>n = {n}</strong> rows.
        {n < 30 && (
          <span style={{ color: '#e67e22', marginLeft: 8 }}>
            ⚠ Sample size is under 30; consider non-parametric alternatives for group comparisons.
          </span>
        )}
      </p>

      <h3>📊 Tier 1 — Descriptive statistics (run first)</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER1.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      <h3>📈 Tier 2 — Bivariate: association & group comparison</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER2.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      <h3>🔬 Tier 3 — Regression & non-parametric</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER3.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      <h3>📐 Tier 4 — Multivariate</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER4.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      {result && (
        <div ref={resultPanelRef} data-testid="test-result-panel">
          <TestResultPanel
            result={result}
            onClose={() => setResult(null)}
          />
        </div>
      )}
    </section>
  )
}

function TestCard({
  testId,
  dataset,
  onRun,
  running,
}: {
  testId: TestId
  dataset: DatasetState
  onRun: () => void
  running: boolean
}) {
  const guidance = getTestGuidance(testId)
  const suggested = getSuggestedVariables(testId, dataset)
  const hasVars = suggested.variables.length > 0

  return (
    <div
      style={{
        border: '1px solid #bdc3c7',
        borderRadius: 8,
        padding: 14,
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>✅ {guidance.name}</div>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
        <strong>When to use:</strong> {guidance.whenToUse}
      </div>
      <div style={{ fontSize: 13, color: '#2c3e50', marginBottom: 6 }}>
        <strong>Applies to:</strong> {guidance.forLevels}
      </div>
      <div style={{ fontSize: 13, color: '#2c3e50', marginBottom: 6 }}>
        <strong>Analyzes:</strong>{' '}
        {hasVars
          ? suggested.variables.map((v) => `${v.label} (${v.role})`).join('; ')
          : 'No matching variables in your data — run anyway to see requirements.'}
      </div>
      <details style={{ fontSize: 12, color: '#6c757d', marginBottom: 10 }}>
        <summary style={{ cursor: 'pointer' }}>Assumptions & alternatives</summary>
        <p style={{ margin: '6px 0 4px' }}><strong>Assumptions:</strong> {guidance.assumptions}</p>
        <p style={{ margin: '4px 0 0' }}><strong>Alternatives:</strong> {guidance.alternatives}</p>
      </details>
      <button
        type="button"
        onClick={onRun}
        disabled={running}
        title="Run this analysis (always runs when you click; shows result or requirement message)"
        style={{
          padding: '0.35rem 0.75rem',
          background: running ? '#95a5a6' : '#3498db',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: running ? 'default' : 'pointer',
        }}
      >
        {running ? 'Running…' : 'Run this test'}
      </button>
    </div>
  )
}
