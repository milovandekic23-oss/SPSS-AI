import {
  mean,
  min,
  max,
  standardDeviation,
  tTestTwoSample,
  tTest,
  sampleCorrelation,
  sampleRankCorrelation,
  sampleSkewness,
  cumulativeStdNormalProbability,
  wilcoxonRankSum,
} from 'simple-statistics'
import type { DatasetState, DataRow } from '../types'

/** Solve (X'X) beta = X'y for beta (OLS). X is n x p, y is length n. Returns beta length p or null if singular. */
function olsSolve(X: number[][], y: number[]): number[] | null {
  const n = X.length
  const p = X[0].length
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0))
  const Xty: number[] = Array(p).fill(0)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i]
      for (let k = j; k < p; k++) XtX[j][k] += X[i][j] * X[i][k]
    }
  }
  for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) XtX[k][j] = XtX[j][k]
  return solveSymmetric(XtX, Xty)
}

/** Solve A*beta = b in-place; A symmetric, b overwritten with solution. Returns b or null if singular. */
function solveSymmetric(A: number[][], b: number[]): number[] | null {
  const p = A.length
  const a = A.map((row) => row.slice())
  const x = b.slice()
  for (let k = 0; k < p; k++) {
    let maxIdx = k
    let maxVal = Math.abs(a[k][k])
    for (let i = k + 1; i < p; i++) {
      const v = Math.abs(a[i][k])
      if (v > maxVal) {
        maxVal = v
        maxIdx = i
      }
    }
    if (maxVal < 1e-10) return null
    ;[a[k], a[maxIdx]] = [a[maxIdx], a[k]]
    ;[x[k], x[maxIdx]] = [x[maxIdx], x[k]]
    const d = a[k][k]
    for (let j = k; j < p; j++) a[k][j] /= d
    x[k] /= d
    for (let i = 0; i < p; i++) {
      if (i === k) continue
      const f = a[i][k]
      for (let j = k; j < p; j++) a[i][j] -= f * a[k][j]
      x[i] -= f * x[k]
    }
  }
  return x
}

/** Helper: return a result when the test cannot be run (so we never return null). */
function notApplicableResult(
  testId: TestId,
  testName: string,
  message: string,
  suggestion?: string
): TestResult {
  return {
    testId,
    testName,
    table: [{ Requirement: message, Suggestion: suggestion ?? '—' }],
    insight: message + (suggestion ? ` ${suggestion}` : ''),
  }
}

export type TestId =
  | 'freq'
  | 'desc'
  | 'missing'
  | 'crosstab'
  | 'corr'
  | 'spearman'
  | 'ttest'
  | 'anova'
  | 'linreg'
  | 'logreg'
  | 'mann'
  | 'paired'
  | 'pca'

/** Suggested variables for a test: what will be analyzed and how */
export interface SuggestedVars {
  testId: TestId
  description: string
  /** e.g. [{ varName, role: 'outcome' | 'group' | 'predictor' | 'variable' }] */
  variables: { name: string; label: string; role: string }[]
}

/** One row in a results table */
export type ResultRow = Record<string, string | number>

/** Chart data for Recharts */
export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'scatter'
  title: string
  data: Record<string, string | number>[]
  xKey: string
  yKey?: string
  /** If set, chart data includes this key (e.g. percent) and UI can toggle count vs percent */
  percentKey?: string
  seriesKeys?: string[]
}

export interface TestResult {
  testId: TestId
  testName: string
  table: ResultRow[]
  chart?: ChartSpec
  insight: string
  /** e.g. p-value, r, t, etc. */
  keyStat?: string
  /** Variables/questions analyzed (for clear display in result panel) */
  variablesAnalyzed?: { name?: string; label: string; role?: string }[]
  /** Map varName -> (code -> label) for showing value labels in tables */
  valueLabelMaps?: Record<string, Record<string, string>>
  /** Plain-language takeaway: "In practice: ..." */
  plainLanguage?: string
  /** Short actionable recommendation: "Next step: ..." */
  nextStep?: string
  /** Effect size for interpretation (e.g. Cohen's d, r, R², Cramér's V). Used to sort bivariate findings. */
  effectSize?: number
  /** Label for effect size (e.g. "Cohen's d", "r", "R²"). */
  effectSizeLabel?: string
}

/** User-defined missing codes: values to exclude from analysis (e.g. 99, 999, "Refused"). */
function isUserMissing(value: string | number | null, missingCodes: (string | number)[]): boolean {
  if (value === null || value === undefined || value === '') return true
  if (missingCodes.length === 0) return false
  const s = String(value)
  return missingCodes.some((c) => String(c) === s)
}

/** Build code -> label map for result display (value labels in tables). */
function valueLabelMapFromVar(v: { valueLabels?: { code: number | string; label: string }[] } | undefined): Record<string, string> {
  if (!v?.valueLabels?.length) return {}
  return Object.fromEntries(v.valueLabels.map(({ code, label }) => [String(code), label]))
}

function getNumericValues(rows: DataRow[], varName: string, missingCodes: (string | number)[] = []): number[] {
  const out: number[] = []
  for (const row of rows) {
    const v = row[varName]
    if (isUserMissing(v, missingCodes)) continue
    const n = Number(v)
    if (!Number.isNaN(n)) out.push(n)
  }
  return out
}

function getDistinctValues(rows: DataRow[], varName: string, missingCodes: (string | number)[] = []): (string | number)[] {
  const set = new Set<string | number>()
  for (const row of rows) {
    const v = row[varName]
    if (isUserMissing(v, missingCodes)) continue
    set.add(v)
  }
  return Array.from(set)
}

/** Approximate two-tailed p-value from t-statistic (normal approximation for df >= 30) */
function tToPValue(t: number, df: number): number {
  const absT = Math.abs(t)
  const z = df >= 30 ? absT : absT * (1 - 1 / (4 * df)) / Math.sqrt(1 + (absT * absT) / (2 * df))
  const oneTail = 1 - cumulativeStdNormalProbability(z)
  return Math.min(1, 2 * oneTail)
}

/** Approximate p-value for F-statistic (Wilson–Hilferty: F^(1/3) approx normal; uses df2) */
function fToPValue(F: number, _df1: number, df2: number): number {
  if (F <= 0 || df2 < 2) return 1
  const mu = 1 - 2 / (9 * df2)
  const sigma = Math.sqrt(2 / (9 * df2))
  const z = (Math.pow(F, 1 / 3) - mu) / sigma
  return 1 - cumulativeStdNormalProbability(z)
}

/** Levene's test (absolute deviations from group median); returns F and p (approx). */
function leveneTest(samples: number[][]): { F: number; p: number } {
  const medians = samples.map((s) => {
    const sorted = s.slice().sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  })
  const zGroups = samples.map((s, j) => s.map((x) => Math.abs(x - medians[j])))
  const allZ = zGroups.flat()
  const n = allZ.length
  const k = samples.length
  if (n < k + 2) return { F: 0, p: 1 }
  const grandMean = mean(allZ)
  const groupMeans = zGroups.map((z) => mean(z))
  const SSB = zGroups.reduce((acc, z, j) => acc + z.length * (groupMeans[j] - grandMean) ** 2, 0)
  const SSW = zGroups.reduce((acc, z, j) => acc + z.reduce((a, x) => a + (x - groupMeans[j]) ** 2, 0), 0)
  const df1 = k - 1
  const df2 = n - k
  const F = df2 > 0 && SSW > 0 ? (SSB / df1) / (SSW / df2) : 0
  const p = fToPValue(F, df1, df2)
  return { F, p }
}

/** Welch t-test (unequal variances): t and Satterthwaite df, then p. */
function welchTTest(sample1: number[], sample2: number[]): { t: number; df: number; p: number } {
  const n1 = sample1.length
  const n2 = sample2.length
  const m1 = mean(sample1)
  const m2 = mean(sample2)
  const v1 = n1 > 1 ? standardDeviation(sample1) ** 2 : 0
  const v2 = n2 > 1 ? standardDeviation(sample2) ** 2 : 0
  const se = Math.sqrt(v1 / n1 + v2 / n2)
  if (se < 1e-10) return { t: 0, df: n1 + n2 - 2, p: 1 }
  const t = (m1 - m2) / se
  const denom = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)
  const df = denom > 0 ? ((v1 / n1 + v2 / n2) ** 2) / denom : n1 + n2 - 2
  const dfInt = Math.max(1, Math.round(df))
  const p = tToPValue(t, dfInt)
  return { t, df: dfInt, p }
}

/** Approximate critical value for Tukey HSD (studentized range), alpha=0.05, k groups, df2 error df. */
function tukeyQCrit(k: number, df2: number): number {
  if (df2 < 2 || k < 2) return 4
  const approx = 2.8 + 0.4 * Math.log(k) + (2.5 / Math.sqrt(df2))
  return Math.min(6, Math.max(2.5, approx))
}

/** Variables included in analysis (excluded ones are ignored in suggestions and tests). */
function includedVariables(dataset: DatasetState) {
  return dataset.variables.filter((v) => v.includeInAnalysis !== false)
}

/** Effective missing % for a variable (empty + user-defined missing). Used for 80/20 heuristic. */
function effectiveMissingPct(rows: DataRow[], varName: string, missingCodes: (number | string)[]): number {
  if (!rows.length) return 0
  let missing = 0
  for (const row of rows) {
    if (isUserMissing(row[varName], missingCodes)) missing++
  }
  return Math.round((missing / rows.length) * 1000) / 10
}

/** Max share of a single category (0–100). >90% means low variance for group comparisons. */
function maxCategoryShare(rows: DataRow[], varName: string, missingCodes: (number | string)[]): number {
  const counts: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const v = row[varName]
    if (isUserMissing(v, missingCodes)) continue
    const key = String(v)
    counts[key] = (counts[key] ?? 0) + 1
    total++
  }
  if (total === 0) return 0
  return Math.round((Math.max(...Object.values(counts)) / total) * 1000) / 10
}

