import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
} from 'recharts'
import type { TestResult } from '../lib/statsRunner'
import { validateTestResult } from '../lib/resultValidator'
import { styles, theme } from '../theme'

const CHART_COLORS = [theme.colors.accent, '#2ecc71', '#e74c3c', '#9b59b6', '#f39c12']

/** Simple boxplot: one box per row, with min/q1/median/q3/max. */
function BoxplotChart({
  data,
  boxplotKeys,
  xKey,
}: {
  data: Record<string, string | number>[]
  boxplotKeys: { min: string; q1: string; median: string; q3: string; max: string }
  xKey?: string
}) {
  const num = (v: unknown): number => (typeof v === 'number' && !Number.isNaN(v) ? v : Number(v) ?? 0)
  const boxH = 40
  const w = 200

  return (
    <div style={{ width: '100%' }}>
      {data.map((row, i) => {
        const min = num(row[boxplotKeys.min])
        const q1 = num(row[boxplotKeys.q1])
        const med = num(row[boxplotKeys.median])
        const q3 = num(row[boxplotKeys.q3])
        const max = num(row[boxplotKeys.max])
        const range = max - min || 1
        const toX = (v: number) => (10 + ((v - min) / range) * (w - 20))
        const label = (xKey && row[xKey] != null ? String(row[xKey]) : `Group ${i + 1}`)
        const x1 = toX(q1)
        const x3 = toX(q3)
        const xMed = toX(med)
        const xMin = toX(min)
        const xMax = toX(max)
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 600 }}>{label}</div>
            <svg width="100%" height={boxH + 8} viewBox={`0 0 ${w} ${boxH + 8}`} preserveAspectRatio="xMidYMid meet">
              <line x1={xMin} x2={xMax} y1={boxH / 2} y2={boxH / 2} stroke="#333" strokeWidth={1} />
              <rect x={x1} y={4} width={x3 - x1} height={boxH - 8} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.7} stroke="#333" strokeWidth={1} />
              <line x1={xMed} x2={xMed} y1={4} y2={boxH - 4} stroke="#333" strokeWidth={1.5} />
            </svg>
            <div style={{ fontSize: 11, color: '#666' }}>min {min.toFixed(1)} · Q1 {q1.toFixed(1)} · median {med.toFixed(1)} · Q3 {q3.toFixed(1)} · max {max.toFixed(1)}</div>
          </div>
        )
      })}
    </div>
  )
}

interface TestResultPanelProps {
  result: TestResult
  onClose?: () => void
}

/** Resolve display value: use value label for a variable's code when available. */
function cellDisplay(
  header: string,
  value: unknown,
  valueLabelMaps?: Record<string, Record<string, string>>,
  varName?: string
): string {
  if (value == null) return '—'
  const s = String(value)
  if (header === 'Value' && valueLabelMaps && varName && valueLabelMaps[varName]?.[s]) return valueLabelMaps[varName][s]
  return s
}

