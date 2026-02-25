/**
 * Data readiness checker: evaluates dataset quality and produces a checklist.
 * Run after Variable View is confirmed. Used to gate Test Suggester and show quality issues.
 */

import { mean, standardDeviation, quantile, sampleSkewness, sampleKurtosis } from 'simple-statistics'
import type { DatasetState, DataRow } from '../types'

export type ReadinessLevel = 'ready' | 'needs_attention' | 'not_ready'
export type ReadinessSeverity = 'info' | 'caution' | 'warning' | 'critical'

export interface ReadinessItem {
  id: string
  severity: ReadinessSeverity
  category: 'missing' | 'outliers' | 'normality' | 'variance' | 'sample_size' | 'duplicates'
  message: string
  variable?: string
  variableLabel?: string
  suggestion?: string
  /** Optional one-click action key (e.g. 'winsorize_varName') */
  actionKey?: string
}

export interface OutlierSummary {
  variableName: string
  variableLabel: string
  zScoreCount: number
  iqrCount: number
  totalValid: number
}

export interface NormalitySummary {
  variableName: string
  variableLabel: string
  label: 'Approximately normal' | 'Mildly skewed' | 'Non-normal'
  skewness?: number
  kurtosis?: number
  n: number
}

export interface DataReadinessResult {
  level: ReadinessLevel
  score: number
  items: ReadinessItem[]
  missingPctByVar: Record<string, number>
  outlierSummaries: OutlierSummary[]
  normalitySummaries: NormalitySummary[]
  duplicateRowCount: number
  idDuplicateVars: string[]
  /** Heatmap: for each variable, array of 0/1 (0=missing, 1=valid) per row index (may be sampled if huge) */
  missingHeatmap?: { varName: string; rowFlags: (0 | 1)[] }[]
}

const SEVERITY_ORDER: ReadinessSeverity[] = ['info', 'caution', 'warning', 'critical']
function worstSeverity(a: ReadinessSeverity, b: ReadinessSeverity): ReadinessSeverity {
  return SEVERITY_ORDER.indexOf(b) > SEVERITY_ORDER.indexOf(a) ? b : a
}

function isMissing(value: string | number | null, missingCodes: (string | number)[]): boolean {
  if (value === null || value === undefined || value === '') return true
  if (missingCodes.length === 0) return false
  return missingCodes.some((c) => String(c) === String(value))
}

function effectiveMissingPct(rows: DataRow[], varName: string, missingCodes: (string | number)[]): number {
  if (!rows.length) return 0
  let missing = 0
  for (const row of rows) {
    if (isMissing(row[varName], missingCodes)) missing++
  }
  return Math.round((missing / rows.length) * 1000) / 10
}

function getNumericValues(rows: DataRow[], varName: string, missingCodes: (string | number)[]): number[] {
  const out: number[] = []
  for (const row of rows) {
    const v = row[varName]
    if (isMissing(v, missingCodes)) continue
    const n = Number(v)
    if (!Number.isNaN(n)) out.push(n)
  }
  return out
}

function maxCategoryShare(rows: DataRow[], varName: string, missingCodes: (string | number)[]): number {
  const counts: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const v = row[varName]
    if (isMissing(v, missingCodes)) continue
    const key = String(v)
    counts[key] = (counts[key] ?? 0) + 1
    total++
  }
  if (total === 0) return 0
  return Math.round((Math.max(...Object.values(counts)) / total) * 1000) / 10
}

/** Variable names that are options in a multi-response (checkbox/matrix) question. High "missing" per option is expected. */
function multiResponseOptionVarNames(dataset: DatasetState): Set<string> {
  const set = new Set<string>()
  for (const g of dataset.questionGroups ?? []) {
    if (g.type === 'checkbox' || g.type === 'matrix') {
      for (const name of g.variableNames ?? []) set.add(name)
    }
  }
  return set
}

