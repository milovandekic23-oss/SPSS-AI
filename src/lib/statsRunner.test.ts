import { describe, it, expect } from 'vitest'
import { runTest, getSuggestedVariables, type TestResult } from './statsRunner'
import type { DatasetState } from '../types'

const baseVariables = [
  { name: 'id', label: 'ID', measurementLevel: 'scale' as const, variableType: 'integer' as const, role: 'id' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
  { name: 'age', label: 'Age', measurementLevel: 'scale' as const, variableType: 'integer' as const, role: 'none' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
  { name: 'gender', label: 'Gender', measurementLevel: 'nominal' as const, variableType: 'string' as const, role: 'none' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
  { name: 'score', label: 'Score', measurementLevel: 'scale' as const, variableType: 'integer' as const, role: 'none' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
]
const baseRows = [
  { id: 1, age: 25, gender: 'M', score: 80 },
  { id: 2, age: 30, gender: 'F', score: 85 },
  { id: 3, age: 28, gender: 'M', score: 78 },
  { id: 4, age: 35, gender: 'F', score: 90 },
  { id: 5, age: 22, gender: 'M', score: 72 },
]

function makeDataset(overrides: Partial<DatasetState> = {}): DatasetState {
  return {
    variables: baseVariables.map((v) => ({ ...v })),
    rows: baseRows.map((r) => ({ ...r })),
    variableViewConfirmed: true,
    questionGroups: [],
    ...overrides,
  }
}

/** Fixture: dataset with 3+ groups for ANOVA */
function datasetWithThreeGroups(): DatasetState {
  return {
    ...makeDataset(),
    variables: [
      ...baseVariables.map((v) => ({ ...v })),
      { name: 'condition', label: 'Condition', measurementLevel: 'nominal' as const, variableType: 'string' as const, role: 'none' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
    ],
    rows: [
      { id: 1, age: 25, gender: 'M', score: 80, condition: 'A' },
      { id: 2, age: 30, gender: 'F', score: 85, condition: 'A' },
      { id: 3, age: 28, gender: 'M', score: 78, condition: 'B' },
      { id: 4, age: 35, gender: 'F', score: 90, condition: 'B' },
      { id: 5, age: 22, gender: 'M', score: 72, condition: 'C' },
      { id: 6, age: 26, gender: 'F', score: 88, condition: 'C' },
    ],
  }
}

/** Fixture: dataset with 12+ rows and binary outcome for logreg */
function datasetForLogreg(): DatasetState {
  const rows = baseRows.map((r) => ({ ...r }))
  while (rows.length < 12) {
    rows.push({
      id: rows.length + 1,
      age: 20 + rows.length,
      gender: rows.length % 2 === 0 ? 'M' : 'F',
      score: 70 + rows.length,
    } as (typeof rows)[0])
  }
  return { ...makeDataset(), rows }
}

/** Contract: result has required shape and table has expected content for a successful run */
function assertValidResult(result: TestResult | null, testId: string): asserts result is TestResult {
  expect(result).not.toBeNull()
  expect(result!.testId).toBe(testId)
  expect(Array.isArray(result!.table)).toBe(true)
  expect(typeof result!.insight).toBe('string')
  expect(result!.insight.length).toBeGreaterThan(0)
}

describe('statsRunner', () => {
  describe('runTest', () => {
    it('runs "freq" and returns table and insight', () => {
      const result = runTest('freq', makeDataset())
      assertValidResult(result, 'freq')
      expect(result!.table.length).toBeGreaterThan(0)
    })

    it('runs "desc" and returns table with Mean, SD', () => {
      const result = runTest('desc', makeDataset())
      assertValidResult(result, 'desc')
      expect(result!.table.some((r) => 'Mean' in r)).toBe(true)
    })

    it('runs "missing" and returns table', () => {
      const dataset = makeDataset()
      const result = runTest('missing', dataset)
      assertValidResult(result, 'missing')
      expect(result!.testName).toBe('Missing value summary')
      expect(result!.table.length).toBe(dataset.variables.length)
    })

    it('runs "corr" with scale vars and returns r and p', () => {
      const result = runTest('corr', makeDataset())
      assertValidResult(result, 'corr')
      expect(result!.table.some((r) => r.Statistic === 'Pearson r' || r.Statistic === 'p-value (approx)')).toBe(true)
    })

    it('runs "anova" with scale outcome and 3+ groups and returns F and p', () => {
      const result = runTest('anova', datasetWithThreeGroups())
      assertValidResult(result, 'anova')
      expect(result!.table.some((r) => r.Statistic === 'F')).toBe(true)
    })

    it('runs "linreg" with scale outcome and predictors and returns R² and coefficients', () => {
      const result = runTest('linreg', makeDataset())
      assertValidResult(result, 'linreg')
      expect(result!.table.some((r) => r.Statistic === 'R²')).toBe(true)
    })

    it('runs "logreg" with binary outcome and returns odds ratios', () => {
      const result = runTest('logreg', datasetForLogreg())
      assertValidResult(result, 'logreg')
      expect(result!.table.some((r) => 'Odds ratio' in r)).toBe(true)
    })

    it('runs "mann" with scale outcome and 2 groups and returns Mann-Whitney U', () => {
      const result = runTest('mann', makeDataset())
      assertValidResult(result, 'mann')
      expect(result!.table.some((r) => r.Statistic === 'Mann-Whitney U' || r.Statistic === 'Kruskal-Wallis H')).toBe(true)
    })

    it('runs "paired" with two scale variables and returns paired t-test', () => {
      const result = runTest('paired', makeDataset())
      assertValidResult(result, 'paired')
      expect(result!.table.some((r) => r.Statistic === 't')).toBe(true)
    })

    it('runs "pca" with scale variables and returns eigenvalues and variance', () => {
      const result = runTest('pca', makeDataset())
      assertValidResult(result, 'pca')
      expect(result!.table.some((r) => r.Component === 'PC1' || r.Component === 'PC2')).toBe(true)
    })

    it('excludes variables with includeInAnalysis false from runTest', () => {
      const dataset = makeDataset()
      const vars = dataset.variables
      vars[1] = { ...vars[1], includeInAnalysis: false }
      vars[2] = { ...vars[2], includeInAnalysis: false }
      const suggested = getSuggestedVariables('desc', { ...dataset, variables: [...vars] })
      expect(suggested.variables.map((v) => v.name)).not.toContain('age')
    })
  })

  describe('getSuggestedVariables', () => {
    it('returns variables for freq', () => {
      const suggested = getSuggestedVariables('freq', makeDataset())
      expect(suggested.variables.length).toBeGreaterThan(0)
      expect(suggested.description).toBeTruthy()
    })

    it('returns variables for desc', () => {
      const suggested = getSuggestedVariables('desc', makeDataset())
      expect(suggested.variables.some((v) => v.name === 'age' || v.name === 'score')).toBe(true)
    })

    it('filters out excluded variables', () => {
      const dataset = makeDataset()
      const vars = dataset.variables.map((v, i) => (i === 1 ? { ...v, includeInAnalysis: false } : v))
      const suggested = getSuggestedVariables('desc', { ...dataset, variables: vars })
      expect(suggested.variables.map((v) => v.name)).not.toContain('age')
    })
  })
})