export function TestResultPanel({ result, onClose }: TestResultPanelProps) {
  const { testName, table, chart, insight, keyStat, variablesAnalyzed, plainLanguage, nextStep, valueLabelMaps, effectSize, effectSizeLabel } = result
  const hasPValue = Array.isArray(table) && table.some((r) => r && typeof r === 'object' && String((r as Record<string, unknown>).Statistic ?? '').toLowerCase().includes('p-value'))
  const safeTable = Array.isArray(table) ? table : []
  const tableHeaders = safeTable.length > 0 ? Object.keys(safeTable[0]) : []
  const safeChart = chart && Array.isArray(chart.data) && chart.data.length > 0 ? chart : null
  const resultValidation = validateTestResult(result)
  const canTogglePercent = safeChart?.type === 'bar' && safeChart.percentKey && safeChart.data.every((d) => safeChart.percentKey && d[safeChart.percentKey] != null)
  const [chartShowPercent, setChartShowPercent] = useState(true)
  const valueVarName = tableHeaders.includes('Value') ? variablesAnalyzed?.[0]?.name : undefined

  return (
    <div
      style={{
        marginTop: 24,
        ...styles.chartContainer,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, ...styles.suggestionTitle, fontSize: 18 }}>📊 {testName}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              ...styles.btn,
              marginTop: 0,
              padding: '8px 16px',
              fontSize: 12,
            }}
          >
            Close
          </button>
        )}
      </div>

      {variablesAnalyzed && variablesAnalyzed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <strong style={styles.textLabel}>Questions analyzed:</strong>
          <ul style={{ margin: '6px 0 0 20px', padding: 0, ...styles.textBody }}>
            {variablesAnalyzed.map((v, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {v.label}
                {v.role && <span style={{ color: '#6c757d', fontSize: 12 }}> ({v.role})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.testId === 'ttest' && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: theme.colors.textMuted, ...styles.textBody }}>
          Assumptions: independence; approximate normality of the outcome in each group. Welch t is reported by default (robust to unequal variances). Check Levene&apos;s test in the table.
        </p>
      )}
      {result.testId === 'anova' && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: theme.colors.textMuted, ...styles.textBody }}>
          Assumptions: independence; approximate normality within each group; homogeneity of variances (Levene&apos;s test in table).
        </p>
      )}
      {keyStat && (
        <p style={{ margin: '0 0 12px', ...styles.textBody, fontWeight: 600 }}>
          Key result: {keyStat}
        </p>
      )}

      <div
        style={{
          marginBottom: 16,
          padding: 14,
          background: theme.colors.background,
          borderLeft: `4px solid ${theme.colors.accent}`,
          borderRadius: 4,
        }}
      >
        <strong style={styles.textLabel}>💡 What this result means</strong>
        <p style={{ margin: '8px 0 0', ...styles.textBody }}>{insight}</p>
        {plainLanguage && (
          <p style={{ margin: '10px 0 0', lineHeight: 1.5, color: '#2c3e50', fontSize: 14, fontStyle: 'italic' }}>
            {plainLanguage}
          </p>
        )}
        {nextStep && (
          <p style={{ margin: '8px 0 0', lineHeight: 1.5, color: '#27ae60', fontSize: 13, fontWeight: 500 }}>
            {nextStep}
          </p>
        )}
      </div>

      <div style={{ fontSize: 12, marginBottom: 16 }} data-testid="result-supervisor">
        <strong>Result check:</strong>{' '}
        {resultValidation.consistent ? (
          <span style={{ color: '#27ae60' }}>Result and interpretation are consistent.</span>
        ) : (
          <span style={{ color: '#e67e22' }}>{resultValidation.issues.join(' ')}</span>
        )}
      </div>
      {hasPValue && (
        <p style={{ fontSize: 12, marginBottom: 16, color: '#7f8c8d', fontStyle: 'italic' }}>
          Small p-value does not mean large effect; check effect size for practical importance.
          {effectSize != null && effectSizeLabel && (
            <span style={{ marginLeft: 6 }}>
              {effectSizeLabel} = {typeof effectSize === 'number' ? (effectSize < 0.01 ? effectSize.toFixed(3) : effectSize.toFixed(2)) : effectSize}.
            </span>
          )}
        </p>
      )}

      {safeTable.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {tableHeaders.map((h) => (
                  <th key={h} style={styles.tableHeader}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeTable.map((row, i) => (
                <tr key={i}>
                  {tableHeaders.map((h) => (
                    <td key={h} style={styles.tableCell}>
                      {cellDisplay(h, row[h], valueLabelMaps, valueVarName)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {safeChart && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, color: '#555' }}>{safeChart.title}</h4>
            {canTogglePercent && safeChart.percentKey && (
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#6c757d' }}>Show:</span>
                <select
                  value={chartShowPercent ? 'percent' : 'count'}
                  onChange={(e) => setChartShowPercent(e.target.value === 'percent')}
                  style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #bdc3c7', fontSize: 12 }}
                >
                  <option value="percent">Percentages (%)</option>
                  <option value="count">Counts</option>
                </select>
              </label>
            )}
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              {safeChart.type === 'bar' ? (
                <BarChart data={safeChart.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey={safeChart.xKey} tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={
                      canTogglePercent && chartShowPercent && safeChart.percentKey
                        ? (v: number) => `${v}%`
                        : undefined
                    }
                  />
                  <Tooltip
                    formatter={
                      canTogglePercent && chartShowPercent && safeChart.percentKey
                        ? (v: number) => [`${v}%`, 'Percent']
                        : undefined
                    }
                    labelFormatter={(label) => String(label)}
                  />
                  <Bar
                    dataKey={canTogglePercent && chartShowPercent && safeChart.percentKey ? safeChart.percentKey : safeChart.yKey ?? 'value'}
                    fill={CHART_COLORS[0]}
                    radius={[4, 4, 0, 0]}
                    name={canTogglePercent && chartShowPercent && safeChart.percentKey ? 'Percent' : 'Count'}
                  />
                </BarChart>
              ) : safeChart.type === 'scatter' ? (
                <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey={safeChart.xKey} name="X" tick={{ fontSize: 12 }} />
                  <YAxis dataKey={safeChart.yKey ?? 'y'} name="Y" tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={safeChart.data} fill={CHART_COLORS[0]}>
                    {safeChart.data.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              ) : safeChart.type === 'boxplot' && safeChart.boxplotKeys ? (
                <BoxplotChart data={safeChart.data} boxplotKeys={safeChart.boxplotKeys} xKey={safeChart.xKey} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#7f8c8d' }}>
                  Chart type not supported
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
