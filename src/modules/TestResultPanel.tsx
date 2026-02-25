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

const CHART_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f39c12']

interface TestResultPanelProps {
  result: TestResult
  onClose?: () => void
}

export function TestResultPanel({ result, onClose }: TestResultPanelProps) {
  const { testName, table, chart, insight, keyStat } = result
  const tableHeaders = table.length > 0 ? Object.keys(table[0]) : []

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

      {table.length > 0 && (
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
              {table.map((row, i) => (
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

      {chart && chart.data.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#555' }}>{chart.title}</h4>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chart.type === 'bar' ? (
                <BarChart data={chart.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey={chart.xKey} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey={chart.yKey ?? 'value'} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : chart.type === 'scatter' ? (
                <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey={chart.xKey} name="X" tick={{ fontSize: 12 }} />
                  <YAxis dataKey={chart.yKey ?? 'y'} name="Y" tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={chart.data} fill={CHART_COLORS[0]}>
                    {chart.data.map((_, i) => (
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
