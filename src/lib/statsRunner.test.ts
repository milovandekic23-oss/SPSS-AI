import { describe, it, expect } from 'vitest'
import { runTest, getSuggestedVariables } from './statsRunner'
import type { DatasetState } from '../types'

function makeDataset(overrides: Partial<DatasetState> = {}): DatasetState {
  return {
    variables: [
      { name: 'id', label: 'ID', measurementLevel: 'scale', variableType: 'integer', role: 'id', valueLabels: [], missingCodes: [], missingPct: 0 },
      { name: 'age', label: 'Age', measurementLevel: 'scale', variableType: 'integer', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
      { name: 'gender', label: 'Gender', measurementLevel: 'nominal', variableType: 'string', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
      { name: 'score', label: 'Score', measurementLevel: 'scale', variableType: 'integer', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
    ],
    rows: [
      { id: 1, age: 25, gender: 'M', score: 80 },
      { id: 2, age: 30, gender: 'F', score: 85 },
      { id: 3, age: 28, gender: 'M', score: 78 },
      { id: 4, age: 35, gender: 'F', score: 90 },
      { id: 5, age: 22, gender: 'M', score: 72 },
    ],
    variableViewConfirmed: true,
    questionGroups: [],
    ...overrides,
  }
}

describe('statsRunner', () => {
  describe('runTest', () => {
    it('runs "freq" and returns table and insight', () => {
      const dataset = makeDataset()
      const result = runTest('freq', dataset)
      expect(result).not.toBeNull()
      expect(result!.testId).toBe('freq')
      expect(result!.table.length).toBeGreaterThan(0)
      expect(result!.insight).toBeTruthy()
    })

    it('runs "desc" and returns table with Mean, SD', () => {
      const dataset = makeDataset()
      const result = runTest('desc', dataset)
      expect(result).not.toBeNull()
      expect(result!.testId).toBe('desc')
      expect(result!.table.some((r) => 'Mean' in r)).toBe(true)
    })

    it('runs "missing" and returns table', () => {
      const dataset = makeDataset()
      const result = runTest('missing', dataset)
      expect(result).not.toBeNull()
      expect(result!.testName).toBe('Missing value summary')
      expect(result!.table.length).toBe(dataset.variables.length)
    })

    it('runs "corr" with scale vars and returns r and p', () => {
      const dataset = makeDataset()
      const result = runTest('corr', dataset)
      expect(result).not.toBeNull()
      expect(result!.table.some((r) => r.Statistic === 'Pearson r' || r.Statistic === 'p-value')).toBe(true)
      expect(result!.insight).toBeTruthy()
    })

    it('excludes variables with includeInAnalysis false from runTest', () => {
      const dataset = makeDataset()
      dataset.variables[1].includeInAnalysis = false
      dataset.variables[2].includeInAnalysis = false
      const suggested = getSuggestedVariables('desc', dataset)
      const scaleNames = suggested.variables.map((v) => v.name)
      expect(scaleNames).not.toContain('age')
    })
  })

  describe('getSuggestedVariables', () => {
    it('returns variables for freq', () => {
      const dataset = makeDataset()
      const suggested = getSuggestedVariables('freq', dataset)
      expect(suggested.variables.length).toBeGreaterThan(0)
      expect(suggested.description).toBeTruthy()
    })

    it('returns variables for desc', () => {
      const dataset = makeDataset()
      const suggested = getSuggestedVariables('desc', dataset)
      expect(suggested.variables.some((v) => v.name === 'age' || v.name === 'score')).toBe(true)
    })

    it('filters out excluded variables', () => {
      const dataset = makeDataset()
      dataset.variables[1].includeInAnalysis = false
      const suggested = getSuggestedVariables('desc', dataset)
      expect(suggested.variables.map((v) => v.name)).not.toContain('age')
    })
  })
})
