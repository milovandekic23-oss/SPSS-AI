import { describe, it, expect } from 'vitest'
import { validateTestResult } from './resultValidator'
import type { TestResult } from './statsRunner'

describe('validateTestResult', () => {
  it('returns consistent for valid t-test result with Levene and Welch', () => {
    const result: TestResult = {
      testId: 'ttest',
      testName: 'Independent Samples T-Test',
      table: [
        { Group: 'M', N: 2, Mean: 26.5, SD: 2.5, Skewness: 0 },
        { Group: 'F', N: 1, Mean: 30, SD: '—', Skewness: '—' },
        { Statistic: 't (pooled)', Value: -1.2 },
        { Statistic: "Levene's F", Value: 0.5 },
        { Statistic: 'Welch t', Value: -1.1 },
      ],
      insight: 'Mean score is 26.5 (M) vs 30 (F). The difference is not statistically significant.',
    }
    const v = validateTestResult(result)
    expect(v.consistent).toBe(true)
    expect(v.issues).toEqual([])
  })

  it('returns consistent for valid corr result', () => {
    const result: TestResult = {
      testId: 'corr',
      testName: 'Pearson correlation',
      table: [
        { Statistic: 'Pearson r', Value: 0.8 },
        { Statistic: 'p-value (approx)', Value: 0.05 },
        { Statistic: 'N (pairs)', Value: 5 },
      ],
      insight: 'Correlation is strong and positive.',
    }
    const v = validateTestResult(result)
    expect(v.consistent).toBe(true)
  })

  it('returns issues when required statistic is missing', () => {
    const result: TestResult = {
      testId: 'ttest',
      testName: 'T-Test',
      table: [{ Group: 'A', N: 5 }],
      insight: 'Some result',
    }
    const v = validateTestResult(result)
    expect(v.consistent).toBe(false)
    expect(v.issues.length).toBeGreaterThan(0)
  })
})
