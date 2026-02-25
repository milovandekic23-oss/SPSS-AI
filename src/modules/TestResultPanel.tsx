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

const CHART_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f39c12']

interface TestResultPanelProps {
  result: TestResult
  onClose?: () => void
}

export function TestResultPanel({ result, onClose }: TestResultPanelProps) {
  const { testName, table, chart, insight, keyStat } = result
  const safeTable = Array.isArray(table) ? table : []
  const tableHeaders = safeTable.length > 0 ? Object.keys(safeTable[0]) : []
  const safeChart = chart && Array.isArray(chart.data) && chart.data.length > 0 ? chart : null
  const resultValidation = validateTestResult(result)

  return (
    <div
      style={{
        marginTop: 24,
        padding: 20,
        background: '#fff',
        border: '1px solid #bdc3c7',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📊 {testName}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #bdc3c7',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Close
          </button>
        )}
      </div>

      {keyStat && (
        <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#2c3e50' }}>
          Key result: {keyStat}
        </p>
      )}

      <p style={{ margin: '0 0 16px', lineHeight: 1.5, color: '#34495e' }}>💡 {insight}</p>

      <div style={{ fontSize: 12, marginBottom: 16 }} data-testid="result-supervisor">
        <strong>Result check:</strong>{' '}
        {resultValidation.consistent ? (
          <span style={{ color: '#27ae60' }}>Result and interpretation are consistent.</span>
        ) : (
          <span style={{ color: '#e67e22' }}>{resultValidation.issues.join(' ')}</span>
        )}
      </div>

      {safeTable.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#ecf0f1', textAlign: 'left' }}>
                {tableHeaders.map((h) => (
                  <th key={h} style={{ padding: '8px 10px', border: '1px solid #ddd' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeTable.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  {tableHeaders.map((h) => (
                    <td key={h} style={{ padding: '6px 10px', border: '1px solid #ddd' }}>
                      {String(row[h] ?? '—')}
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
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#555' }}>{safeChart.title}</h4>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              {safeChart.type === 'bar' ? (
                <BarChart data={safeChart.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey={safeChart.xKey} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey={safeChart.yKey ?? 'value'} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
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
