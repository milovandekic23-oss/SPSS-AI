import { useCallback, useMemo, useState } from 'react'
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
import { styles, theme } from '../theme'

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

/** Tooltips for column headers: explain how to use each column/menu. */
const COLUMN_TOOLTIPS: Record<string, string> = {
  Name: 'Variable name from your file (read-only). Use the Label column to set the display name shown in reports.',
  Type: 'Use the dropdown to choose how values are stored: String, Numeric (integer or decimal), Date, or Yes/No. Affects how the app reads the column.',
  Label: 'Type or edit the display name or question text here. This is what appears in test suggestions and reports—use it to describe the variable clearly.',
  Measure: 'Use the dropdown to set the measurement level: Nominal (categories, no order), Ordinal (ordered categories), or Scale (numeric). This determines which tests are suggested.',
  Role: 'Use the dropdown to set role: Input, Target, or ID. Some analyses use this to pick outcome vs predictor variables.',
  'Missing %': 'Shows the share of empty or missing values (and any codes you define below). High missingness may bias results.',
  'Missing codes': 'Define values that count as missing (e.g. 99, 999, -1 or "Refused"). Comma-separated. These are excluded from all analyses.',
  'Value labels': 'Map each code to a display label (e.g. 1 = Strongly disagree, 5 = Strongly agree). Click "Add value labels…" to edit; used in frequency tables and reports.',
  'Question group': 'Use the dropdown to assign this variable to a question group (e.g. checkbox set, matrix). Create groups in the "Question groups" section below, then select one here.',
  'In analysis': 'Leave checked to include this variable in test suggestions and analyses. Uncheck to hide it from analyses (variable stays in the table).',
}

/** Parse comma-separated missing codes string into (number | string)[] */
function parseMissingCodesString(s: string): (number | string)[] {
  if (!s.trim()) return []
  return s.split(',').map((x) => {
    const t = x.trim()
    const n = Number(t)
    return t !== '' && !Number.isNaN(n) ? n : t
  }).filter((x) => x !== '' && x !== undefined)
}

/** Format missing codes array for display in input */
function formatMissingCodes(codes: (number | string)[]): string {
  return codes.map(String).join(', ')
}

/** Effective missing % for a variable: empty + user-defined missing codes */
function effectiveMissingPct(rows: { [key: string]: string | number | null }[], varName: string, missingCodes: (number | string)[]): number {
  if (!rows.length) return 0
  const codeSet = new Set(missingCodes.map((c) => String(c)))
  let missing = 0
  for (const row of rows) {
    const v = row[varName]
    if (v === null || v === undefined || v === '') missing++
    else if (codeSet.has(String(v))) missing++
  }
  return Math.round((missing / rows.length) * 1000) / 10
}

/** Max share of a single category (0–100). >90% = low variance for group comparisons. */
function maxCategoryShare(rows: { [key: string]: string | number | null }[], varName: string, missingCodes: (number | string)[]): number {
  const codeSet = new Set(missingCodes.map((c) => String(c)))
  const counts: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const v = row[varName]
    if (v === null || v === undefined || v === '' || codeSet.has(String(v))) continue
    const key = String(v)
    counts[key] = (counts[key] ?? 0) + 1
    total++
  }
  if (total === 0) return 0
  return Math.round((Math.max(...Object.values(counts)) / total) * 1000) / 10
}

function ColHeader({ title }: { title: string }) {
  const tooltip = COLUMN_TOOLTIPS[title]
  return (
    <th style={{ ...styles.tableHeader, paddingRight: 10 }}>
      <span title={tooltip ?? ''} style={{ cursor: tooltip ? 'help' : 'default' }}>
        {title}
        {tooltip && <span style={{ marginLeft: 4, opacity: 0.7, fontWeight: 'normal' }} aria-hidden>ⓘ</span>}
      </span>
    </th>
  )
}

