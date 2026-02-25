import { useState } from 'react'
import type { DatasetState } from '../types'

interface TestSuggesterProps {
  dataset: DatasetState
}

/** Placeholder: real implementation would analyze data and list tests per spec */
const TIER1 = [
  { id: 'freq', name: 'Frequencies & percentages', forLevels: 'Nominal/Ordinal' },
  { id: 'desc', name: 'Mean, Median, SD, Min, Max', forLevels: 'Scale' },
  { id: 'missing', name: 'Missing value summary', forLevels: 'All' },
]

const TIER2 = [
  { id: 'crosstab', name: 'Crosstabulation + Chi-Square', forLevels: 'Nominal × Nominal' },
  { id: 'corr', name: 'Correlation (Pearson / Spearman)', forLevels: 'Scale × Scale or Ordinal' },
  { id: 'ttest', name: 'Independent Samples T-Test', forLevels: 'Scale outcome, 2 groups' },
  { id: 'anova', name: 'One-Way ANOVA', forLevels: 'Scale outcome, 3+ groups' },
]

const TIER3 = [
  { id: 'linreg', name: 'Linear Regression', forLevels: 'Predict Scale outcome' },
  { id: 'logreg', name: 'Logistic Regression', forLevels: 'Predict Binary outcome' },
  { id: 'mann', name: 'Mann-Whitney U / Kruskal-Wallis', forLevels: 'Non-parametric' },
  { id: 'paired', name: 'Paired T-Test / Repeated Measures ANOVA', forLevels: 'Within-subject' },
]

export function TestSuggester({ dataset }: TestSuggesterProps) {
  const [runId, setRunId] = useState<string | null>(null)
  const n = dataset.rows.length

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
              id={t.id}
              onRun={() => setRunId(t.id)}
              running={runId === t.id}
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
              id={t.id}
              onRun={() => setRunId(t.id)}
              running={runId === t.id}
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
              id={t.id}
              onRun={() => setRunId(t.id)}
              running={runId === t.id}
            />
          </li>
        ))}
      </ul>

      {runId && (
        <div style={{ marginTop: 24, padding: 16, background: '#ecf0f1', borderRadius: 8 }}>
          <strong>Result placeholder</strong>: Run &quot;{runId}&quot; — actual statistics will be computed here (e.g.
          p-value, effect size). Plain-language interpretation will appear below.
        </div>
      )}
    </section>
  )
}

function TestCard({
  name,
  forLevels,
  id: _id,
  onRun,
  running,
}: {
  name: string
  forLevels: string
  id: string
  onRun: () => void
  running: boolean
}) {
  return (
    <div
      style={{
        border: '1px solid #bdc3c7',
        borderRadius: 8,
        padding: 12,
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>✅ {name}</div>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 8 }}>Applies to: {forLevels}</div>
      <button
        type="button"
        onClick={onRun}
        disabled={running}
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
