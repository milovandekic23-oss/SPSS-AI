import { describe, it, expect } from 'vitest'
import { validateTestChoice } from './testChoiceValidator'
import type { DatasetState } from '../types'

function makeDataset(overrides: Partial<DatasetState> = {}): DatasetState {
  return {
    variables: [
      { name: 'age', label: 'Age', measurementLevel: 'scale', variableType: 'integer', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
      { name: 'gender', label: 'Gender', measurementLevel: 'nominal', variableType: 'string', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
      { name: 'score', label: 'Score', measurementLevel: 'scale', variableType: 'integer', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
    ],
    rows: [
      { age: 25, gender: 'M', score: 80 },
      { age: 30, gender: 'F', score: 85 },
      { age: 28, gender: 'M', score: 78 },
    ],
    variableViewConfirmed: true,
    questionGroups: [],
    ...overrides,
  }
}

describe('validateTestChoice', () => {
  it('returns valid for freq when variables exist', () => {
    const v = validateTestChoice('freq', makeDataset())
    expect(v.valid).toBe(true)
    expect(v.warnings).toEqual([])
  })

  it('returns valid for ttest when scale outcome and 2 groups with n≥2 per group', () => {
    const dataset = makeDataset({
      rows: [
        { age: 25, gender: 'M', score: 80 },
        { age: 28, gender: 'M', score: 78 },
        { age: 30, gender: 'F', score: 85 },
        { age: 35, gender: 'F', score: 90 },
      ],
    })
    const v = validateTestChoice('ttest', dataset)
    expect(v.valid).toBe(true)
  })

  it('returns invalid for anova when only 2 groups and suggests ttest', () => {
    const v = validateTestChoice('anova', makeDataset())
    expect(v.valid).toBe(false)
    expect(v.suggestedAlternative).toBe('ttest')
  })

  it('returns invalid for logreg when fewer than 10 complete cases', () => {
    const v = validateTestChoice('logreg', makeDataset())
    expect(v.valid).toBe(false)
    expect(v.warnings.some((w) => w.includes('10'))).toBe(true)
  })
})
