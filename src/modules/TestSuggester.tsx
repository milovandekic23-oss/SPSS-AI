import { useState } from 'react'
import type { DatasetState } from '../types'
import { getSuggestedVariables, runTest, type TestId, type TestResult } from '../lib/statsRunner'
import { TestResultPanel } from './TestResultPanel'

interface TestSuggesterProps {
  dataset: DatasetState
}

const TIER1: { id: TestId; name: string; forLevels: string }[] = [
  { id: 'freq', name: 'Frequencies & percentages', forLevels: 'Nominal/Ordinal' },
  { id: 'desc', name: 'Mean, Median, SD, Min, Max', forLevels: 'Scale' },
  { id: 'missing', name: 'Missing value summary', forLevels: 'All' },
]

const TIER2: { id: TestId; name: string; forLevels: string }[] = [
  { id: 'crosstab', name: 'Crosstabulation + Chi-Square', forLevels: 'Nominal × Nominal' },
  { id: 'corr', name: 'Correlation (Pearson / Spearman)', forLevels: 'Scale × Scale or Ordinal' },
  { id: 'ttest', name: 'Independent Samples T-Test', forLevels: 'Scale outcome, 2 groups' },
  { id: 'anova', name: 'One-Way ANOVA', forLevels: 'Scale outcome, 3+ groups' },
]

const TIER3: { id: TestId; name: string; forLevels: string }[] = [
  { id: 'linreg', name: 'Linear Regression', forLevels: 'Predict Scale outcome' },
  { id: 'logreg', name: 'Logistic Regression', forLevels: 'Predict Binary outcome' },
  { id: 'mann', name: 'Mann-Whitney U / Kruskal-Wallis', forLevels: 'Non-parametric' },
  { id: 'paired', name: 'Paired T-Test / Repeated Measures ANOVA', forLevels: 'Within-subject' },
]

export function TestSuggester({ dataset }: TestSuggesterProps) {
  const [result, setResult] = useState<TestResult | null>(null)
  const [runningId, setRunningId] = useState<TestId | null>(null)
  const n = dataset.rows.length

  const handleRun = (testId: TestId) => {
    setRunningId(testId)
    setResult(null)
    try {
      const res = runTest(testId, dataset)
      if (res) {
        setResult(res)
      } else {
        setResult({
          testId,
          testName: TIER1.find((t) => t.id === testId)?.name ?? TIER2.find((t) => t.id === testId)?.name ?? TIER3.find((t) => t.id === testId)?.name ?? testId,
          table: [{ Message: "This test couldn't run with your current data." }],
          insight: "Not enough suitable variables or data (e.g. need scale variables for descriptive/correlation, or a 2-group categorical for t-test). Check Variable View: set measurement levels and try again.",
        })
      }
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

      <h3>📊 Tier 1 — Descriptive Statistics</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER1.map((t) => (
          <li key={t.id} style={{ marginBottom: 12 }}>
            <TestCard
              name={t.name}
              forLevels={t.forLevels}
              testId={t.id}
              dataset={dataset}
              onRun={() => handleRun(t.id)}
              running={runningId === t.id}
            />
          </li>
        ))}
      </ul>

      <h3>📈 Tier 2 — Explore Relationships</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER2.map((t) => (
          <li key={t.id} style={{ marginBottom: 12 }}>
            <TestCard
              name={t.name}
              forLevels={t.forLevels}
              testId={t.id}
              dataset={dataset}
              onRun={() => handleRun(t.id)}
              running={runningId === t.id}
            />
          </li>
        ))}
      </ul>

      <h3>🔬 Tier 3 — Advanced / Inferential</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER3.map((t) => (
          <li key={t.id} style={{ marginBottom: 12 }}>
            <TestCard
              name={t.name}
              forLevels={t.forLevels}
              testId={t.id}
              dataset={dataset}
              onRun={() => handleRun(t.id)}
              running={runningId === t.id}
            />
          </li>
        ))}
      </ul>

      {result && (
        <TestResultPanel
          result={result}
          onClose={() => setResult(null)}
        />
      )}
    </section>
  )
}

function TestCard({
  name,
  forLevels,
  testId,
  dataset,
  onRun,
  running,
}: {
  name: string
  forLevels: string
  testId: TestId
  dataset: DatasetState
  onRun: () => void
  running: boolean
}) {
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
      <div style={{ fontWeight: 600, marginBottom: 4 }}>✅ {name}</div>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>Applies to: {forLevels}</div>
      <div style={{ fontSize: 13, color: '#2c3e50', marginBottom: 8 }}>
        <strong>Analyzes:</strong>{' '}
        {hasVars
          ? suggested.variables.map((v) => `${v.label} (${v.role})`).join('; ')
          : 'No matching variables in your data — add nominal/scale variables to run this test.'}
      </div>
      <div style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 10 }}>
        {suggested.description}
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={running || !hasVars}
        style={{
          padding: '0.35rem 0.75rem',
          background: running || !hasVars ? '#95a5a6' : '#3498db',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: running || !hasVars ? 'default' : 'pointer',
        }}
      >
        {running ? 'Running…' : 'Run this test'}
      </button>
    </div>
  )
}