/** Prefer variables with <20% missing; for categorical, prefer max category share <90%. */
function sortByDataHygiene<T extends { name: string; missingCodes?: (number | string)[] }>(
  vars: T[],
  rows: DataRow[],
  options: { categorical?: boolean } = {}
): T[] {
  return [...vars].sort((a, b) => {
    const missingA = effectiveMissingPct(rows, a.name, a.missingCodes ?? [])
    const missingB = effectiveMissingPct(rows, b.name, b.missingCodes ?? [])
    if (missingA !== missingB) return missingA - missingB
    if (options.categorical) {
      const shareA = maxCategoryShare(rows, a.name, a.missingCodes ?? [])
      const shareB = maxCategoryShare(rows, b.name, b.missingCodes ?? [])
      return shareA - shareB
    }
    return 0
  })
}

export function getSuggestedVariables(testId: TestId, dataset: DatasetState): SuggestedVars {
  const variables = includedVariables(dataset)
  const { rows, questionGroups } = dataset
  /** 80/20 & variance heuristics: prefer <20% missing; for categorical, prefer max category share <90%. */
  const scaleVars = sortByDataHygiene(
    variables.filter((v) => v.measurementLevel === 'scale'),
    rows
  )
  const nominalVars = sortByDataHygiene(
    variables.filter((v) => v.measurementLevel === 'nominal'),
    rows,
    { categorical: true }
  )
  const ordinalVars = sortByDataHygiene(
    variables.filter((v) => v.measurementLevel === 'ordinal'),
    rows,
    { categorical: true }
  )
  const categoricalVars = [...nominalVars, ...ordinalVars]
  /** North Star: prefer role "target" as outcome when present. */
  const targetScale = scaleVars.find((v) => v.role === 'target')
  const targetNominal = nominalVars.find((v) => v.role === 'target')
  const targetOrdinal = ordinalVars.find((v) => v.role === 'target')
  /** Prefer scale variables from the same question group for paired / repeated measures. */
  const pairedFromGroup =
    questionGroups?.length && scaleVars.length >= 2
      ? questionGroups
          .map((g) => g.variableNames.map((name) => scaleVars.find((v) => v.name === name)).filter(Boolean) as typeof scaleVars)
          .find((arr) => arr.length >= 2)
      : undefined
  const preferredPairedVars = (pairedFromGroup?.length ? pairedFromGroup : scaleVars).slice(0, 4)
  const crosstabFromGroup =
    questionGroups?.length && nominalVars.length >= 2
      ? questionGroups
          .map((g) => g.variableNames.map((name) => nominalVars.find((v) => v.name === name)).filter(Boolean) as typeof nominalVars)
          .find((arr) => arr.length >= 2)
      : undefined
  const preferredCrosstabVars = crosstabFromGroup?.length ? crosstabFromGroup.slice(0, 2) : nominalVars.slice(0, 2)

  switch (testId) {
    case 'freq':
      return {
        testId: 'freq',
        description: 'Counts and percentages for each category.',
        variables: categoricalVars.length
          ? categoricalVars.slice(0, 5).map((v) => ({ name: v.name, label: v.label, role: 'variable' }))
          : scaleVars.slice(0, 3).map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
    case 'desc':
      return {
        testId: 'desc',
        description: 'Mean, SD, min, max for each numeric variable.',
        variables: scaleVars.slice(0, 6).map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
    case 'missing':
      return {
        testId: 'missing',
        description: 'Missing count and percentage per variable.',
        variables: variables.slice(0, 10).map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
    case 'crosstab': {
      const two = preferredCrosstabVars
      return {
        testId: 'crosstab',
        description: 'Cross-tabulation and Chi-Square test of independence.',
        variables: two.length >= 2
          ? [
              { name: two[0].name, label: two[0].label, role: 'row variable' },
              { name: two[1].name, label: two[1].label, role: 'column variable' },
            ]
          : two.map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
    }
    case 'corr': {
      const two = scaleVars.slice(0, 2)
      return {
        testId: 'corr',
        description: 'Pearson correlation between two numeric variables.',
        variables: two.length >= 2
          ? [
              { name: two[0].name, label: two[0].label, role: 'variable 1' },
              { name: two[1].name, label: two[1].label, role: 'variable 2' },
            ]
          : two.map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
    }
    case 'spearman': {
      const two = [...scaleVars, ...ordinalVars].slice(0, 2)
      return {
        testId: 'spearman',
        description: 'Spearman rank correlation (ordinal or monotonic association).',
        variables: two.length >= 2
          ? [
              { name: two[0].name, label: two[0].label, role: 'variable 1' },
              { name: two[1].name, label: two[1].label, role: 'variable 2' },
            ]
          : two.map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
    }
    case 'ttest': {
      const scale = targetScale ?? scaleVars[0]
      const groupVar = nominalVars.find((v) => {
        const vals = getDistinctValues(rows, v.name, v.missingCodes ?? [])
        return vals.length === 2
      }) ?? nominalVars[0]
      return {
        testId: 'ttest',
        description: 'Compare mean of a numeric outcome between two groups.',
        variables: [
          ...(scale ? [{ name: scale.name, label: scale.label, role: 'outcome' }] : []),
          ...(groupVar ? [{ name: groupVar.name, label: groupVar.label, role: 'group' }] : []),
        ],
      }
    }
    case 'anova':
      return {
        testId: 'anova',
        description: 'Compare mean of a numeric outcome across 3+ groups.',
        variables: [
          ...(targetScale ?? scaleVars[0] ? [{ name: (targetScale ?? scaleVars[0])!.name, label: (targetScale ?? scaleVars[0])!.label, role: 'outcome' }] : []),
          ...(nominalVars[0] ? [{ name: nominalVars[0].name, label: nominalVars[0].label, role: 'group' }] : []),
        ],
      }
    case 'linreg':
      return {
        testId: 'linreg',
        description: 'Linear regression: predict a scale outcome from one or more predictors.',
        variables: [
          ...(targetScale ?? scaleVars[0] ? [{ name: (targetScale ?? scaleVars[0])!.name, label: (targetScale ?? scaleVars[0])!.label, role: 'outcome' }] : []),
          ...variables.filter((v) => v.measurementLevel === 'scale' || v.measurementLevel === 'nominal').slice(0, 5).map((v) => ({ name: v.name, label: v.label, role: 'predictor' })),
        ],
      }
    case 'logreg': {
      const binaryOutcome = targetNominal ?? nominalVars.find((v) => getDistinctValues(rows, v.name, v.missingCodes ?? []).length === 2)
      return {
        testId: 'logreg',
        description: 'Logistic regression: binary outcome predicted from one or more predictors.',
        variables: [
          ...(binaryOutcome ? [{ name: binaryOutcome.name, label: binaryOutcome.label, role: 'outcome' }] : []),
          ...variables.filter((v) => v.measurementLevel === 'scale' || v.measurementLevel === 'nominal').slice(0, 5).map((v) => ({ name: v.name, label: v.label, role: 'predictor' })),
        ],
      }
    }
    case 'mann':
      return {
        testId: 'mann',
        description: 'Mann-Whitney U (2 groups) or Kruskal-Wallis (3+ groups): non-parametric comparison.',
        variables: [
          ...(targetScale ?? targetOrdinal ?? scaleVars[0] ?? ordinalVars[0] ? [{ name: (targetScale ?? targetOrdinal ?? scaleVars[0] ?? ordinalVars[0])!.name, label: (targetScale ?? targetOrdinal ?? scaleVars[0] ?? ordinalVars[0])!.label, role: 'outcome' }] : []),
          ...(nominalVars[0] ? [{ name: nominalVars[0].name, label: nominalVars[0].label, role: 'group' }] : []),
        ],
      }
    case 'paired':
      return {
        testId: 'paired',
        description: 'Paired t-test (2 repeated measures) or repeated-measures ANOVA (3+ levels).',
        variables: preferredPairedVars.map((v) => ({ name: v.name, label: v.label, role: 'repeated measure' })),
      }
    case 'pca':
      return {
        testId: 'pca',
        description: 'Principal component analysis: dimension reduction for scale variables.',
        variables: scaleVars.slice(0, 8).map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
    default:
      return {
        testId,
        description: 'Variables will be selected based on your data.',
        variables: variables.slice(0, 3).map((v) => ({ name: v.name, label: v.label, role: 'variable' })),
      }
  }
}

export function runTest(
  testId: TestId,
  dataset: DatasetState,
  selectedVarNames?: string[]
): TestResult | null {
  const variables = includedVariables(dataset)
  const { rows } = dataset
  const n = rows.length
  const scaleVars = variables.filter((v) => v.measurementLevel === 'scale')
  const nominalVars = variables.filter((v) => v.measurementLevel === 'nominal')
  const ordinalVars = variables.filter((v) => v.measurementLevel === 'ordinal')
  const getVar = (name: string) => dataset.variables.find((v) => v.name === name)!

  switch (testId) {
    case 'freq': {
      const varName = selectedVarNames?.[0] ?? variables.find((v) => v.measurementLevel !== 'scale')?.name ?? variables[0]?.name
      if (!varName)
        return notApplicableResult('freq', 'Frequencies & percentages', 'No variable available. Add at least one variable in Variable View.')
      const missingCodes = getVar(varName)?.missingCodes ?? []
      const counts: Record<string, number> = {}
      for (const row of rows) {
        const v = row[varName]
        const key = isUserMissing(v, missingCodes) ? '(missing)' : String(v)
        counts[key] = (counts[key] ?? 0) + 1
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      const table: ResultRow[] = Object.entries(counts).map(([value, count]) => ({
        Value: value,
        Count: count,
        Percent: total ? Math.round((count / total) * 1000) / 10 : 0,
      }))
      const varLabel = getVar(varName)?.label ?? varName
      const chart: ChartSpec = {
        type: 'bar',
        title: `Distribution of ${varLabel}`,
        data: table.map((r) => ({
          name: String(r.Value),
          value: Number(r.Count),
          percent: total ? Math.round((Number(r.Count) / total) * 1000) / 10 : 0,
        })),
        xKey: 'name',
        yKey: 'value',
        percentKey: 'percent',
      }
      const insight =
        total > 0
          ? `Frequencies for "${varLabel}": ${table.length} categories. ${table.slice(0, 3).map((r) => `${r.Value}: ${r.Count} (${r.Percent}%)`).join('; ')}${table.length > 3 ? '…' : ''}.`
          : 'No data for this variable.'
      const topCategory = table.length > 0 ? table.reduce((a, b) => (Number(a.Percent) >= Number(b.Percent) ? a : b)) : null
      const plainLanguage =
        total > 0 && topCategory
          ? `In practice: most responses are "${String(topCategory.Value)}" (${topCategory.Percent}%); ${table.length > 1 ? 'see the table for all categories.' : 'single category.'}`
          : undefined
      const nextStep = 'Next step: use these counts to check distributions before chi-square or other tests; watch for categories with very low counts.'
      const vlMap = valueLabelMapFromVar(getVar(varName))
      const valueLabelMaps = Object.keys(vlMap).length > 0 ? { [varName]: vlMap } : undefined
      return {
        testId,
        testName: 'Frequencies & percentages',
        table,
        chart,
        insight,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [{ name: varName, label: varLabel, role: 'variable' }],
        valueLabelMaps,
      }
    }

    case 'desc': {
      const scaleVars = variables.filter((v) => v.measurementLevel === 'scale')
      const toUse = selectedVarNames?.length
        ? selectedVarNames.filter((n) => scaleVars.some((v) => v.name === n))
        : scaleVars.slice(0, 6).map((v) => v.name)
      const table: ResultRow[] = []
      for (const name of toUse) {
        const vals = getNumericValues(rows, name, getVar(name)?.missingCodes ?? [])
        if (vals.length === 0) {
          table.push({ Variable: getVar(name)?.label ?? name, N: 0, Mean: '—', SD: '—', Min: '—', Max: '—' })
          continue
        }
        const m = mean(vals)
        const sd = vals.length < 2 ? 0 : standardDeviation(vals)
        table.push({
          Variable: getVar(name)?.label ?? name,
          N: vals.length,
          Mean: Math.round(m * 1000) / 1000,
          SD: vals.length < 2 ? '—' : Math.round((sd as number) * 1000) / 1000,
          Min: min(vals),
          Max: max(vals),
        })
      }
      const chart: ChartSpec | undefined =
        toUse.length > 0
          ? {
              type: 'bar',
              title: 'Means by variable',
              data: table.map((r) => ({ name: String(r.Variable), value: Number(r.Mean) })),
              xKey: 'name',
              yKey: 'value',
            }
          : undefined
      const varNames = toUse.map((name) => getVar(name)?.label ?? name).join(', ')
      const insight =
        table.length > 0
          ? `Descriptive statistics for: ${varNames}. N ranges from ${Math.min(...table.map((r) => Number(r.N)))} to ${Math.max(...table.map((r) => Number(r.N)))}. Use these to summarize central tendency and spread before inferential tests.`
          : 'No scale variables to summarize.'
      const plainLanguage =
        table.length > 0
          ? 'In practice: use these means and SDs to describe your sample; check min/max for outliers and spread.'
          : undefined
      const nextStep = 'Next step: report these before t-tests or ANOVA; if distributions are skewed, consider median and IQR instead.'
      return {
        testId,
        testName: 'Mean, SD, Min, Max',
        table,
        chart,
        insight,
        plainLanguage,
        nextStep,
        variablesAnalyzed: toUse.map((name) => ({ label: getVar(name)?.label ?? name, role: 'variable' })),
      }
    }

    case 'missing': {
      const table: ResultRow[] = variables.map((v) => {
        const codes = v.missingCodes ?? []
        const missing = rows.filter((r) => isUserMissing(r[v.name], codes)).length
        const pct = n ? Math.round((missing / n) * 1000) / 10 : 0
        return { Variable: v.label, Missing: missing, Total: n, 'Missing %': pct }
      })
      const worst = table.filter((r) => Number(r['Missing %']) > 30)
      const hasAny = table.filter((r) => Number(r.Missing) > 0).length
      const insight =
        worst.length > 0
          ? `Missing values for your variables: ${worst.length} have more than 30% missing — ${worst.map((r) => r.Variable).join(', ')}. Consider excluding or imputing before analysis.`
          : hasAny > 0
            ? `Missing summary: ${hasAny} variable(s) have at least one missing value. See table for counts and %.`
            : 'No missing values in the variables checked.'
      const plainLanguage =
        worst.length > 0
          ? `In practice: ${worst.map((r) => r.Variable).join(', ')} have high missingness; results using these variables may be biased.`
          : hasAny > 0
            ? 'In practice: missingness is low to moderate; listwise deletion or simple imputation may be fine.'
            : 'In practice: no missing data in the variables summarized.'
      const nextStep = worst.length > 0 ? 'Next step: consider excluding or imputing high-missingness variables before running further analyses.' : 'Next step: you can proceed with analyses; report N per analysis if some variables have missing values.'
      return { testId, testName: 'Missing value summary', table, insight, plainLanguage, nextStep }
    }

    case 'crosstab': {
      const [rowVar, colVar] = selectedVarNames ?? [
        nominalVars[0]?.name,
        nominalVars[1]?.name ?? nominalVars[0]?.name,
      ]
      if (!rowVar || !colVar)
        return notApplicableResult(
          'crosstab',
          'Crosstabulation + Chi-Square',
          'Crosstab requires two categorical (nominal or ordinal) variables.',
          'In Variable View, set at least two variables to Nominal or Ordinal, then run again.'
        )
      const rowVals = getDistinctValues(rows, rowVar, getVar(rowVar)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
      const colVals = getDistinctValues(rows, colVar, getVar(colVar)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
      const grid: number[][] = rowVals.map(() => colVals.map(() => 0))
      let total = 0
      for (const row of rows) {
        const r = row[rowVar]
        const c = row[colVar]
        if (r == null || r === '' || c == null || c === '') continue
        const ri = rowVals.indexOf(r)
        const ci = colVals.indexOf(c)
        if (ri >= 0 && ci >= 0) {
          grid[ri][ci]++
          total++
        }
      }
      const rowSums = grid.map((r) => r.reduce((a, b) => a + b, 0))
      const colSums = colVals.map((_, j) => grid.reduce((a, row) => a + row[j], 0))
      const expected = (i: number, j: number) => (rowSums[i] * colSums[j]) / total
      let chiSq = 0
      for (let i = 0; i < rowVals.length; i++)
        for (let j = 0; j < colVals.length; j++) {
          const e = expected(i, j)
          if (e > 0) chiSq += ((grid[i][j] - e) ** 2) / e
        }
      const df = (rowVals.length - 1) * (colVals.length - 1)
      const table: ResultRow[] = [
        { Statistic: 'Chi-Square', Value: Math.round(chiSq * 1000) / 1000 },
        { Statistic: 'df', Value: df },
        { Statistic: 'N', Value: total },
      ]
      if (rowVals.length === 2 && colVals.length === 2) {
        const a = grid[0][0]
        const b = grid[0][1]
        const c = grid[1][0]
        const d = grid[1][1]
        const r1 = a + b
        const r2 = c + d
        const c1 = a + c
        const c2 = b + d
        const n = total
        const logFact = (x: number) => {
          if (x < 2) return 0
          let s = 0
          for (let i = 2; i <= x; i++) s += Math.log(i)
          return s
        }
        const logProb = (aa: number, bb: number, cc: number, dd: number) =>
          logFact(r1) + logFact(r2) + logFact(c1) + logFact(c2) -
          logFact(n) - logFact(aa) - logFact(bb) - logFact(cc) - logFact(dd)
        const pObs = logProb(a, b, c, d)
        let pFisher = 0
        const aMin = Math.max(0, r1 - c2)
        const aMax = Math.min(r1, c1)
        for (let aa = aMin; aa <= aMax; aa++) {
          const bb = r1 - aa
          const cc = c1 - aa
          const dd = c2 - bb
          const lp = logProb(aa, bb, cc, dd)
          if (lp <= pObs + 1e-10) pFisher += Math.exp(lp)
        }
        pFisher = Math.min(1, pFisher)
        table.push(
          { Statistic: "Fisher's exact p (2-tailed)", Value: pFisher < 0.001 ? '< 0.001' : Math.round(pFisher * 1000) / 1000 },
        )
      }
      const chartData = rowVals.flatMap((rv, i) =>
        colVals.map((cv, j) => ({
          name: `${rv} × ${cv}`,
          count: grid[i][j],
        }))
      )
      const chart: ChartSpec = {
        type: 'bar',
        title: `Crosstab: ${getVar(rowVar)?.label ?? rowVar} × ${getVar(colVar)?.label ?? colVar}`,
        data: chartData,
        xKey: 'name',
        yKey: 'count',
      }
      const rowLabel = getVar(rowVar)?.label ?? rowVar
      const colLabel = getVar(colVar)?.label ?? colVar
      const sig = df >= 1 && chiSq > 3.84
      const insight = `Association between "${rowLabel}" and "${colLabel}": Chi-Square = ${chiSq.toFixed(2)}, df = ${df}. ${sig ? 'The association is statistically significant (p < 0.05).' : 'The association is not statistically significant at α = 0.05.'}`
      const plainLanguage = sig
        ? `In practice: "${rowLabel}" and "${colLabel}" are associated in your sample; the pattern in the table shows how they relate.`
        : `In practice: we don't see evidence of association between "${rowLabel}" and "${colLabel}" in this dataset.`
      const nextStep = sig
        ? 'Next step: report this association and the cell counts; if any expected count was < 5, consider Fisher’s exact or collapsing categories.'
        : 'Next step: you can report "no evidence of association"; consider confidence intervals or a larger sample if you need more precision.'
      const rowMap = valueLabelMapFromVar(getVar(rowVar))
      const colMap = valueLabelMapFromVar(getVar(colVar))
      const valueLabelMaps =
        Object.keys(rowMap).length > 0 || Object.keys(colMap).length > 0
          ? { [rowVar]: rowMap, [colVar]: colMap }
          : undefined
      const minDim = Math.min(rowVals.length, colVals.length) - 1
      const cramersV = total > 0 && minDim > 0 ? Math.sqrt(chiSq / (total * minDim)) : 0
      return {
        testId,
        testName: 'Crosstabulation + Chi-Square',
        table: [
          ...table,
          ...(cramersV > 0 ? [{ Statistic: "Cramér's V", Value: Math.round(cramersV * 1000) / 1000 }] : []),
        ],
        chart,
        insight,
        keyStat: `χ² = ${chiSq.toFixed(2)}, df = ${df}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { name: rowVar, label: rowLabel, role: 'row variable' },
          { name: colVar, label: colLabel, role: 'column variable' },
        ],
        valueLabelMaps,
        effectSize: cramersV,
        effectSizeLabel: "Cramér's V",
      }
    }

    case 'corr': {
      const [v1, v2] = selectedVarNames ?? scaleVars.slice(0, 2).map((v: { name: string }) => v.name)
      if (!v1 || !v2)
        return notApplicableResult(
          'corr',
          'Pearson correlation',
          'Correlation requires two continuous (scale) variables.',
          'In Variable View, set two variables to Scale, then run again.'
        )
      const xTrim: number[] = []
      const yTrim: number[] = []
      for (let i = 0; i < rows.length; i++) {
        const a = rows[i][v1]
        const b = rows[i][v2]
        if (typeof a === 'number' && !Number.isNaN(a) && typeof b === 'number' && !Number.isNaN(b)) {
          xTrim.push(a)
          yTrim.push(b)
        }
      }
      if (xTrim.length < 3)
        return notApplicableResult(
          'corr',
          'Pearson correlation',
          `Need at least 3 paired observations; you have ${xTrim.length}.`,
          'Remove or impute missing values for both variables so more rows have valid pairs.'
        )
      const r = sampleCorrelation(xTrim, yTrim)
      const t = r * Math.sqrt((xTrim.length - 2) / (1 - r * r))
      const p = tToPValue(t, xTrim.length - 2)
      const table: ResultRow[] = [
        { Statistic: 'Pearson r', Value: Math.round(r * 1000) / 1000 },
        { Statistic: 'p-value (approx)', Value: p < 0.001 ? '< 0.001' : Math.round(p * 1000) / 1000 },
        { Statistic: 'N (pairs)', Value: xTrim.length },
      ]
      const chart: ChartSpec = {
        type: 'scatter',
        title: `${getVar(v1)?.label ?? v1} vs ${getVar(v2)?.label ?? v2}`,
        data: xTrim.map((xi, i) => ({ x: xi, y: yTrim[i] })),
        xKey: 'x',
        yKey: 'y',
      }
      const v1Label = getVar(v1)?.label ?? v1
      const v2Label = getVar(v2)?.label ?? v2
      const strength = Math.abs(r) < 0.3 ? 'weak' : Math.abs(r) < 0.6 ? 'moderate' : 'strong'
      const dir = r > 0 ? 'positive' : 'negative'
      const insight = `Relationship between "${v1Label}" and "${v2Label}": ${strength} ${dir} correlation (r = ${r.toFixed(3)}, p ${p < 0.05 ? '<' : '≥'} 0.05). ${p < 0.05 ? 'The relationship is statistically significant.' : 'The relationship is not statistically significant at α = 0.05.'}`
      const plainLanguage =
        p < 0.05
          ? `In practice: higher "${v1Label}" tends to go with ${r > 0 ? 'higher' : 'lower'} "${v2Label}" in your sample (${strength} ${dir}).`
          : `In practice: we don't see a clear linear link between "${v1Label}" and "${v2Label}" in this dataset.`
      const nextStep = p < 0.05
        ? 'Next step: report this correlation; if you have confounders or want to predict one from the other, consider regression.'
        : 'Next step: you can report "no significant linear association"; consider a scatterplot or Spearman if the relationship might be non-linear.'
      return {
        testId,
        testName: 'Pearson correlation',
        table,
        chart,
        insight,
        keyStat: `r = ${r.toFixed(3)}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: v1Label, role: 'variable 1' },
          { label: v2Label, role: 'variable 2' },
        ],
        effectSize: Math.abs(r),
        effectSizeLabel: 'r',
      }
    }

    case 'spearman': {
      const [v1, v2] = selectedVarNames ?? [...scaleVars, ...ordinalVars].slice(0, 2).map((v) => v.name)
      if (!v1 || !v2)
        return notApplicableResult(
          'spearman',
          'Spearman rank correlation',
          'Spearman requires two variables (scale or ordinal).',
          'In Variable View, set two variables to Scale or Ordinal, then run again.'
        )
      const xTrim: number[] = []
      const yTrim: number[] = []
      for (let i = 0; i < rows.length; i++) {
        const a = rows[i][v1]
        const b = rows[i][v2]
        const an = a === null || a === undefined || a === '' ? NaN : Number(a)
        const bn = b === null || b === undefined || b === '' ? NaN : Number(b)
        if (!Number.isNaN(an) && !Number.isNaN(bn)) {
          xTrim.push(an)
          yTrim.push(bn)
        }
      }
      if (xTrim.length < 3)
        return notApplicableResult(
          'spearman',
          'Spearman rank correlation',
          `Need at least 3 paired observations; you have ${xTrim.length}.`,
          'Remove or impute missing values for both variables.'
        )
      const rho = sampleRankCorrelation(xTrim, yTrim)
      const t = rho * Math.sqrt((xTrim.length - 2) / (1 - rho * rho))
      const p = tToPValue(t, xTrim.length - 2)
      const table: ResultRow[] = [
        { Statistic: 'Spearman ρ', Value: Math.round(rho * 1000) / 1000 },
        { Statistic: 'p-value (approx)', Value: p < 0.001 ? '< 0.001' : Math.round(p * 1000) / 1000 },
        { Statistic: 'N (pairs)', Value: xTrim.length },
      ]
      const chart: ChartSpec = {
        type: 'scatter',
        title: `${getVar(v1)?.label ?? v1} vs ${getVar(v2)?.label ?? v2} (ranks)`,
        data: xTrim.map((xi, i) => ({ x: xi, y: yTrim[i] })),
        xKey: 'x',
        yKey: 'y',
      }
      const v1Label = getVar(v1)?.label ?? v1
      const v2Label = getVar(v2)?.label ?? v2
      const strength = Math.abs(rho) < 0.3 ? 'weak' : Math.abs(rho) < 0.6 ? 'moderate' : 'strong'
      const insight = `Monotonic association between "${v1Label}" and "${v2Label}": Spearman ρ = ${rho.toFixed(3)}, p ${p < 0.05 ? '<' : '≥'} 0.05. ${strength} monotonic association. ${p < 0.05 ? 'Statistically significant.' : 'Not significant at α = 0.05.'}`
      const plainLanguage =
        p < 0.05
          ? `In practice: higher ranks in "${v1Label}" tend to go with ${rho > 0 ? 'higher' : 'lower'} ranks in "${v2Label}" (${strength}).`
          : `In practice: we don't see a clear monotonic link between "${v1Label}" and "${v2Label}" in this dataset.`
      const nextStep = p < 0.05
        ? 'Next step: report Spearman ρ; use when the relationship may be non-linear but monotonic.'
        : 'Next step: you can report "no significant monotonic association"; consider Pearson if a linear fit is plausible.'
      return {
        testId: 'spearman',
        testName: 'Spearman rank correlation',
        table,
        chart,
        insight,
        keyStat: `ρ = ${rho.toFixed(3)}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: v1Label, role: 'variable 1' },
          { label: v2Label, role: 'variable 2' },
        ],
        effectSize: Math.abs(rho),
        effectSizeLabel: 'ρ',
      }
    }

    case 'ttest': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name
      const groupName = selectedVarNames?.[1] ?? nominalVars.find((v) => getDistinctValues(rows, v.name, v.missingCodes ?? []).length === 2)?.name
      if (!outcomeName || !groupName)
        return notApplicableResult(
          'ttest',
          'Independent-samples t-test',
          'Need one continuous (scale) outcome and one categorical variable with exactly two groups.',
          'In Variable View: set the outcome to Scale and the grouping variable to Nominal with two categories.'
        )
      const groups = getDistinctValues(rows, groupName, getVar(groupName)?.missingCodes ?? [])
      if (groups.length !== 2)
        return notApplicableResult(
          'ttest',
          'Independent-samples t-test',
          `Grouping variable has ${groups.length} categories; t-test requires exactly 2.`,
          'Use One-way ANOVA for 3+ groups, or create a binary variable (e.g. merge categories).'
        )
      const [g1, g2] = groups
      const sample1 = rows.filter((r) => r[groupName] === g1).map((r) => r[outcomeName]).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
      const sample2 = rows.filter((r) => r[groupName] === g2).map((r) => r[outcomeName]).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
      if (sample1.length < 2 || sample2.length < 2)
        return notApplicableResult(
          'ttest',
          'Independent-samples t-test',
          'Need at least 2 observations per group.',
          `Current: ${sample1.length} and ${sample2.length}. Add data or check for missing values.`
        )
      const t = tTestTwoSample(sample1, sample2)
      if (t === null)
        return notApplicableResult('ttest', 'Independent-samples t-test', 'Could not compute t-statistic (e.g. zero variance in a group).', 'Check data and variance in each group.')
      const df = sample1.length + sample2.length - 2
      const p = tToPValue(t, df)
      const m1 = mean(sample1)
      const m2 = mean(sample2)
      const { F: leveneF, p: leveneP } = leveneTest([sample1, sample2])
      const { t: welchT, df: welchDf, p: welchP } = welchTTest(sample1, sample2)
      const skew1 = sample1.length >= 3 ? sampleSkewness(sample1) : 0
      const skew2 = sample2.length >= 3 ? sampleSkewness(sample2) : 0
      const s1 = standardDeviation(sample1)
      const s2 = standardDeviation(sample2)
      const n1 = sample1.length
      const n2 = sample2.length
      const pooledVar = (n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2
      const pooledSD = df > 0 && pooledVar >= 0 ? Math.sqrt(pooledVar / df) : 0
      const cohensD = pooledSD > 0 ? (m1 - m2) / pooledSD : 0
      const table: ResultRow[] = [
        { Group: String(g1), N: sample1.length, Mean: Math.round(m1 * 1000) / 1000, SD: Math.round(s1 * 1000) / 1000, Skewness: sample1.length >= 3 ? Math.round(skew1 * 1000) / 1000 : '—' },
        { Group: String(g2), N: sample2.length, Mean: Math.round(m2 * 1000) / 1000, SD: Math.round(s2 * 1000) / 1000, Skewness: sample2.length >= 3 ? Math.round(skew2 * 1000) / 1000 : '—' },
        { Statistic: 't (pooled)', Value: Math.round(t * 1000) / 1000 },
        { Statistic: 'df', Value: df },
        { Statistic: 'p-value (approx)', Value: p < 0.001 ? '< 0.001' : Math.round(p * 1000) / 1000 },
        { Statistic: "Cohen's d", Value: Math.round(cohensD * 1000) / 1000 },
        { Statistic: "Levene's F", Value: Math.round(leveneF * 1000) / 1000 },
        { Statistic: "Levene's p", Value: leveneP < 0.001 ? '< 0.001' : Math.round(leveneP * 1000) / 1000 },
        { Statistic: 'Welch t', Value: Math.round(welchT * 1000) / 1000 },
        { Statistic: 'Welch df', Value: welchDf },
        { Statistic: 'Welch p (approx)', Value: welchP < 0.001 ? '< 0.001' : Math.round(welchP * 1000) / 1000 },
      ]
      const chart: ChartSpec = {
        type: 'bar',
        title: `Mean ${getVar(outcomeName)?.label ?? outcomeName} by ${getVar(groupName)?.label ?? groupName}`,
        data: [
          { name: String(g1), mean: m1 },
          { name: String(g2), mean: m2 },
        ],
        xKey: 'name',
        yKey: 'mean',
      }
      const outcomeLabel = getVar(outcomeName)?.label ?? outcomeName
      const groupLabel = getVar(groupName)?.label ?? groupName
      const leveneNote = leveneP < 0.05 ? ' Variances differ (Levene p < 0.05); prefer Welch t.' : ' Variances similar (Levene p ≥ 0.05).'
      const insight = `Mean "${outcomeLabel}" by "${groupLabel}": ${m1.toFixed(2)} (${g1}) vs ${m2.toFixed(2)} (${g2}). ${p < 0.05 ? 'The difference is statistically significant (p < 0.05).' : 'The difference is not statistically significant (p ≥ 0.05).'}${leveneNote}`
      const diff = m2 - m1
      const plainLanguage =
        p < 0.05
          ? `In practice: "${String(g2)}" scores about ${Math.abs(diff).toFixed(2)} points ${diff > 0 ? 'higher' : 'lower'} on average than "${String(g1)}" for "${outcomeLabel}".`
          : `In practice: we don't see a statistically significant difference in "${outcomeLabel}" between "${String(g1)}" and "${String(g2)}" in this sample.`
      const nextStep = p < 0.05
        ? 'Next step: report the group means and SDs and the t-test result; use the table for exact values.'
        : 'Next step: you can report "no significant difference"; consider confidence interval for the mean difference or a larger sample.'
      return {
        testId,
        testName: 'Independent Samples T-Test',
        table,
        chart,
        insight,
        keyStat: `t = ${t.toFixed(2)}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: outcomeLabel, role: 'outcome' },
          { label: groupLabel, role: 'group' },
        ],
        effectSize: Math.abs(cohensD),
        effectSizeLabel: "Cohen's d",
      }
    }

    case 'anova': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name
      const groupName = selectedVarNames?.[1] ?? nominalVars.find((v) => getDistinctValues(rows, v.name, v.missingCodes ?? []).length >= 3)?.name ?? nominalVars[0]?.name
      if (!outcomeName || !groupName)
        return notApplicableResult(
          'anova',
          'One-way ANOVA',
          'Need one continuous (scale) outcome and one categorical variable with 3+ groups.',
          'In Variable View: set the outcome to Scale and the grouping variable to Nominal with at least 3 categories.'
        )
      const groupVals = getDistinctValues(rows, groupName, getVar(groupName)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
      if (groupVals.length < 3)
        return notApplicableResult(
          'anova',
          'One-way ANOVA',
          `Grouping variable has ${groupVals.length} categories; ANOVA requires 3 or more.`,
          'Use Independent-samples t-test for 2 groups.'
        )
      const samples = groupVals.map((g) =>
        rows
          .filter((r) => r[groupName] === g)
          .map((r) => r[outcomeName])
          .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
      )
      const nPerGroup = samples.map((s) => s.length)
      if (nPerGroup.some((n) => n < 2))
        return notApplicableResult(
          'anova',
          'One-way ANOVA',
          'Need at least 2 observations per group.',
          `Current group sizes: ${nPerGroup.join(', ')}.`
        )
      const allVals = samples.flat()
      const n = allVals.length
      const grandMean = mean(allVals)
      const groupMeans = samples.map((s) => mean(s))
      const SSB = samples.reduce((acc, s, j) => acc + s.length * (groupMeans[j] - grandMean) ** 2, 0)
      const SSW = samples.reduce((acc, s, j) => acc + s.reduce((a, x) => a + (x - groupMeans[j]) ** 2, 0), 0)
      const k = groupVals.length
      const df1 = k - 1
      const df2 = n - k
      if (df2 < 1) return notApplicableResult('anova', 'One-way ANOVA', 'Not enough observations for ANOVA.', 'Need more rows than groups.')
      const MSB = SSB / df1
      const MSW = SSW / df2
      const F = MSW > 0 ? MSB / MSW : 0
      const p = fToPValue(F, df1, df2)
      const { F: leveneF, p: leveneP } = leveneTest(samples)
      const SST = SSB + SSW
      const etaSq = SST > 0 ? SSB / SST : 0
      const table: ResultRow[] = [
        ...groupVals.map((g, j) => ({
          Group: String(g),
          N: nPerGroup[j],
          Mean: Math.round(groupMeans[j] * 1000) / 1000,
          SD: Math.round((samples[j].length < 2 ? 0 : standardDeviation(samples[j])) * 1000) / 1000,
        })),
        { Statistic: 'F', Value: Math.round(F * 1000) / 1000 },
        { Statistic: 'df1 (groups)', Value: df1 },
        { Statistic: 'df2 (error)', Value: df2 },
        { Statistic: 'p-value (approx)', Value: p < 0.001 ? '< 0.001' : Math.round(p * 1000) / 1000 },
        { Statistic: 'η² (eta-squared)', Value: Math.round(etaSq * 1000) / 1000 },
        { Statistic: "Levene's F", Value: Math.round(leveneF * 1000) / 1000 },
        { Statistic: "Levene's p", Value: leveneP < 0.001 ? '< 0.001' : Math.round(leveneP * 1000) / 1000 },
      ]
      if (p < 0.05 && k >= 2) {
        const qCrit = tukeyQCrit(k, df2)
        for (let i = 0; i < k; i++) {
          for (let j = i + 1; j < k; j++) {
            const diff = groupMeans[i] - groupMeans[j]
            const se = Math.sqrt(MSW * (1 / nPerGroup[i] + 1 / nPerGroup[j]))
            const q = se > 0 ? Math.abs(diff) / se : 0
            const sig = q >= qCrit
            table.push({
              'Post-hoc (Tukey)': `${groupVals[i]} vs ${groupVals[j]}`,
              Diff: Math.round(diff * 1000) / 1000,
              q: Math.round(q * 1000) / 1000,
              'q crit (approx)': Math.round(qCrit * 100) / 100,
              Significant: sig ? 'Yes' : 'No',
            })
          }
        }
      }
      const chart: ChartSpec = {
        type: 'bar',
        title: `Mean ${getVar(outcomeName)?.label ?? outcomeName} by ${getVar(groupName)?.label ?? groupName}`,
        data: groupVals.map((g, j) => ({ name: String(g), mean: groupMeans[j] })),
        xKey: 'name',
        yKey: 'mean',
      }
      const outcomeLabel = getVar(outcomeName)?.label ?? outcomeName
      const groupLabel = getVar(groupName)?.label ?? groupName
      const leveneNote = leveneP < 0.05 ? ' Variances differ (Levene p < 0.05); consider Welch ANOVA or robust methods.' : ''
      const insight = `Mean "${outcomeLabel}" by "${groupLabel}" (${k} groups): F(${df1}, ${df2}) = ${F.toFixed(2)}, p ${p < 0.05 ? '<' : '≥'} 0.05. ${p < 0.05 ? 'At least one group mean differs significantly. Post-hoc (Tukey HSD) above.' : 'No significant difference between group means.'}${leveneNote}`
      const plainLanguage =
        p < 0.05
          ? `In practice: at least one group differs in average "${outcomeLabel}"; use the Tukey rows in the table to see which pairs differ.`
          : `In practice: we don't see statistically significant differences in "${outcomeLabel}" across the "${groupLabel}" groups in this sample.`
      const nextStep = p < 0.05
        ? 'Next step: report F and p, then use the post-hoc table to describe which groups differ; report means and SDs per group.'
        : 'Next step: you can report "no significant difference between groups"; consider power or effect size if the sample is small.'
      return {
        testId,
        testName: 'One-way ANOVA',
        table,
        chart,
        insight,
        keyStat: `F = ${F.toFixed(2)}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: outcomeLabel, role: 'outcome' },
          { label: groupLabel, role: 'group' },
        ],
        effectSize: etaSq,
        effectSizeLabel: 'η²',
      }
    }

    case 'linreg': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name
      const predictorNames = selectedVarNames?.slice(1) ?? scaleVars.slice(1, 4).map((v) => v.name)
      if (!outcomeName || !predictorNames?.length)
        return notApplicableResult(
          'linreg',
          'Linear regression',
          'Need one scale outcome and at least one predictor (scale or nominal).',
          'In Variable View, set outcome and predictors, then run again.'
        )
      const vars = [outcomeName, ...predictorNames]
      const completeRows: DataRow[] = rows.filter((r) => vars.every((v) => r[v] != null && r[v] !== ''))
      if (completeRows.length < 4)
        return notApplicableResult(
          'linreg',
          'Linear regression',
          `Need at least 4 complete cases; you have ${completeRows.length}.`,
          'Remove or impute missing values for outcome and predictors.'
        )
      const variablesMeta = dataset.variables
      const getVarLabel = (name: string) => variablesMeta.find((v) => v.name === name)?.label ?? name
      const scalePredictors = predictorNames.filter((name) => variablesMeta.find((v) => v.name === name)?.measurementLevel === 'scale')
      const nominalPredictors = predictorNames.filter((name) => variablesMeta.find((v) => v.name === name)?.measurementLevel === 'nominal')
      const colNames: string[] = ['(Intercept)']
      for (const name of scalePredictors) colNames.push(name)
      for (const name of nominalPredictors) {
        const vals = getDistinctValues(completeRows, name, getVar(name)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
        const ref = vals[0]
        for (let i = 1; i < vals.length; i++) colNames.push(`${name}_${vals[i]} vs ${ref}`)
      }
      const X: number[][] = []
      const y: number[] = []
      for (const row of completeRows) {
        const xRow: number[] = [1]
        for (const name of scalePredictors) xRow.push(Number(row[name]))
        for (const name of nominalPredictors) {
          const vals = getDistinctValues(completeRows, name, getVar(name)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
          for (let i = 1; i < vals.length; i++) xRow.push(row[name] === vals[i] ? 1 : 0)
        }
        X.push(xRow)
        y.push(Number(row[outcomeName]))
      }
      const beta = olsSolve(X, y)
      if (!beta) return notApplicableResult('linreg', 'Linear regression', 'Design matrix is singular (e.g. collinearity).', 'Remove redundant predictors or add more data.')
      const n = X.length
      const k = beta.length - 1
      const yHat = X.map((row) => row.reduce((s, x, j) => s + x * beta[j], 0))
      const ssRes = y.reduce((s, yi, i) => s + (yi - yHat[i]) ** 2, 0)
      const yMean = mean(y)
      const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0)
      const rSq = ssTot > 0 ? 1 - ssRes / ssTot : 0
      const mse = n > k + 1 ? ssRes / (n - k - 1) : 0
      const A: number[][] = Array.from({ length: k + 1 }, () => Array(k + 1).fill(0))
      for (let i = 0; i < n; i++)
        for (let j = 0; j <= k; j++)
          for (let q = j; q <= k; q++) A[j][q] += X[i][j] * X[i][q]
      for (let j = 0; j <= k; j++) for (let q = 0; q < j; q++) A[q][j] = A[j][q]
      const se: number[] = []
      for (let j = 0; j <= k; j++) {
        const ej = Array(k + 1).fill(0)
        ej[j] = 1
        const col = solveSymmetric(A.map((r) => r.slice()), ej)
        se.push(col && mse > 0 ? Math.sqrt(mse * col[j]) : 0)
      }
      const F = k > 0 && n > k + 1 && (1 - rSq) > 0 ? (rSq / k) / ((1 - rSq) / (n - k - 1)) : 0
      const pF = k > 0 && n > k + 1 ? fToPValue(F, k, n - k - 1) : 1
      const table: ResultRow[] = colNames.map((name, j) => ({
        Predictor: name,
        Coef: Math.round(beta[j] * 1000) / 1000,
        SE: se[j] ? Math.round(se[j] * 1000) / 1000 : '—',
        t: se[j] ? Math.round((beta[j] / se[j]) * 1000) / 1000 : '—',
        'p (approx)': se[j] ? (tToPValue(beta[j] / se[j], n - k - 1) < 0.001 ? '< 0.001' : Math.round(tToPValue(beta[j] / se[j], n - k - 1) * 1000) / 1000) : '—',
      }))
      table.push(
        { Statistic: 'R²', Value: Math.round(rSq * 1000) / 1000 },
        { Statistic: 'F', Value: Math.round(F * 1000) / 1000 },
        { Statistic: 'df1', Value: k },
        { Statistic: 'df2', Value: n - k - 1 },
        { Statistic: 'p (model, approx)', Value: pF < 0.001 ? '< 0.001' : Math.round(pF * 1000) / 1000 },
      )
      const chart: ChartSpec = {
        type: 'scatter',
        title: `Fitted vs observed: ${getVarLabel(outcomeName)}`,
        data: y.map((yi, i) => ({ observed: yi, fitted: yHat[i] })),
        xKey: 'observed',
        yKey: 'fitted',
      }
      const outcomeLabel = getVarLabel(outcomeName)
      const predictorLabels = predictorNames.map(getVarLabel).join(', ')
      const insight = `Linear regression: predicting "${outcomeLabel}" from ${predictorLabels}. R² = ${rSq.toFixed(3)}. Model F(${k}, ${n - k - 1}) = ${F.toFixed(2)}, p ${pF < 0.05 ? '<' : '≥'} 0.05. ${pF < 0.05 ? 'At least one predictor is significant.' : 'Model is not statistically significant at α = 0.05.'}`
      const plainLanguage =
        pF < 0.05
          ? `In practice: the predictors explain about ${Math.round(rSq * 100)}% of the variance in "${outcomeLabel}"; see the table for which predictors matter most.`
          : `In practice: we don't see a statistically significant linear model for "${outcomeLabel}" with these predictors in this sample.`
      const nextStep = pF < 0.05
        ? 'Next step: report R² and p; use the coefficients table to describe which predictors are significant; check residuals for linearity.'
        : 'Next step: you can report "model not significant"; consider different predictors, transformations, or a larger sample.'
      return {
        testId: 'linreg',
        testName: 'Linear regression',
        table,
        chart,
        insight,
        keyStat: `R² = ${rSq.toFixed(3)}, p ${pF < 0.05 ? '< 0.05' : '≥ 0.05'}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: outcomeLabel, role: 'outcome' },
          ...predictorNames.map((name) => ({ label: getVarLabel(name), role: 'predictor' as const })),
        ],
        effectSize: rSq,
        effectSizeLabel: 'R²',
      }
    }

    case 'logreg': {
      const outcomeName = selectedVarNames?.[0] ?? nominalVars.find((v) => getDistinctValues(rows, v.name, v.missingCodes ?? []).length === 2)?.name
      const predictorNames = selectedVarNames?.slice(1) ?? [...scaleVars.slice(0, 2).map((v) => v.name), ...nominalVars.filter((v) => getDistinctValues(rows, v.name, v.missingCodes ?? []).length === 2).slice(0, 1).map((v) => v.name)].filter(Boolean)
      if (!outcomeName || !predictorNames?.length)
        return notApplicableResult(
          'logreg',
          'Logistic regression',
          'Need one binary outcome and at least one predictor.',
          'In Variable View, set outcome to Nominal with two categories and add scale or nominal predictors.'
        )
      const outcomeVals = getDistinctValues(rows, outcomeName, getVar(outcomeName)?.missingCodes ?? [])
      if (outcomeVals.length !== 2)
        return notApplicableResult(
          'logreg',
          'Logistic regression',
          `Outcome must have exactly two categories; it has ${outcomeVals.length}.`,
          'Use a binary variable (e.g. yes/no, 0/1) as outcome.'
        )
      const vars = [outcomeName, ...predictorNames]
      const completeRows = rows.filter((r) => vars.every((v) => r[v] != null && r[v] !== ''))
      if (completeRows.length < 10)
        return notApplicableResult(
          'logreg',
          'Logistic regression',
          `Need at least 10 complete cases; you have ${completeRows.length}.`,
          'Add more data for stable estimates.'
        )
      const variablesMeta = dataset.variables
      const [_refOutcome, otherOutcome] = outcomeVals.sort((a, b) => String(a).localeCompare(String(b)))
      const y = completeRows.map((r) => (r[outcomeName] === otherOutcome ? 1 : 0))
      const scalePreds = predictorNames.filter((n) => variablesMeta.find((v) => v.name === n)?.measurementLevel === 'scale')
      const nominalPreds = predictorNames.filter((n) => variablesMeta.find((v) => v.name === n)?.measurementLevel === 'nominal')
      const colNames: string[] = ['(Intercept)']
      for (const n of scalePreds) colNames.push(n)
      for (const n of nominalPreds) {
        const vals = getDistinctValues(completeRows, n, getVar(n)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
        for (let i = 1; i < vals.length; i++) colNames.push(`${n}_${vals[i]} vs ${vals[0]}`)
      }
      let X: number[][] = completeRows.map((r) => {
        const row: number[] = [1]
        for (const n of scalePreds) row.push(Number(r[n]))
        for (const n of nominalPreds) {
          const vals = getDistinctValues(completeRows, n, getVar(n)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
          for (let i = 1; i < vals.length; i++) row.push(r[n] === vals[i] ? 1 : 0)
        }
        return row
      })
      const n = X.length
      const p = X[0].length
      let beta = Array(p).fill(0)
      for (let iter = 0; iter < 30; iter++) {
        const eta = X.map((row) => row.reduce((s, x, j) => s + x * beta[j], 0))
        const mu = eta.map((e) => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, e)))))
        const W = mu.map((m) => m * (1 - m))
        const z = eta.map((e, i) => e + (y[i] - mu[i]) / (W[i] || 0.25))
        const XtWX: number[][] = Array.from({ length: p }, () => Array(p).fill(0))
        const XtWz: number[] = Array(p).fill(0)
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < p; j++) {
            XtWz[j] += X[i][j] * W[i] * z[i]
            for (let k = j; k < p; k++) XtWX[j][k] += X[i][j] * W[i] * X[i][k]
          }
        }
        for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) XtWX[k][j] = XtWX[j][k]
        const delta = solveSymmetric(XtWX.map((r) => r.slice()), XtWz)
        if (!delta) break
        let step = 1
        for (let j = 0; j < p; j++) beta[j] += step * delta[j]
        if (delta.every((d) => Math.abs(d) < 1e-6)) break
      }
      const eta = X.map((row) => row.reduce((s, x, j) => s + x * beta[j], 0))
      const mu = eta.map((e) => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, e)))))
      const W = mu.map((m) => m * (1 - m))
      const XtWX: number[][] = Array.from({ length: p }, () => Array(p).fill(0))
      for (let i = 0; i < n; i++)
        for (let j = 0; j < p; j++)
          for (let k = j; k < p; k++) XtWX[j][k] += X[i][j] * W[i] * X[i][k]
      for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) XtWX[k][j] = XtWX[j][k]
      const se: number[] = []
      for (let j = 0; j < p; j++) {
        const ej = Array(p).fill(0)
        ej[j] = 1
        const col = solveSymmetric(XtWX.map((r) => r.slice()), ej)
        se.push(col && col[j] > 0 ? Math.sqrt(col[j]) : 0)
      }
      const table: ResultRow[] = colNames.map((name, j) => {
        const pVal = se[j] ? tToPValue(beta[j] / se[j], n - p) : 1
        return {
          Predictor: name,
          Coef: Math.round(beta[j] * 1000) / 1000,
          'Odds ratio': Math.round(Math.exp(beta[j]) * 1000) / 1000,
          SE: se[j] ? Math.round(se[j] * 1000) / 1000 : '—',
          'p (approx)': se[j] ? (pVal < 0.001 ? '< 0.001' : Math.round(pVal * 1000) / 1000) : '—',
        }
      })
      const outcomeLabel = variablesMeta.find((v) => v.name === outcomeName)?.label ?? outcomeName
      const predictorLabels = predictorNames.map((name) => variablesMeta.find((v) => v.name === name)?.label ?? name).join(', ')
      const nEvents = (y as number[]).reduce((a, b) => a + b, 0)
      const insight = `Logistic regression: predicting "${outcomeLabel}" from ${predictorLabels}. ${table.length - 1} predictor(s). Odds ratios and Wald tests above. Check events per predictor (e.g. ≥10) for stability.`
      const plainLanguage = `In practice: the model estimates how each predictor relates to the probability of "${outcomeLabel}"; odds ratios above 1 mean higher probability with higher predictor (or that category).`
      const nextStep = 'Next step: report N and events; report odds ratios and p for each predictor; ensure you have enough events per predictor (e.g. ≥10) for stable estimates.'
      return {
        testId: 'logreg',
        testName: 'Logistic regression',
        table,
        insight,
        keyStat: `N = ${n}, events = ${nEvents}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: outcomeLabel, role: 'outcome' },
          ...predictorNames.map((name) => ({ label: variablesMeta.find((v) => v.name === name)?.label ?? name, role: 'predictor' as const })),
        ],
      }
    }

    case 'mann': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name ?? ordinalVars[0]?.name
      const groupName = selectedVarNames?.[1] ?? nominalVars[0]?.name
      if (!outcomeName || !groupName)
        return notApplicableResult(
          'mann',
          'Mann-Whitney U / Kruskal-Wallis',
          'Need one scale or ordinal outcome and one categorical group variable.',
          'In Variable View, set outcome (Scale or Ordinal) and a Nominal group variable.'
        )
      const groupVals = getDistinctValues(rows, groupName, getVar(groupName)?.missingCodes ?? []).sort((a, b) => String(a).localeCompare(String(b)))
      const samples = groupVals.map((g) =>
        rows
          .filter((r) => r[groupName] === g)
          .map((r) => r[outcomeName])
          .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
      )
      const allVals = samples.flat()
      if (allVals.length < 3 || samples.some((s) => s.length < 1))
        return notApplicableResult(
          'mann',
          'Mann-Whitney U / Kruskal-Wallis',
          'Need at least one observation per group and 3 total.',
          `Current: ${samples.map((s) => s.length).join(', ')}.`
        )
      const getVarLabel = (name: string) => dataset.variables.find((v) => v.name === name)?.label ?? name
      if (groupVals.length === 2) {
        const [s1, s2] = samples
        const rankSum = wilcoxonRankSum(s1, s2)
        const n1 = s1.length
        const n2 = s2.length
        const U1 = rankSum - (n1 * (n1 + 1)) / 2
        const U2 = n1 * n2 - U1
        const U = Math.min(U1, U2)
        const muU = (n1 * n2) / 2
        const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12)
        const z = sigmaU > 0 ? (U - muU) / sigmaU : 0
        const p = 2 * (1 - cumulativeStdNormalProbability(Math.abs(z)))
        const table: ResultRow[] = [
          { Group: String(groupVals[0]), N: n1, 'Rank sum': rankSum },
          { Group: String(groupVals[1]), N: n2 },
          { Statistic: 'Mann-Whitney U', Value: U },
          { Statistic: 'z (approx)', Value: Math.round(z * 1000) / 1000 },
          { Statistic: 'p (approx)', Value: p < 0.001 ? '< 0.001' : Math.round(p * 1000) / 1000 },
        ]
        const chart: ChartSpec = {
          type: 'bar',
          title: `Median ${getVarLabel(outcomeName)} by ${getVarLabel(groupName)}`,
          data: groupVals.map((g, j) => ({ name: String(g), median: samples[j].length ? samples[j].slice().sort((a, b) => a - b)[Math.floor(samples[j].length / 2)] : 0 })),
          xKey: 'name',
          yKey: 'median',
        }
        const outcomeLabel = getVarLabel(outcomeName)
        const groupLabel = getVarLabel(groupName)
        const insight = `Mann-Whitney U for "${outcomeLabel}" by "${groupLabel}": U = ${U}, z ≈ ${z.toFixed(2)}, p ${p < 0.05 ? '<' : '≥'} 0.05. ${p < 0.05 ? 'The two groups differ significantly in distribution.' : 'No significant difference.'}`
        const plainLanguage =
          p < 0.05
            ? `In practice: "${String(groupVals[1])}" tends to have higher (or lower) ranks than "${String(groupVals[0])}" for "${outcomeLabel}".`
            : `In practice: we don't see a significant difference in the distribution of "${outcomeLabel}" between the two groups.`
        const nextStep = p < 0.05
          ? 'Next step: report U and p; use medians from the chart or table to describe the groups.'
          : 'Next step: you can report "no significant difference"; consider reporting rank sums or medians.'
        return {
          testId: 'mann',
          testName: 'Mann-Whitney U',
          table,
          chart,
          insight,
          keyStat: `U = ${U}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
          plainLanguage,
          nextStep,
          variablesAnalyzed: [
            { label: outcomeLabel, role: 'outcome' },
            { label: groupLabel, role: 'group' },
          ],
        }
      }
      const k = groupVals.length
      const N = allVals.length
      const pooled: { value: number; groupIdx: number }[] = []
      let gIdx = 0
      for (const s of samples) {
        for (const v of s) pooled.push({ value: v, groupIdx: gIdx })
        gIdx++
      }
      pooled.sort((a, b) => a.value - b.value)
      const ranks: number[] = []
      let r = 0
      while (r < N) {
        let count = 1
        while (r + count < N && pooled[r + count].value === pooled[r].value) count++
        const avgRank = r + (count + 1) / 2
        for (let j = 0; j < count; j++) ranks[r + j] = avgRank
        r += count
      }
      const Rsums2 = samples.map(() => 0)
      for (let i = 0; i < N; i++) Rsums2[pooled[i].groupIdx] += ranks[i]
      const H = (12 / (N * (N + 1))) * Rsums2.reduce((acc, Rj_val, j) => acc + (Rj_val * Rj_val) / samples[j].length, 0) - 3 * (N + 1)
      const dfKw = k - 1
      const pKw = H <= 0 ? 1 : 1 - cumulativeStdNormalProbability((H - dfKw) / Math.sqrt(2 * dfKw))
      const table: ResultRow[] = [
        ...groupVals.map((g, j) => ({ Group: String(g), N: samples[j].length, 'Rank sum': Math.round(Rsums2[j] * 100) / 100 })),
        { Statistic: 'Kruskal-Wallis H', Value: Math.round(H * 1000) / 1000 },
        { Statistic: 'df', Value: dfKw },
        { Statistic: 'p (approx)', Value: pKw < 0.001 ? '< 0.001' : Math.round(pKw * 1000) / 1000 },
      ]
      const chart: ChartSpec = {
        type: 'bar',
        title: `Median ${getVarLabel(outcomeName)} by ${getVarLabel(groupName)}`,
        data: groupVals.map((g, j) => ({
          name: String(g),
          median: samples[j].length ? samples[j].slice().sort((a, b) => a - b)[Math.floor(samples[j].length / 2)] : 0,
        })),
        xKey: 'name',
        yKey: 'median',
      }
      const outcomeLabel = getVarLabel(outcomeName)
      const groupLabel = getVarLabel(groupName)
      const insight = `Kruskal-Wallis for "${outcomeLabel}" by "${groupLabel}" (${k} groups): H = ${H.toFixed(2)}, df = ${dfKw}, p ${pKw < 0.05 ? '<' : '≥'} 0.05. ${pKw < 0.05 ? 'At least one group differs in distribution.' : 'No significant difference.'}`
      const plainLanguage =
        pKw < 0.05
          ? `In practice: at least one group differs in the distribution of "${outcomeLabel}"; compare medians or rank sums in the table.`
          : `In practice: we don't see a significant difference in "${outcomeLabel}" across the "${groupLabel}" groups.`
      const nextStep = pKw < 0.05
        ? 'Next step: report H and p; use the table to describe which groups have higher/lower ranks or medians.'
        : 'Next step: you can report "no significant difference"; consider reporting medians per group.'
      return {
        testId: 'mann',
        testName: 'Kruskal-Wallis',
        table,
        chart,
        insight,
        keyStat: `H = ${H.toFixed(2)}, p ${pKw < 0.05 ? '< 0.05' : '≥ 0.05'}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: outcomeLabel, role: 'outcome' },
          { label: groupLabel, role: 'group' },
        ],
      }
    }

    case 'paired': {
      const measureNames = selectedVarNames?.length ? selectedVarNames : scaleVars.slice(0, 2).map((v) => v.name)
      if (!measureNames?.length || measureNames.length < 2)
        return notApplicableResult(
          'paired',
          'Paired t-test / Repeated-measures ANOVA',
          'Need at least two scale variables (e.g. pre and post, or two conditions).',
          'In Variable View, add two or more scale variables for repeated measures.'
        )
      const [v1, v2] = measureNames.slice(0, 2)
      const missing1 = getVar(v1)?.missingCodes ?? []
      const missing2 = getVar(v2)?.missingCodes ?? []
      const pairs: number[][] = []
      for (const row of rows) {
        const a = row[v1]
        const b = row[v2]
        if (isUserMissing(a, missing1) || isUserMissing(b, missing2)) continue
        const na = Number(a)
        const nb = Number(b)
        if (typeof na === 'number' && !Number.isNaN(na) && typeof nb === 'number' && !Number.isNaN(nb)) pairs.push([na, nb])
      }
      if (pairs.length < 3)
        return notApplicableResult(
          'paired',
          'Paired t-test',
          `Need at least 3 paired observations; you have ${pairs.length}.`,
          'Ensure both variables have valid numeric values for the same rows.'
        )
      const diffs = pairs.map(([a, b]) => a - b)
      const meanDiff = mean(diffs)
      const sdDiff = standardDeviation(diffs)
      const t = pairs.length > 1 ? tTest(diffs, 0) : 0
      const dfPaired = pairs.length - 1
      const p = tToPValue(t, dfPaired)
      const getVarLabel = (name: string) => dataset.variables.find((v) => v.name === name)?.label ?? name
      const table: ResultRow[] = [
        { Statistic: 'Mean difference', Value: Math.round(meanDiff * 1000) / 1000 },
        { Statistic: 'SD of differences', Value: Math.round(sdDiff * 1000) / 1000 },
        { Statistic: 't', Value: Math.round(t * 1000) / 1000 },
        { Statistic: 'df', Value: dfPaired },
        { Statistic: 'p-value (approx)', Value: p < 0.001 ? '< 0.001' : Math.round(p * 1000) / 1000 },
      ]
      const chart: ChartSpec = {
        type: 'scatter',
        title: `${getVarLabel(v1)} vs ${getVarLabel(v2)} (paired)`,
        data: pairs.map(([a, b]) => ({ x: a, y: b })),
        xKey: 'x',
        yKey: 'y',
      }
      const v1Label = getVarLabel(v1)
      const v2Label = getVarLabel(v2)
      const insight = `Paired t-test: "${v1Label}" vs "${v2Label}". Mean difference = ${meanDiff.toFixed(3)}, t(${dfPaired}) = ${t.toFixed(2)}, p ${p < 0.05 ? '<' : '≥'} 0.05. ${p < 0.05 ? 'The difference is statistically significant.' : 'No significant difference.'}`
      const plainLanguage =
        p < 0.05
          ? `In practice: on average, "${v2Label}" is about ${Math.abs(meanDiff).toFixed(2)} points ${meanDiff > 0 ? 'higher' : 'lower'} than "${v1Label}" in your sample.`
          : `In practice: we don't see a statistically significant average change from "${v1Label}" to "${v2Label}" in this sample.`
      const nextStep = p < 0.05
        ? 'Next step: report mean difference, t, and p; report SD of differences and N.'
        : 'Next step: you can report "no significant change"; consider confidence interval for the mean difference.'
      return {
        testId: 'paired',
        testName: 'Paired t-test',
        table,
        chart,
        insight,
        keyStat: `t = ${t.toFixed(2)}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: [
          { label: v1Label, role: 'measure 1' },
          { label: v2Label, role: 'measure 2' },
        ],
      }
    }

    case 'pca': {
      const varNames = selectedVarNames?.length ? selectedVarNames : scaleVars.slice(0, 6).map((v) => v.name)
      if (!varNames.length)
        return notApplicableResult('pca', 'PCA', 'Need at least one scale variable.', 'In Variable View, set variables to Scale.')
      const completeRows = rows.filter((r) =>
        varNames.every((v) => !isUserMissing(r[v], getVar(v)?.missingCodes ?? []) && !Number.isNaN(Number(r[v])))
      )
      if (completeRows.length < 4)
        return notApplicableResult('pca', 'PCA', `Need at least 4 complete cases; you have ${completeRows.length}.`, 'Remove or impute missing values.')
      const X = completeRows.map((r) => varNames.map((v) => Number(r[v])))
      const n = X.length
      const p = varNames.length
      const means = varNames.map((_, j) => mean(X.map((row) => row[j])))
      const centered = X.map((row) => row.map((x, j) => x - means[j]))
      const C: number[][] = Array.from({ length: p }, () => Array(p).fill(0))
      for (let i = 0; i < n; i++)
        for (let j = 0; j < p; j++)
          for (let k = j; k < p; k++) C[j][k] += centered[i][j] * centered[i][k]
      const denom = n > 1 ? n - 1 : 1
      for (let j = 0; j < p; j++) for (let k = j; k < p; k++) C[j][k] /= denom
      for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) C[k][j] = C[j][k]
      const eigenvalues: number[] = []
      const eigenvectors: number[][] = []
      let Cwork = C.map((row) => row.slice())
      for (let comp = 0; comp < Math.min(p, n - 1); comp++) {
        let v = Array(p).fill(1 / Math.sqrt(p))
        for (let iter = 0; iter < 50; iter++) {
          const w = Array(p).fill(0)
          for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) w[i] += Cwork[i][j] * v[j]
          const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0))
          if (norm < 1e-12) break
          for (let i = 0; i < p; i++) v[i] = w[i] / norm
        }
        let lambda = 0
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) lambda += v[i] * Cwork[i][j] * v[j]
        eigenvalues.push(lambda)
        eigenvectors.push(v.slice())
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) Cwork[i][j] -= lambda * v[i] * v[j]
      }
      const totalVar = eigenvalues.reduce((a, b) => a + b, 0)
      const table: ResultRow[] = eigenvalues.map((ev, i) => ({
        Component: `PC${i + 1}`,
        Eigenvalue: Math.round(ev * 1000) / 1000,
        '% variance': totalVar > 0 ? Math.round((ev / totalVar) * 1000) / 10 : 0,
        'Cumulative %': totalVar > 0 ? Math.round((eigenvalues.slice(0, i + 1).reduce((a, b) => a + b, 0) / totalVar) * 1000) / 10 : 0,
      }))
      const chart: ChartSpec = {
        type: 'bar',
        title: 'Variance explained by component',
        data: eigenvalues.map((ev, i) => ({ name: `PC${i + 1}`, value: totalVar > 0 ? Math.round((ev / totalVar) * 1000) / 10 : 0 })),
        xKey: 'name',
        yKey: 'value',
      }
      const cum80 = eigenvalues.findIndex((_, i) => eigenvalues.slice(0, i + 1).reduce((a, b) => a + b, 0) / totalVar >= 0.8)
      const varLabels = varNames.map((name) => getVar(name)?.label ?? name).join(', ')
      const pcaInsight = `PCA on ${p} variables (${varLabels}), N = ${n}. Total variance = ${totalVar.toFixed(2)}. ${cum80 >= 0 ? `First ${cum80 + 1} component(s) explain ≥80% of variance.` : 'Consider retaining components with eigenvalue > 1 or using scree plot.'}`
      const plainLanguage =
        cum80 >= 0
          ? `In practice: the first ${cum80 + 1} component(s) capture most of the variance in "${varLabels}"; you can use them for dimension reduction or construct validation.`
          : 'In practice: variance is spread across components; consider eigenvalue > 1 or a scree plot to choose how many components to keep.'
      const nextStep = 'Next step: report eigenvalues and % variance; use component loadings (if available) to interpret components; consider rotation for interpretability.'
      return {
        testId: 'pca',
        testName: 'Principal component analysis',
        table,
        chart,
        insight: pcaInsight,
        keyStat: `${p} components, ${totalVar.toFixed(2)} total variance`,
        plainLanguage,
        nextStep,
        variablesAnalyzed: varNames.map((name) => ({ label: getVar(name)?.label ?? name, role: 'variable' })),
      }
    }

    default:
      return {
        testId,
        testName: String(testId),
        table: [{ Note: 'This test is not yet implemented.', Implemented: 'freq, desc, missing, crosstab, corr, spearman, ttest, anova, linreg, logreg, mann, paired, pca' }],
        insight: 'Not yet implemented. All Tier 1–3 tests and PCA are implemented.',
      }
  }
}
