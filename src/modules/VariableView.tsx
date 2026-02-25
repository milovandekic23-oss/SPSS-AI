import { useCallback, useState } from 'react'
import type { DatasetState, VariableMeta, MeasurementLevel, VariableRole } from '../types'
import { parseCSV } from '../lib/csvParse'

const MEASUREMENT_LEVELS: { value: MeasurementLevel; label: string }[] = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'ordinal', label: 'Ordinal' },
  { value: 'scale', label: 'Scale' },
]

const ROLES: { value: VariableRole; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'input', label: 'Input' },
  { value: 'target', label: 'Target' },
  { value: 'id', label: 'ID' },
]

function MeasurementHelp({ level }: { level: MeasurementLevel }) {
  const help: Record<MeasurementLevel, string> = {
    nominal: 'Categories with no order (e.g. gender, country). You can count but not rank.',
    ordinal: 'Categories with order but unequal gaps (e.g. agree/neutral/disagree, education level).',
    scale: 'Real numbers where math makes sense (e.g. age, income). Averages and totals are meaningful.',
  }
  return <span title={help[level]} style={{ marginLeft: 4, opacity: 0.8 }}>ⓘ</span>
}

interface VariableViewProps {
  dataset: DatasetState | null
  onDatasetChange: (state: DatasetState | null) => void
}

export function VariableView({ dataset, onDatasetChange }: VariableViewProps) {
  const [error, setError] = useState<string | null>(null)
  const [summaryAck, setSummaryAck] = useState(false)

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setError(null)
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = String(reader.result)
          const { variables, rows } = parseCSV(text)
          if (variables.length === 0) {
            setError('No columns or data found in the CSV.')
            return
          }
          onDatasetChange({
            variables,
            rows,
            variableViewConfirmed: false,
          })
          setSummaryAck(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse CSV.')
        }
      }
      reader.readAsText(file, 'UTF-8')
    },
    [onDatasetChange]
  )

  const updateVariable = useCallback(
    (index: number, patch: Partial<VariableMeta>) => {
      if (!dataset) return
      const next = [...dataset.variables]
      next[index] = { ...next[index], ...patch }
      onDatasetChange({ ...dataset, variables: next })
    },
    [dataset, onDatasetChange]
  )

  const confirmVariableView = useCallback(() => {
    if (!dataset) return
    onDatasetChange({ ...dataset, variableViewConfirmed: true })
    setSummaryAck(true)
  }, [dataset, onDatasetChange])

  if (!dataset) {
    return (
      <section>
        <h2>Variable View — Smart Data Reader</h2>
        <p>Upload a CSV file to parse and configure variables (measurement level, labels, missing values).</p>
        <label style={{ display: 'inline-block', marginTop: 8 }}>
          <input type="file" accept=".csv" onChange={handleFile} />
        </label>
        {error && <p style={{ color: '#c0392b', marginTop: 8 }}>{error}</p>}
      </section>
    )
  }

  const nominal = dataset.variables.filter((v) => v.measurementLevel === 'nominal').length
  const ordinal = dataset.variables.filter((v) => v.measurementLevel === 'ordinal').length
  const scale = dataset.variables.filter((v) => v.measurementLevel === 'scale').length

  return (
    <section>
      <h2>Variable View</h2>
      <p>
        I found <strong>{dataset.variables.length} variables</strong>. {nominal} Nominal (categories), {ordinal} Ordinal
        (ranked), {scale} Scale (numeric). Review and edit anything that looks wrong, then confirm.
      </p>
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#ecf0f1', textAlign: 'left' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Label</th>
              <th style={thStyle}>Level</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Missing %</th>
            </tr>
          </thead>
          <tbody>
            {dataset.variables.map((v, i) => (
              <tr key={v.name} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={tdStyle}>
                  <input
                    value={v.name}
                    onChange={(e) => updateVariable(i, { name: e.target.value })}
                    style={{ width: '100%', maxWidth: 140 }}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    value={v.label}
                    onChange={(e) => updateVariable(i, { label: e.target.value })}
                    style={{ width: '100%', maxWidth: 180 }}
                  />
                </td>
                <td style={tdStyle}>
                  <select
                    value={v.measurementLevel}
                    onChange={(e) => updateVariable(i, { measurementLevel: e.target.value as MeasurementLevel })}
                  >
                    {MEASUREMENT_LEVELS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <MeasurementHelp level={v.measurementLevel} />
                </td>
                <td style={tdStyle}>
                  <select
                    value={v.role}
                    onChange={(e) => updateVariable(i, { role: e.target.value as VariableRole })}
                  >
                    {ROLES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={tdStyle}>
                  {v.missingPct > 0 ? (
                    <span style={v.missingPct > 30 ? { color: '#c0392b', fontWeight: 'bold' } : undefined}>
                      {v.missingPct}%
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          onClick={confirmVariableView}
          style={{
            padding: '0.5rem 1rem',
            background: '#27ae60',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Confirm variable view & continue
        </button>
        {dataset.variableViewConfirmed && summaryAck && (
          <span style={{ color: '#27ae60' }}>✅ Variable view confirmed. Use Test Suggester or Insights.</span>
        )}
      </div>
    </section>
  )
}

const thStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #ddd' }
const tdStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ddd' }
