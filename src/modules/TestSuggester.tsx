import { useState, useRef, useEffect } from 'react'
import type { DatasetState } from '../types'
import { getSuggestedVariables, runTest, type TestId, type TestResult } from '../lib/statsRunner'
import { getTestGuidance } from '../lib/statisticalGuidance'
import { validateTestChoice } from '../lib/testChoiceValidator'
import { TestResultPanel } from './TestResultPanel'
import { styles, theme } from '../theme'

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
      <header style={styles.sectionHeader}>
        <h2 style={styles.textSection}>
          Recommended Tests<sup style={styles.sup}>2</sup>
        </h2>
      </header>
      <p style={{ ...styles.textBody, marginBottom: 24 }}>
        Your dataset has <strong>{dataset.variables.length} variables</strong> and <strong>n = {n}</strong> rows.
        {n < 30 && (
          <span style={{ marginLeft: 8, opacity: 0.8 }}>
            ⚠ Sample size is under 30; consider non-parametric alternatives for group comparisons.
          </span>
        )}
      </p>

      <h3 style={{ ...styles.textLabel, marginBottom: 12, opacity: 0.7 }}>Tier 1 — Descriptive statistics (run first)</h3>
      <p style={{ ...styles.textBody, marginBottom: 12, fontSize: 13, opacity: 0.85 }}>
        Summarize before segmenting: run these to understand the average respondent, then use Tier 2 to compare groups.
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER1.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      <h3 style={{ ...styles.textLabel, marginBottom: 12, opacity: 0.7 }}>Tier 2 — Bivariate: association & group comparison</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER2.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      <h3 style={{ ...styles.textLabel, marginBottom: 12, opacity: 0.7 }}>Tier 3 — Regression & non-parametric</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER3.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      <h3 style={{ ...styles.textLabel, marginBottom: 12, opacity: 0.7 }}>Tier 4 — Multivariate</h3>
      {dataset.questionGroups?.some(
        (g) => dataset.variables.filter((v) => v.measurementLevel === 'scale' && g.variableNames.includes(v.name)).length >= 5
      ) && (
        <p style={{ ...styles.textBody, marginBottom: 12, fontSize: 13, opacity: 0.85 }}>
          You have a question group with 5+ scale variables — consider PCA to reduce dimensions to fewer themes.
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {TIER4.map((id) => (
          <li key={id} style={{ marginBottom: 12 }}>
            <TestCard testId={id} dataset={dataset} onRun={() => handleRun(id)} running={runningId === id} />
          </li>
        ))}
      </ul>

      {result && (
        <div ref={resultPanelRef} data-testid="test-result-panel">
          <TestResultPanel result={result} onClose={() => setResult(null)} />
        </div>
      )}
    </section>
  )
}

const MAX_LABEL_LENGTH = 80

function truncateLabel(label: string): string {
  if (label.length <= MAX_LABEL_LENGTH) return label
  return label.slice(0, MAX_LABEL_LENGTH).trim() + '…'
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
  const choiceValidation = validateTestChoice(testId, dataset)

  return (
    <div
      data-testid={`test-card-${testId}`}
      style={{
        ...styles.suggestionCard,
        borderLeft: `4px solid ${theme.colors.accent}`,
      }}
    >
      <div style={{ ...styles.suggestionTitle, fontSize: 18, marginBottom: 4 }}>✅ {guidance.name}</div>
      <div style={{ ...styles.textBody, marginBottom: 10 }}>
        {guidance.summary}
      </div>
      <details style={{ fontSize: 13, color: '#2c3e50', marginBottom: 8 }}>
        <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
          <strong>Questions / variables in this analysis:</strong>{' '}
          {hasVars
            ? `${suggested.variables.length} variable${suggested.variables.length === 1 ? '' : 's'} — click to expand`
            : 'No matching variables — run anyway to see requirements'}
        </summary>
        {hasVars && (
          <ul style={{ margin: '8px 0 0 16px', paddingLeft: 8 }}>
            {suggested.variables.map((v, i) => {
              const displayLabel = truncateLabel(v.label)
              const showRole = v.role && v.role !== 'variable'
              return (
                <li key={`${v.name}-${v.role}-${i}`} style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }} title={v.label.length > MAX_LABEL_LENGTH ? v.label : undefined}>
                    {displayLabel}
                  </span>
                  {showRole && (
                    <span style={{ color: '#6c757d', fontSize: 12 }}> ({v.role})</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </details>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
        <strong>Applies to:</strong> {guidance.forLevels}
      </div>
      <details style={{ fontSize: 12, color: '#6c757d', marginBottom: 8 }}>
        <summary style={{ cursor: 'pointer' }}>When to use (expand)</summary>
        <p style={{ margin: '6px 0 0' }}>{guidance.whenToUse}</p>
      </details>
      <div style={{ fontSize: 12, marginBottom: 10 }} data-testid={`supervisor-${testId}`}>
        <strong>Supervisor:</strong>{' '}
        {choiceValidation.valid ? (
          <span style={{ color: '#27ae60' }}>
            OK to run.
            {choiceValidation.warnings.length > 0 && (
              <span style={{ color: '#e67e22' }}> {choiceValidation.warnings.join(' ')}</span>
            )}
            {choiceValidation.suggestedAlternative && (
              <span style={{ color: '#3498db' }}>
                {' '}
                Consider {getTestGuidance(choiceValidation.suggestedAlternative).name} instead.
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: '#e74c3c' }}>
            {choiceValidation.warnings.join(' ')}
            {choiceValidation.suggestedAlternative && (
              <span style={{ color: '#3498db' }}>
                {' '}
                Try {getTestGuidance(choiceValidation.suggestedAlternative).name} instead.
              </span>
            )}
          </span>
        )}
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
          ...styles.btn,
          ...styles.btnPrimary,
          marginTop: 8,
          opacity: running ? 0.7 : 1,
          cursor: running ? 'default' : 'pointer',
        }}
      >
        {running ? 'Running…' : 'Run this test'}
      </button>
    </div>
  )
}
