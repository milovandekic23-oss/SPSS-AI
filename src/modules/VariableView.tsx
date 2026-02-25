import { useCallback, useState } from 'react'
import type {
  DatasetState,
  VariableMeta,
  MeasurementLevel,
  VariableRole,
  VariableType,
  QuestionGroup,
  QuestionGroupType,
} from '../types'
import { parseCSV } from '../lib/csvParse'

const MEASUREMENT_LEVELS: { value: MeasurementLevel; label: string }[] = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'ordinal', label: 'Ordinal' },
  { value: 'scale', label: 'Scale' },
]

/** SPSS-style labels for Measure (measurement level) */
const MEASURE_LABELS: Record<MeasurementLevel, string> = {
  nominal: 'Nominal (categories, no order)',
  ordinal: 'Ordinal (ordered categories)',
  scale: 'Scale (numeric, continuous)',
}

const ROLES: { value: VariableRole; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'input', label: 'Input' },
  { value: 'target', label: 'Target' },
  { value: 'id', label: 'ID' },
]

/** SPSS-style type labels */
const VARIABLE_TYPE_LABELS: Record<VariableType, string> = {
  string: 'String',
  integer: 'Numeric (integer)',
  decimal: 'Numeric (decimal)',
  date: 'Date',
  boolean: 'Yes/No',
}

const QUESTION_GROUP_TYPES: { value: QuestionGroupType; label: string }[] = [
  { value: 'checkbox', label: 'Checkbox (multiple response)' },
  { value: 'matrix', label: 'Matrix question' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'group', label: 'Group (other)' },
]

function ColHeader({ title, help }: { title: string; help?: string }) {
  return (
    <th style={thStyle} title={help}>
      {title}
      {help && <span style={{ marginLeft: 4, opacity: 0.7, fontWeight: 'normal' }} title={help}>ⓘ</span>}
    </th>
  )
}

interface VariableViewProps {
  dataset: DatasetState | null
  onDatasetChange: (state: DatasetState | null) => void
}

function nextGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function VariableView({ dataset, onDatasetChange }: VariableViewProps) {
  const [error, setError] = useState<string | null>(null)
  const [summaryAck, setSummaryAck] = useState(false)

  const questionGroups: QuestionGroup[] = dataset?.questionGroups ?? []

  const getGroupIdForVariable = useCallback(
    (varName: string): string => {
      const g = questionGroups.find((gr) => gr.variableNames.includes(varName))
      return g?.id ?? ''
    },
    [questionGroups]
  )

  const assignVariableToGroup = useCallback(
    (varName: string, groupId: string) => {
      if (!dataset) return
      let next = questionGroups.map((g) => ({
        ...g,
        variableNames: g.variableNames.filter((n) => n !== varName),
      }))
      if (groupId === '__new__') {
        const id = nextGroupId()
        next = [...next, { id, label: 'New question', type: 'group', variableNames: [varName] }]
      } else if (groupId) {
        next = next.map((g) =>
          g.id === groupId ? { ...g, variableNames: [...g.variableNames, varName] } : g
        )
      }
      next = next.filter((g) => g.variableNames.length > 0)
      onDatasetChange({ ...dataset, questionGroups: next })
    },
    [dataset, questionGroups, onDatasetChange]
  )

  const addQuestionGroup = useCallback(() => {
    if (!dataset) return
    const id = nextGroupId()
    onDatasetChange({
      ...dataset,
      questionGroups: [...questionGroups, { id, label: 'New question', type: 'group', variableNames: [] }],
    })
  }, [dataset, questionGroups, onDatasetChange])

  const removeQuestionGroup = useCallback(
    (id: string) => {
      if (!dataset) return
      onDatasetChange({
        ...dataset,
        questionGroups: questionGroups.filter((g) => g.id !== id),
      })
    },
    [dataset, questionGroups, onDatasetChange]
  )

  const updateGroup = useCallback(
    (id: string, patch: Partial<Pick<QuestionGroup, 'label' | 'type'>>) => {
      if (!dataset) return
      onDatasetChange({
        ...dataset,
        questionGroups: questionGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      })
    },
    [dataset, questionGroups, onDatasetChange]
  )

  const removeVariableFromGroup = useCallback(
    (varName: string, groupId: string) => {
      if (!dataset) return
      const next = questionGroups.map((g) =>
        g.id === groupId ? { ...g, variableNames: g.variableNames.filter((n) => n !== varName) } : g
      ).filter((g) => g.variableNames.length > 0)
      onDatasetChange({ ...dataset, questionGroups: next })
    },
    [dataset, questionGroups, onDatasetChange]
  )

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
            questionGroups: [],
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
  const included = dataset.variables.filter((v) => v.includeInAnalysis !== false).length
  const excluded = dataset.variables.length - included

  return (
    <section>
      <h2>Variable View</h2>
      <p>
        <strong>{dataset.variables.length} variables</strong> — {nominal} Nominal, {ordinal} Ordinal, {scale} Scale.
        {excluded > 0 && (
          <span style={{ marginLeft: 8, color: '#7f8c8d' }}>
            {included} included in analysis, {excluded} excluded (uncheck &quot;In analysis&quot; to exclude).
          </span>
        )}
      </p>
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ background: '#ecf0f1', textAlign: 'left' }}>
              <ColHeader title="Name" help="Column name (e.g. Q1_age). Like SPSS Variable Name." />
              <ColHeader title="Type" help="How the value is stored: String, Numeric, Date, Yes/No." />
              <ColHeader title="Label" help="Human-readable description. Like SPSS Variable Label." />
              <ColHeader title="Measure" help="Nominal = categories, no order. Ordinal = ordered categories. Scale = numeric, continuous. Like SPSS Measure." />
              <ColHeader title="Role" help="Input, Target, or ID. Used by some analyses. Like SPSS Role." />
              <ColHeader title="Missing %" help="Share of empty or missing values in this column." />
              <ColHeader title="Question group" help="Group columns that belong to one question (e.g. checkbox set, matrix)." />
              <ColHeader title="In analysis" help="Uncheck to exclude this variable from test suggestions and analyses (like hiding in SPSS)." />
            </tr>
          </thead>
          <tbody>
            {dataset.variables.map((v, i) => (
              <tr
                key={v.name}
                style={{
                  borderBottom: '1px solid #ddd',
                  background: v.includeInAnalysis === false ? '#f8f9fa' : undefined,
                  opacity: v.includeInAnalysis === false ? 0.85 : 1,
                }}
              >
                <td style={tdStyle}>
                  <input
                    value={v.name}
                    onChange={(e) => updateVariable(i, { name: e.target.value })}
                    style={{ width: '100%', maxWidth: 120 }}
                    placeholder="Name"
                  />
                </td>
                <td style={tdStyle}>
                  <select
                    value={v.variableType}
                    onChange={(e) => updateVariable(i, { variableType: e.target.value as VariableType })}
                    style={{ minWidth: 100 }}
                    title={VARIABLE_TYPE_LABELS[v.variableType]}
                  >
                    {(Object.keys(VARIABLE_TYPE_LABELS) as VariableType[]).map((t) => (
                      <option key={t} value={t}>
                        {VARIABLE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={tdStyle}>
                  <input
                    value={v.label}
                    onChange={(e) => updateVariable(i, { label: e.target.value })}
                    style={{ width: '100%', maxWidth: 160 }}
                    placeholder="Label"
                  />
                </td>
                <td style={tdStyle}>
                  <select
                    value={v.measurementLevel}
                    onChange={(e) => updateVariable(i, { measurementLevel: e.target.value as MeasurementLevel })}
                    title={MEASURE_LABELS[v.measurementLevel]}
                    style={{ minWidth: 100 }}
                  >
                    {MEASUREMENT_LEVELS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={tdStyle}>
                  <select
                    value={v.role}
                    onChange={(e) => updateVariable(i, { role: e.target.value as VariableRole })}
                    style={{ minWidth: 80 }}
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
                <td style={tdStyle}>
                  <select
                    value={getGroupIdForVariable(v.name)}
                    onChange={(e) => assignVariableToGroup(v.name, e.target.value)}
                    style={{ minWidth: 110 }}
                  >
                    <option value="">— None</option>
                    {questionGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} ({g.variableNames.length})
                      </option>
                    ))}
                    <option value="__new__">+ New group…</option>
                  </select>
                </td>
                <td style={tdStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={v.includeInAnalysis !== false}
                      onChange={(e) => updateVariable(i, { includeInAnalysis: e.target.checked })}
                      title="Uncheck to exclude this variable from all analyses"
                    />
                    <span style={{ fontSize: 13 }}>Yes</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8, fontSize: '1rem' }}>Question groups</h3>
        <p style={{ margin: '0 0 10px', fontSize: 14, color: '#555' }}>
          Group columns that belong to the same question (e.g. checkbox set, matrix rows, ranking items). Assign variables above with the &quot;Question group&quot; dropdown.
        </p>
        <button
          type="button"
          onClick={addQuestionGroup}
          style={{
            marginBottom: 12,
            padding: '0.35rem 0.75rem',
            background: '#3498db',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Add question group
        </button>
        {questionGroups.length === 0 ? (
          <p style={{ fontSize: 14, color: '#7f8c8d', margin: 0 }}>No groups yet. Add one or assign variables to &quot;+ New question group…&quot; in the table.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {questionGroups.map((g) => (
              <li
                key={g.id}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  background: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <input
                    type="text"
                    value={g.label}
                    onChange={(e) => updateGroup(g.id, { label: e.target.value })}
                    placeholder="Question label"
                    style={{ padding: '4px 8px', minWidth: 160, borderRadius: 4, border: '1px solid #ced4da' }}
                  />
                  <select
                    value={g.type}
                    onChange={(e) => updateGroup(g.id, { type: e.target.value as QuestionGroupType })}
                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ced4da' }}
                  >
                    {QUESTION_GROUP_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeQuestionGroup(g.id)}
                    style={{
                      padding: '4px 8px',
                      background: 'transparent',
                      color: '#c0392b',
                      border: '1px solid #c0392b',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Remove group
                  </button>
                </div>
                <div style={{ fontSize: 13, color: '#555' }}>
                  <strong>Columns ({g.variableNames.length}):</strong>{' '}
                  {g.variableNames.length === 0 ? (
                    <span style={{ color: '#7f8c8d' }}>None — assign from the table above</span>
                  ) : (
                    g.variableNames.map((name) => (
                      <span
                        key={name}
                        style={{
                          display: 'inline-block',
                          margin: '2px 4px 2px 0',
                          padding: '2px 6px',
                          background: '#e9ecef',
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => removeVariableFromGroup(name, g.id)}
                          aria-label={`Remove ${name} from group`}
                          style={{
                            marginLeft: 4,
                            padding: 0,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6c757d',
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
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
