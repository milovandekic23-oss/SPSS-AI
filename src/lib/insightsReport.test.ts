import { describe, it, expect } from 'vitest'
import { runInsightsReport, isKeyFinding, getHeadline } from './insightsReport'
import type { TestResult } from './statsRunner'
import type { DatasetState } from '../types'

function makeDataset(overrides: Partial<DatasetState> = {}): DatasetState {
  return {
    variables: [
      { name: 'q1', label: 'Q1', measurementLevel: 'nominal', variableType: 'string', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
      { name: 'score', label: 'Score', measurementLevel: 'scale', variableType: 'integer', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
    ],
    rows: [
      { q1: 'A', score: 10 },
      { q1: 'B', score: 20 },
      { q1: 'A', score: 15 },
    ],
    variableViewConfirmed: true,
    questionGroups: [],
    ...overrides,
  }
}

describe('insightsReport', () => {
  it('isKeyFinding: Tier 1 (freq, desc, missing) are always key', () => {
    expect(isKeyFinding({ testId: 'freq', testName: 'Freq', table: [], insight: 'Some text.' } as TestResult)).toBe(true)
    expect(isKeyFinding({ testId: 'desc', testName: 'Desc', table: [], insight: 'Mean = 5.' } as TestResult)).toBe(true)
    expect(isKeyFinding({ testId: 'missing', testName: 'Missing', table: [], insight: 'No missing.' } as TestResult)).toBe(true)
  })

  it('isKeyFinding: statistically significant result is key', () => {
    expect(isKeyFinding({ testId: 'ttest', testName: 't-test', table: [], insight: 'The difference is statistically significant (p < 0.05).' } as TestResult)).toBe(true)
    expect(isKeyFinding({ testId: 'corr', testName: 'Corr', table: [], insight: 'The relationship is statistically significant.' } as TestResult)).toBe(true)
  })

  it('isKeyFinding: not significant result is not key', () => {
    expect(isKeyFinding({ testId: 'ttest', testName: 't-test', table: [], insight: 'The difference is not statistically significant at α = 0.05.' } as TestResult)).toBe(false)
    expect(isKeyFinding({ testId: 'corr', testName: 'Corr', table: [], insight: 'The relationship is not statistically significant at α = 0.05.' } as TestResult)).toBe(false)
  })

  it('getHeadline: uses keyStat when present', () => {
    expect(getHeadline({ testId: 'ttest', testName: 't-test', table: [], insight: 'Full text.', keyStat: 't = 2.1, p < 0.05' } as TestResult)).toBe('t-test: t = 2.1, p < 0.05')
  })

  it('getHeadline: uses first sentence of insight when no keyStat', () => {
    expect(getHeadline({ testId: 'freq', testName: 'Freq', table: [], insight: 'Frequencies for Q1: 2 categories. A: 2 (66.7%); B: 1 (33.3%).' } as TestResult)).toBe('Frequencies for Q1: 2 categories.')
  })

  it('runInsightsReport returns findings from computed results only', () => {
    const dataset = makeDataset()
    const report = runInsightsReport(dataset)
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.keyHeadlines.length).toBeGreaterThanOrEqual(0)
    report.findings.forEach((f) => {
      expect(f.result).toBeDefined()
      expect(typeof f.result.insight).toBe('string')
      expect(f.result.insight.length).toBeGreaterThan(0)
      expect(f.validation).toBeDefined()
      expect(Array.isArray(f.validation.issues)).toBe(true)
    })
  })
})