/** Run data readiness checks. Handles edge cases (empty, n=1, zero variance) without throwing. */
export function checkDataReadiness(dataset: DatasetState): DataReadinessResult {
  const items: ReadinessItem[] = []
  const { variables, rows } = dataset
  const n = rows.length
  const includedVars = variables.filter((v) => v.includeInAnalysis !== false)
  const scaleVars = includedVars.filter((v) => v.measurementLevel === 'scale')
  const nominalOrOrdinal = includedVars.filter((v) => v.measurementLevel === 'nominal' || v.measurementLevel === 'ordinal')
  const multiResponseVars = multiResponseOptionVarNames(dataset)

  const missingPctByVar: Record<string, number> = {}
  let overallSeverity: ReadinessSeverity = 'info'

  // ----- MISSING DATA -----
  let anySkippedMultiResponse = false
  for (const v of includedVars) {
    const pct = effectiveMissingPct(rows, v.name, v.missingCodes ?? [])
    missingPctByVar[v.name] = pct
    if (multiResponseVars.has(v.name)) {
      anySkippedMultiResponse = true
      continue
    }
    if (pct > 50) {
      items.push({
        id: `missing-${v.name}`,
        severity: 'critical',
        category: 'missing',
        message: `"${v.label || v.name}" has ${pct}% missing — critical.`,
        variable: v.name,
        variableLabel: v.label || v.name,
        suggestion: 'Consider excluding from analysis or flagging as a separate category.',
      })
      overallSeverity = worstSeverity(overallSeverity, 'critical')
    } else if (pct > 20) {
      items.push({
        id: `missing-${v.name}`,
        severity: 'warning',
        category: 'missing',
        message: `"${v.label || v.name}" has ${pct}% missing.`,
        variable: v.name,
        variableLabel: v.label || v.name,
        suggestion: 'Consider listwise deletion, mean/median imputation, or flagging as separate category.',
      })
      overallSeverity = worstSeverity(overallSeverity, 'warning')
    } else if (pct > 5) {
      items.push({
        id: `missing-${v.name}`,
        severity: 'caution',
        category: 'missing',
        message: `"${v.label || v.name}" has ${pct}% missing.`,
        variable: v.name,
        variableLabel: v.label || v.name,
        suggestion: 'Monitor impact; consider imputation if needed.',
      })
      overallSeverity = worstSeverity(overallSeverity, 'caution')
    }
  }
  if (anySkippedMultiResponse) {
    items.push({
      id: 'multi-response-info',
      severity: 'info',
      category: 'missing',
      message: 'Multi-select option columns (checkbox/matrix groups) are not flagged for missing % — high non-response per option is expected.',
      suggestion: 'Assign option columns to a Question group with type Checkbox (or Matrix) in Variable View if you haven’t already.',
    })
  }

  // ----- OUTLIERS (scale variables) -----
  const outlierSummaries: OutlierSummary[] = []
  for (const v of scaleVars) {
    const vals = getNumericValues(rows, v.name, v.missingCodes ?? [])
    if (vals.length < 2) continue
    const m = mean(vals)
    const sd = standardDeviation(vals)
    let zScoreCount = 0
    if (sd > 0) {
      for (const x of vals) {
        const z = Math.abs((x - m) / sd)
        if (z > 3) zScoreCount++
      }
    }
    const q1 = quantile(vals, 0.25)
    const q3 = quantile(vals, 0.75)
    const iqr = q3 - q1
    const lo = q1 - 1.5 * iqr
    const hi = q3 + 1.5 * iqr
    let iqrCount = 0
    for (const x of vals) {
      if (x < lo || x > hi) iqrCount++
    }
    outlierSummaries.push({
      variableName: v.name,
      variableLabel: v.label || v.name,
      zScoreCount,
      iqrCount,
      totalValid: vals.length,
    })
    if (zScoreCount > 0 || iqrCount > 0) {
      items.push({
        id: `outlier-${v.name}`,
        severity: iqrCount > vals.length * 0.1 ? 'warning' : 'caution',
        category: 'outliers',
        message: `"${v.label || v.name}": ${zScoreCount} |z|>3, ${iqrCount} outside IQR range.`,
        variable: v.name,
        variableLabel: v.label || v.name,
        suggestion: 'Consider: keep, remove, or winsorize.',
        actionKey: `outliers_${v.name}`,
      })
      overallSeverity = worstSeverity(overallSeverity, iqrCount > vals.length * 0.1 ? 'warning' : 'caution')
    }
  }

  // ----- NORMALITY (scale; use skewness/kurtosis — no Shapiro-Wilk in simple-statistics) -----
  const normalitySummaries: NormalitySummary[] = []
  for (const v of scaleVars) {
    const vals = getNumericValues(rows, v.name, v.missingCodes ?? [])
    if (vals.length < 3) continue
    const skew = sampleSkewness(vals)
    const kurt = vals.length > 50 ? sampleKurtosis(vals) : undefined
    const absSkew = Math.abs(skew)
    const label: NormalitySummary['label'] =
      absSkew <= 0.5 ? 'Approximately normal' : absSkew <= 1 ? 'Mildly skewed' : 'Non-normal'
    normalitySummaries.push({
      variableName: v.name,
      variableLabel: v.label || v.name,
      label,
      skewness: skew,
      kurtosis: kurt,
      n: vals.length,
    })
    if (label === 'Non-normal') {
      items.push({
        id: `normality-${v.name}`,
        severity: 'caution',
        category: 'normality',
        message: `"${v.label || v.name}" is non-normal (skewness ≈ ${skew.toFixed(2)}).`,
        variable: v.name,
        variableLabel: v.label || v.name,
        suggestion: 'Non-parametric alternatives will be suggested in Test Suggester.',
      })
      overallSeverity = worstSeverity(overallSeverity, 'caution')
    }
  }

  // ----- VARIANCE -----
  for (const v of nominalOrOrdinal) {
    const share = maxCategoryShare(rows, v.name, v.missingCodes ?? [])
    if (share > 80) {
      items.push({
        id: `variance-cat-${v.name}`,
        severity: 'warning',
        category: 'variance',
        message: `"${v.label || v.name}" has one category with ${share}% of responses (near-zero variance).`,
        variable: v.name,
        variableLabel: v.label || v.name,
        suggestion: 'Not useful for group comparisons.',
      })
      overallSeverity = worstSeverity(overallSeverity, 'warning')
    }
  }
  for (const v of scaleVars) {
    const vals = getNumericValues(rows, v.name, v.missingCodes ?? [])
    if (vals.length >= 2 && standardDeviation(vals) === 0) {
      items.push({
        id: `variance-scale-${v.name}`,
        severity: 'warning',
        category: 'variance',
        message: `"${v.label || v.name}" has zero variance (constant).`,
        variable: v.name,
        variableLabel: v.label || v.name,
        suggestion: 'Exclude from analyses that require variation.',
      })
      overallSeverity = worstSeverity(overallSeverity, 'warning')
    }
  }

  // ----- SAMPLE SIZE -----
  if (n < 30) {
    items.push({
      id: 'sample-n30',
      severity: 'caution',
      category: 'sample_size',
      message: `Sample size n = ${n} is under 30; parametric tests may be unreliable.`,
      suggestion: 'Prefer non-parametric tests (e.g. Mann-Whitney, Kruskal-Wallis).',
    })
    overallSeverity = worstSeverity(overallSeverity, 'caution')
  }

  // ----- DUPLICATES -----
  const rowKey = (r: DataRow) => JSON.stringify(r)
  const seen = new Set<string>()
  let duplicateRowCount = 0
  for (const row of rows) {
    const k = rowKey(row)
    if (seen.has(k)) duplicateRowCount++
    else seen.add(k)
  }
  const idVars = variables.filter((v) => v.role === 'id')
  const idDuplicateVars: string[] = []
  for (const v of idVars) {
    const vals = rows.map((r) => r[v.name])
    const uniq = new Set(vals.map(String))
    if (uniq.size < vals.length) idDuplicateVars.push(v.label || v.name)
  }
  if (duplicateRowCount > 0) {
    items.push({
      id: 'duplicate-rows',
      severity: duplicateRowCount > n * 0.1 ? 'warning' : 'caution',
      category: 'duplicates',
      message: `${duplicateRowCount} fully duplicate row(s) found.`,
      suggestion: 'Consider removing duplicates before analysis.',
    })
    overallSeverity = worstSeverity(overallSeverity, duplicateRowCount > n * 0.1 ? 'warning' : 'caution')
  }
  if (idDuplicateVars.length > 0) {
    items.push({
      id: 'duplicate-id',
      severity: 'warning',
      category: 'duplicates',
      message: `ID variable(s) have duplicate values: ${idDuplicateVars.join(', ')}.`,
      suggestion: 'IDs should be unique.',
    })
    overallSeverity = worstSeverity(overallSeverity, 'warning')
  }

  // ----- READINESS LEVEL -----
  let level: ReadinessLevel = 'ready'
  if (overallSeverity === 'critical') level = 'not_ready'
  else if (overallSeverity === 'warning' || overallSeverity === 'caution') level = 'needs_attention'

  // Score 0–100: deduct for each severity
  let score = 100
  for (const it of items) {
    if (it.severity === 'critical') score -= 15
    else if (it.severity === 'warning') score -= 8
    else if (it.severity === 'caution') score -= 3
  }
  score = Math.max(0, Math.min(100, score))

  // Missing heatmap: sample to max 100 rows × all vars if large
  const maxHeatmapRows = 100
  const missingHeatmap: { varName: string; rowFlags: (0 | 1)[] }[] = includedVars.slice(0, 30).map((v) => {
    const flags: (0 | 1)[] = []
    const step = n > maxHeatmapRows ? Math.max(1, Math.floor(n / maxHeatmapRows)) : 1
    for (let i = 0; i < n; i += step) {
      flags.push(isMissing(rows[i][v.name], v.missingCodes ?? []) ? 0 : 1)
    }
    return { varName: v.name, rowFlags: flags }
  })

  return {
    level,
    score,
    items,
    missingPctByVar,
    outlierSummaries,
    normalitySummaries,
    duplicateRowCount,
    idDuplicateVars,
    missingHeatmap,
  }
}

/** Can the user proceed to Test Suggester? (Only block when not_ready) */
export function canProceedToTests(result: DataReadinessResult): boolean {
  return result.level !== 'not_ready'
}
