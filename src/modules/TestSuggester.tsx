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
const TIER2: TestId[] = ['crosstab', 'corr', 'spearman', 'ttest', 'anova', 'goodness', 'onesamplet', 'pointbiserial']
const TIER3: TestId[] = ['linreg', 'logreg', 'mann', 'paired']
const TIER4: TestId[] = ['pca']

export function TestSuggester({ dataset }: TestSuggesterProps) {
  const [result, setResult] = useState<TestResult | null>(null)
  const [resultList, setResultList] = useState<TestResult[] | null>(null)
  const [runningId, setRunningId] = useState<TestId | null>(null)
  const resultPanelRef = useRef<HTMLDivElement>(null)
  const n = dataset.rows.length
  const includedVars = dataset.variables.filter((v) => v.includeInAnalysis !== false)
  const categoricalVars = includedVars.filter(
    (v) => v.measurementLevel === 'nominal' || v.measurementLevel === 'ordinal'
  )

  useEffect(() => {
    if ((result || resultList?.length) && resultPanelRef.current && typeof resultPanelRef.current.scrollIntoView === 'function') {
      resultPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [result, resultList])

  const handleRun = (testId: TestId) => {
    setRunningId(testId)
    setResult(null)
    setResultList(null)
    try {
      if (testId === 'freq' && categoricalVars.length > 0) {
        const results: TestResult[] = []
        for (const v of categoricalVars) {
          const res = runTest('freq', dataset, [v.name])
          if (res) results.push(res)
        }
        setResultList(results.length > 0 ? results : null)
        if (results.length === 0) {
          setResult({
            testId: 'freq',
            testName: 'Frequencies & percentages',
            table: [{ Message: "No categorical variables to analyze. Set at least one variable to Nominal or Ordinal in Variable View." }],
            insight: "Add nominal or ordinal variables to run frequencies.",
          })
        }
      } else {
        const res = runTest(testId, dataset)
        setResult(
          res ?? {
            testId,
            testName: getTestGuidance(testId).name,
            table: [{ Message: "This test couldn't run with your current data." }],
            insight: "Check Variable View: set measurement levels and ensure you have the required variable types, then try again.",
          }
        )
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

      <h3 style={{ ...styles.textLabel, marginBottom: 12, opacity: 0.7 }}>Custom pivot / Cross-tab</h3>
      <p style={{ ...styles.textBody, marginBottom: 12, fontSize: 13, opacity: 0.85 }}>
        Cross-examine how segments rate questions. Choose one segment (e.g. department) and one or more variables to compare (e.g. satisfaction). Shown in percentages (nominal) or means (scale).
      </p>
      <CustomPivotCard
        dataset={dataset}
        onRun={(segmentVar, outcomeVars) => {
          setResultList(null)
          setResult(null)
          setRunningId('pivot')
          try {
            const res = runTest('pivot', dataset, [segmentVar, ...outcomeVars])
            setResult(
              res ?? {
                testId: 'pivot',
                testName: 'Custom pivot',
                table: [{ Message: "Select a segment variable and at least one variable to compare, then run." }],
                insight: "Use the dropdowns above to choose segment and variables.",
              }
            )
          } catch (err) {
            setResult({
              testId: 'pivot',
              testName: 'Error',
              table: [{ Error: err instanceof Error ? err.message : String(err) }],
              insight: 'Something went wrong.',
            })
          } finally {
            setRunningId(null)
          }
        }}
        running={runningId === 'pivot'}
      />

      {(result || (resultList && resultList.length > 0)) && (
        <div ref={resultPanelRef} data-testid="test-result-panel">
          {resultList && resultList.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ ...styles.textLabel, fontSize: 18, margin: 0 }}>✅ Frequencies & percentages</h3>
                <button
                  type="button"
                  onClick={() => { setResultList(null); setResult(null) }}
                  style={{ ...styles.btn, marginTop: 0, fontSize: 12 }}
                >
                  Close
                </button>
              </div>
              <p style={{ ...styles.textBody, marginBottom: 16, opacity: 0.9 }}>
                All {resultList.length} categorical question{resultList.length === 1 ? '' : 's'} analyzed. Each section shows number and question title.
              </p>
              {resultList.map((r, i) => {
                const label = r.variablesAnalyzed?.[0]?.label ?? r.variablesAnalyzed?.[0]?.name ?? `Variable ${i + 1}`
                return (
                  <div
                    key={i}
                    style={{
                      marginBottom: 24,
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: theme.colors.surface,
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        background: theme.colors.background,
                        borderBottom: `1px solid ${theme.colors.border}`,
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {i + 1}. {label}
                    </div>
                    <div style={{ padding: 12 }}>
                      <TestResultPanel result={r} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : result ? (
            <TestResultPanel result={result} onClose={() => setResult(null)} />
          ) : null}
        </div>
      )}
    </section>
  )
}

function CustomPivotCard({
  dataset,
  onRun,
  running,
}: {
  dataset: DatasetState
  onRun: (segmentVar: string, outcomeVars: string[]) => void
  running: boolean
}) {
  const includedVars = dataset.variables.filter((v) => v.includeInAnalysis !== false)
  const segmentVars = includedVars.filter(
    (v) => v.measurementLevel === 'nominal' || v.measurementLevel === 'ordinal'
  )
  const compareVars = includedVars
  const [segmentVar, setSegmentVar] = useState(segmentVars[0]?.name ?? '')
  const [selectedCompare, setSelectedCompare] = useState<Set<string>>(new Set())

  const toggleCompare = (name: string) => {
    setSelectedCompare((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleRun = () => {
    if (!segmentVar || selectedCompare.size === 0) return
    onRun(segmentVar, Array.from(selectedCompare))
  }

  return (
    <div
      style={{
        ...styles.suggestionCard,
        borderLeft: `4px solid ${theme.colors.accent}`,
      }}
    >
      <div style={{ ...styles.suggestionTitle, fontSize: 18, marginBottom: 8 }}>📊 Custom pivot / Cross-tab</div>
      <div style={{ ...styles.textBody, marginBottom: 12 }}>
        Choose a segment (rows) and variables to compare (columns). Nominal/ordinal shown as %; scale as mean.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Segment by (rows)</label>
          <select
            value={segmentVar}
            onChange={(e) => setSegmentVar(e.target.value)}
            style={{ minWidth: 180, padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">— Select segment —</option>
            {segmentVars.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label.length > 50 ? v.label.slice(0, 47) + '…' : v.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Variables to compare (e.g. satisfaction)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {compareVars
              .filter((v) => v.name !== segmentVar)
              .map((v) => (
                <label key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={selectedCompare.has(v.name)}
                    onChange={() => toggleCompare(v.name)}
                  />
                  <span title={v.label}>{v.label.length > 40 ? v.label.slice(0, 37) + '…' : v.label}</span>
                </label>
              ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleRun}
        disabled={running || !segmentVar || selectedCompare.size === 0}
        style={{
          ...styles.btn,
          ...styles.btnPrimary,
          marginTop: 0,
          opacity: running || !segmentVar || selectedCompare.size === 0 ? 0.6 : 1,
          cursor: running || !segmentVar || selectedCompare.size === 0 ? 'default' : 'pointer',
        }}
      >
        {running ? 'Running…' : 'Run pivot'}
      </button>
    </div>
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
