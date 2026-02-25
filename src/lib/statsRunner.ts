import {
  mean,
  min,
  max,
  standardDeviation,
  tTestTwoSample,
  sampleCorrelation,
  cumulativeStdNormalProbability,
} from 'simple-statistics'
import type { DatasetState, DataRow } from '../types'

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
  | 'ttest'
  | 'anova'
  | 'linreg'
  | 'logreg'
  | 'mann'
  | 'paired'

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
}

function getNumericValues(rows: DataRow[], varName: string): number[] {
  const out: number[] = []
  for (const row of rows) {
    const v = row[varName]
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (!Number.isNaN(n)) out.push(n)
  }
  return out
}

function getDistinctValues(rows: DataRow[], varName: string): (string | number)[] {
  const set = new Set<string | number>()
  for (const row of rows) {
    const v = row[varName]
    if (v === null || v === undefined || v === '') continue
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

/** Variables included in analysis (excluded ones are ignored in suggestions and tests). */
function includedVariables(dataset: DatasetState) {
  return dataset.variables.filter((v) => v.includeInAnalysis !== false)
}

export function getSuggestedVariables(testId: TestId, dataset: DatasetState): SuggestedVars {
  const variables = includedVariables(dataset)
  const { rows } = dataset
  const scaleVars = variables.filter((v) => v.measurementLevel === 'scale')
  const nominalVars = variables.filter((v) => v.measurementLevel === 'nominal')
  const ordinalVars = variables.filter((v) => v.measurementLevel === 'ordinal')
  const categoricalVars = [...nominalVars, ...ordinalVars]

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
      const two = nominalVars.slice(0, 2)
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
    case 'ttest': {
      const scale = scaleVars[0]
      const groupVar = nominalVars.find((v) => {
        const vals = getDistinctValues(rows, v.name)
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
          ...(scaleVars[0] ? [{ name: scaleVars[0].name, label: scaleVars[0].label, role: 'outcome' }] : []),
          ...(nominalVars[0] ? [{ name: nominalVars[0].name, label: nominalVars[0].label, role: 'group' }] : []),
        ],
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
  const getVar = (name: string) => dataset.variables.find((v) => v.name === name)!

  switch (testId) {
    case 'freq': {
      const varName = selectedVarNames?.[0] ?? variables.find((v) => v.measurementLevel !== 'scale')?.name ?? variables[0]?.name
      if (!varName)
        return notApplicableResult('freq', 'Frequencies & percentages', 'No variable available. Add at least one variable in Variable View.')
      const counts: Record<string, number> = {}
      for (const row of rows) {
        const v = row[varName]
        const key = v === null || v === undefined || v === '' ? '(missing)' : String(v)
        counts[key] = (counts[key] ?? 0) + 1
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      const table: ResultRow[] = Object.entries(counts).map(([value, count]) => ({
        Value: value,
        Count: count,
        Percent: total ? Math.round((count / total) * 1000) / 10 : 0,
      }))
      const chart: ChartSpec = {
        type: 'bar',
        title: `Distribution of ${getVar(varName)?.label ?? varName}`,
        data: table.map((r) => ({ name: String(r.Value), value: Number(r.Count) })),
        xKey: 'name',
        yKey: 'value',
      }
      const insight =
        total > 0
          ? `Frequencies for "${getVar(varName)?.label ?? varName}": ${table.length} categories. ${table.slice(0, 3).map((r) => `${r.Value}: ${r.Count} (${r.Percent}%)`).join('; ')}${table.length > 3 ? '…' : ''}.`
          : 'No data for this variable.'
      return { testId, testName: 'Frequencies & percentages', table, chart, insight }
    }

    case 'desc': {
      const scaleVars = variables.filter((v) => v.measurementLevel === 'scale')
      const toUse = selectedVarNames?.length
        ? selectedVarNames.filter((n) => scaleVars.some((v) => v.name === n))
        : scaleVars.slice(0, 6).map((v) => v.name)
      const table: ResultRow[] = []
      for (const name of toUse) {
        const vals = getNumericValues(rows, name)
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
      const insight =
        table.length > 0
          ? `Descriptive statistics for ${table.length} variable(s). Sample sizes range from ${Math.min(...table.map((r) => Number(r.N)))} to ${Math.max(...table.map((r) => Number(r.N)))}. Use these to summarize central tendency and spread before running inferential tests.`
          : 'No scale variables to summarize.'
      return { testId, testName: 'Mean, SD, Min, Max', table, chart, insight }
    }

    case 'missing': {
      const table: ResultRow[] = variables.map((v) => {
        const missing = rows.filter((r) => r[v.name] === null || r[v.name] === undefined || r[v.name] === '').length
        const pct = n ? Math.round((missing / n) * 1000) / 10 : 0
        return { Variable: v.label, Missing: missing, Total: n, 'Missing %': pct }
      })
      const worst = table.filter((r) => Number(r['Missing %']) > 30)
      const insight =
        worst.length > 0
          ? `⚠ ${worst.length} variable(s) have more than 30% missing: ${worst.map((r) => r.Variable).join(', ')}. Consider excluding or imputing before analysis.`
          : `Missing summary: ${table.filter((r) => Number(r.Missing) > 0).length} variable(s) have at least one missing value.`
      return { testId, testName: 'Missing value summary', table, insight }
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
      const rowVals = getDistinctValues(rows, rowVar).sort((a, b) => String(a).localeCompare(String(b)))
      const colVals = getDistinctValues(rows, colVar).sort((a, b) => String(a).localeCompare(String(b)))
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
      const sig = df >= 1 && chiSq > 3.84
      const insight = `Chi-Square = ${chiSq.toFixed(2)}, df = ${df}. ${sig ? 'The association is statistically significant (p < 0.05).' : 'The association is not statistically significant at α = 0.05.'}`
      return {
        testId,
        testName: 'Crosstabulation + Chi-Square',
        table,
        chart,
        insight,
        keyStat: `χ² = ${chiSq.toFixed(2)}, df = ${df}`,
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
      const strength = Math.abs(r) < 0.3 ? 'weak' : Math.abs(r) < 0.6 ? 'moderate' : 'strong'
      const dir = r > 0 ? 'positive' : 'negative'
      const insight = `Correlation is ${strength} and ${dir} (r = ${r.toFixed(3)}, p ${p < 0.05 ? '<' : '≥'} 0.05). ${p < 0.05 ? 'The relationship is statistically significant.' : 'The relationship is not statistically significant at α = 0.05.'}`
      return {
        testId,
        testName: 'Pearson correlation',
        table,
        chart,
        insight,
        keyStat: `r = ${r.toFixed(3)}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
      }
    }

    case 'ttest': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name
      const groupName = selectedVarNames?.[1] ?? nominalVars.find((v: { name: string }) => getDistinctValues(rows, v.name).length === 2)?.name
      if (!outcomeName || !groupName)
        return notApplicableResult(
          'ttest',
          'Independent-samples t-test',
          'Need one continuous (scale) outcome and one categorical variable with exactly two groups.',
          'In Variable View: set the outcome to Scale and the grouping variable to Nominal with two categories.'
        )
      const groups = getDistinctValues(rows, groupName)
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
      const table: ResultRow[] = [
        { Group: String(g1), N: sample1.length, Mean: Math.round(m1 * 1000) / 1000, SD: Math.round(standardDeviation(sample1) * 1000) / 1000 },
        { Group: String(g2), N: sample2.length, Mean: Math.round(m2 * 1000) / 1000, SD: Math.round(standardDeviation(sample2) * 1000) / 1000 },
        { Statistic: 't', Value: Math.round(t * 1000) / 1000 },
        { Statistic: 'df', Value: df },
        { Statistic: 'p-value (approx)', Value: p < 0.001 ? '< 0.001' : Math.round(p * 1000) / 1000 },
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
      const insight = `Mean ${getVar(outcomeName)?.label ?? outcomeName} is ${m1.toFixed(2)} (${g1}) vs ${m2.toFixed(2)} (${g2}). ${p < 0.05 ? 'The difference is statistically significant (p < 0.05).' : 'The difference is not statistically significant (p ≥ 0.05).'}`
      return {
        testId,
        testName: 'Independent Samples T-Test',
        table,
        chart,
        insight,
        keyStat: `t = ${t.toFixed(2)}, p ${p < 0.05 ? '< 0.05' : '≥ 0.05'}`,
      }
    }

    default:
      return {
        testId,
        testName: testId,
        table: [{ Note: 'This test is not yet implemented.' }],
        insight: 'Implementation coming soon. Try Frequencies, Descriptive statistics, Missing summary, Crosstab, Correlation, or T-Test.',
      }
  }
}