function ValueLabelsCell({ variable, onUpdate }: { variable: VariableMeta; onUpdate: (patch: Partial<VariableMeta>) => void }) {
  const labels = variable.valueLabels ?? []
  const [open, setOpen] = useState(false)
  const addLabel = useCallback(() => {
    onUpdate({ valueLabels: [...labels, { code: '', label: '' }] })
  }, [labels, onUpdate])
  const updateLabel = useCallback(
    (idx: number, code: string | number, label: string) => {
      const next = labels.map((l, i) => (i === idx ? { code, label } : l))
      onUpdate({ valueLabels: next })
    },
    [labels, onUpdate]
  )
  const removeLabel = useCallback(
    (idx: number) => {
      onUpdate({ valueLabels: labels.filter((_, i) => i !== idx) })
    },
    [labels, onUpdate]
  )
  const preview = labels.length > 0
    ? labels.slice(0, 2).map((l) => `${l.code} = ${l.label || '…'}`).join('; ') + (labels.length > 2 ? ` (+${labels.length - 2})` : '')
    : ''
  return (
    <div style={{ minWidth: 140 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: open ? theme.colors.background : 'none',
          border: `1px solid ${open ? theme.colors.border : 'transparent'}`,
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
          padding: '4px 8px',
          color: theme.colors.accent,
          textDecoration: 'underline',
          textAlign: 'left',
          width: '100%',
        }}
        title="Click to add or edit value labels (e.g. 1 = Strongly disagree)"
      >
        {labels.length === 0
          ? 'Add value labels…'
          : open
            ? `${labels.length} label${labels.length !== 1 ? 's' : ''} (click to close)`
            : preview || `${labels.length} label${labels.length !== 1 ? 's' : ''}`}
      </button>
      {open && (
        <div style={{ marginTop: 6, padding: 8, background: theme.colors.background, border: `1px solid ${theme.colors.border}`, borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 6 }}>Code = label (e.g. 1 = Strongly disagree)</div>
          {labels.map((l, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <input
                value={String(l.code)}
                onChange={(e) => updateLabel(idx, e.target.value, l.label)}
                placeholder="Code"
                style={{ width: 60, padding: '2px 4px', fontSize: 11 }}
              />
              <span style={{ fontSize: 11 }}>=</span>
              <input
                value={l.label}
                onChange={(e) => updateLabel(idx, l.code, e.target.value)}
                placeholder="Label"
                style={{ flex: 1, minWidth: 0, padding: '2px 4px', fontSize: 11 }}
              />
              <button type="button" onClick={() => removeLabel(idx)} style={{ padding: '2px 6px', fontSize: 11, cursor: 'pointer' }} aria-label="Remove">×</button>
            </div>
          ))}
          <button type="button" onClick={addLabel} style={{ marginTop: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>+ Add row</button>
        </div>
      )}
    </div>
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
  const [uploadHover, setUploadHover] = useState(false)

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
          let text = String(reader.result ?? '')
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
          const { variables, rows } = parseCSV(text)
          if (!variables?.length) {
            setError('No columns or data found in the CSV. Use a header row and at least one data row.')
            e.target.value = ''
            return
          }
          const next: DatasetState = {
            variables,
            rows: Array.isArray(rows) ? rows : [],
            variableViewConfirmed: false,
            questionGroups: [],
          }
          setSummaryAck(false)
          e.target.value = ''
          requestAnimationFrame(() => {
            onDatasetChange(next)
          })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse CSV.')
          e.target.value = ''
        }
      }
      reader.onerror = () => {
        setError('Could not read the file.')
        e.target.value = ''
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

  /** Validation warnings — must run before any early return (Rules of Hooks). */
  const validationWarnings = useMemo(() => {
    if (!dataset?.variables?.length || !Array.isArray(dataset.rows)) return []
    const warnings: string[] = []
    const rows = dataset.rows
    for (const v of dataset.variables) {
      if (v.includeInAnalysis === false) continue
      const pct = v.missingCodes?.length
        ? effectiveMissingPct(rows, v.name, v.missingCodes)
        : v.missingPct
      if (pct > 30) warnings.push(`"${v.label || v.name}" has high missing (${pct}%). Consider excluding or imputing.`)
      if (pct > 20 && pct <= 30) warnings.push(`"${v.label || v.name}" has >20% missing (${pct}%) — prioritize lower-missing variables for key analyses.`)
      if (v.measurementLevel === 'scale' && v.variableType === 'string')
        warnings.push(`"${v.label || v.name}": Measure is Scale but Type is String — analyses may expect numeric values.`)
      if ((v.measurementLevel === 'nominal' || v.measurementLevel === 'ordinal') && v.variableType === 'date')
        warnings.push(`"${v.label || v.name}": categorical Measure with Date type may not match expected codes.`)
      if (v.measurementLevel === 'ordinal' && (!v.valueLabels || v.valueLabels.length === 0))
        warnings.push(`"${v.label || v.name}" is Ordinal but has no value labels — consider adding labels for clearer reports.`)
      if (v.measurementLevel === 'nominal' || v.measurementLevel === 'ordinal') {
        const share = maxCategoryShare(rows, v.name, v.missingCodes ?? [])
        if (share > 90) warnings.push(`"${v.label || v.name}" has one response >90% — low variance for group comparisons.`)
      }
    }
    return warnings
  }, [dataset?.variables, dataset?.rows])

  if (!dataset || !Array.isArray(dataset.variables) || dataset.variables.length === 0) {
    return (
      <section>
        <header style={styles.sectionHeader}>
          <h2 style={styles.textSection}>
            Data Source<sup style={styles.sup}>1</sup>
          </h2>
        </header>
        <div
          style={{
            ...styles.uploadZone,
            ...(uploadHover ? styles.uploadZoneHover : {}),
          }}
          onMouseEnter={() => setUploadHover(true)}
          onMouseLeave={() => setUploadHover(false)}
          onClick={() => document.getElementById('variableViewFileInput')?.click()}
        >
          <div style={styles.uploadIcon}>+</div>
          <div style={styles.textLabel}>Upload CSV Dataset</div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>
            Drag & drop or click
          </div>
          <input
            type="file"
            id="variableViewFileInput"
            accept=".csv"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </div>
        <div style={{ marginTop: 16, fontSize: 11, opacity: 0.6, lineHeight: 1.4 }}>
          Supported: .csv · Max size: 25MB
        </div>
        {error && <p style={{ color: '#c0392b', marginTop: 12, fontSize: 13 }}>{error}</p>}
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
      <header style={styles.sectionHeader}>
        <h2 style={styles.textSection}>
          Data Source<sup style={styles.sup}>1</sup>
        </h2>
      </header>
      <p style={{ ...styles.textBody, marginBottom: 16 }} title="Summary of variable types and how many are included in analyses.">
        <strong>{dataset.variables.length} variables</strong> — {nominal} Nominal, {ordinal} Ordinal, {scale} Scale.
        {excluded > 0 && (
          <span style={{ marginLeft: 8, opacity: 0.6 }}>
            {included} in analysis, {excluded} excluded.
          </span>
        )}
      </p>
      {validationWarnings.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: '#fef9e7',
            border: '1px solid #f1c40f',
            borderRadius: 6,
            fontSize: 13,
          }}
          title="These checks help keep analyses consistent; they do not block processing."
        >
          <strong style={{ color: '#b7950b' }}>Checks:</strong>{' '}
          {validationWarnings.slice(0, 5).join(' ')}
          {validationWarnings.length > 5 && ` (+${validationWarnings.length - 5} more)`}
        </div>
      )}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <ColHeader title="Name" />
              <ColHeader title="Type" />
              <ColHeader title="Label" />
              <ColHeader title="Measure" />
              <ColHeader title="Role" />
              <ColHeader title="Missing %" />
              <ColHeader title="Missing codes" />
              <ColHeader title="Value labels" />
              <ColHeader title="Question group" />
              <ColHeader title="In analysis" />
            </tr>
          </thead>
          <tbody>
            {dataset.variables.map((v, i) => (
              <tr
                key={v.name}
                style={{
                  background: v.includeInAnalysis === false ? theme.colors.background : undefined,
                  opacity: v.includeInAnalysis === false ? 0.85 : 1,
                }}
              >
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS.Name}>
                  <span style={{ display: 'block', fontFamily: "'Courier New', monospace", fontSize: 12 }}>{v.name}</span>
                </td>
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS.Type}>
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
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS.Label}>
                  <input
                    value={v.label}
                    onChange={(e) => updateVariable(i, { label: e.target.value })}
                    style={{ width: '100%', maxWidth: 200 }}
                    placeholder="Label"
                    title="Edit the display name or question text shown in reports"
                  />
                </td>
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS.Measure}>
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
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS.Role}>
                  <select
                    value={v.role}
                    onChange={(e) => updateVariable(i, { role: e.target.value as VariableRole })}
                    style={{ minWidth: 80 }}
                    title="Input, Target, or ID — used by some analyses"
                  >
                    {ROLES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS['Missing %']}>
                  {(() => {
                    const pct = v.missingCodes?.length
                      ? effectiveMissingPct(dataset.rows, v.name, v.missingCodes)
                      : v.missingPct
                    return pct > 0 ? (
                      <span style={pct > 30 ? { color: '#c0392b', fontWeight: 'bold' } : undefined}>
                        {pct}%
                      </span>
                    ) : (
                      '—'
                    )
                  })()}
                </td>
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS['Missing codes']}>
                  <input
                    type="text"
                    value={formatMissingCodes(v.missingCodes ?? [])}
                    onChange={(e) => updateVariable(i, { missingCodes: parseMissingCodesString(e.target.value) })}
                    placeholder="e.g. 99, 999, Refused"
                    style={{ width: '100%', maxWidth: 140, padding: '4px 6px', fontSize: 12 }}
                    title="Comma-separated values to treat as missing"
                  />
                </td>
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS['Value labels']}>
                  <ValueLabelsCell variable={v} onUpdate={(patch) => updateVariable(i, patch)} />
                </td>
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS['Question group']}>
                  <select
                    value={getGroupIdForVariable(v.name)}
                    onChange={(e) => assignVariableToGroup(v.name, e.target.value)}
                    style={{ minWidth: 110 }}
                    title="Assign to a question group (e.g. checkbox set)"
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
                <td style={styles.tableCell} title={COLUMN_TOOLTIPS['In analysis']}>
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

      <div style={{ marginTop: 24 }} title="Group columns that belong to one question (e.g. checkbox set, matrix). Assign in the table above.">
        <h3 style={{ ...styles.textLabel, marginBottom: 8, opacity: 0.6 }}>Question groups</h3>
        <p style={{ ...styles.textBody, margin: '0 0 10px' }}>
          Assign variables in the table with the &quot;Question group&quot; column.
        </p>
        <button
          type="button"
          onClick={addQuestionGroup}
          style={{ ...styles.btn, ...styles.btnPrimary, marginTop: 0, marginBottom: 12 }}
          title="Create a new question group, then assign variables to it in the table."
        >
          Add question group
        </button>
        {questionGroups.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>No groups yet. Add one, then assign variables in the table.</p>
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
                    title="Name for this question group (e.g. &quot;Q5 Check all that apply&quot;)"
                    style={{ padding: '4px 8px', minWidth: 160, borderRadius: 4, border: '1px solid #ced4da' }}
                  />
                  <select
                    value={g.type}
                    onChange={(e) => updateGroup(g.id, { type: e.target.value as QuestionGroupType })}
                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ced4da' }}
                    title="Checkbox = multiple response; Matrix = grid; Ranking = order; Group = other."
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
                    title="Remove this group; variables will be unassigned."
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

      <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={confirmVariableView}
          style={{ ...styles.btn, background: theme.colors.text, color: '#FFFFFF', border: `1px solid ${theme.colors.text}`, marginTop: 0 }}
          title="Confirm variable settings and enable Test Suggester and Insights."
        >
          Process Data
        </button>
        <button
          type="button"
          onClick={() => onDatasetChange(null)}
          style={{ ...styles.btn, marginTop: 0, background: 'transparent', color: theme.colors.textMuted }}
          title="Clear data and upload a different file."
        >
          Start over
        </button>
        {dataset.variableViewConfirmed && summaryAck && (
          <span style={{ ...styles.textBody, opacity: 0.7 }} title="You can now run tests or generate the report.">✅ Confirmed. Use Test Suggester or Insights.</span>
        )}
      </div>
    </section>
  )
}

