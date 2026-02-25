import { describe, it, expect } from 'vitest'
import { checkDataReadiness } from './dataReadiness'
import type { DatasetState } from '../types'

/** Dataset where optA/optB/optC have high missing % (multi-response style: "select max 2") */
function makeMultiResponseStyleDataset(questionGroups: DatasetState['questionGroups'] = []): DatasetState {
  const variables = [
    { name: 'id', label: 'ID', measurementLevel: 'scale' as const, variableType: 'integer' as const, role: 'id' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
    { name: 'optA', label: 'Option A', measurementLevel: 'nominal' as const, variableType: 'string' as const, role: 'none' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
    { name: 'optB', label: 'Option B', measurementLevel: 'nominal' as const, variableType: 'string' as const, role: 'none' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
    { name: 'optC', label: 'Option C', measurementLevel: 'nominal' as const, variableType: 'string' as const, role: 'none' as const, valueLabels: [], missingCodes: [], missingPct: 0 },
  ]
  // 10 rows: optA filled in 2 rows (80% missing), optB in 3 (70% missing), optC in 1 (90% missing)
  const rows = [
    { id: 1, optA: '1', optB: '', optC: '' },
    { id: 2, optA: '', optB: '1', optC: '' },
    { id: 3, optA: '', optB: '', optC: '1' },
    { id: 4, optA: '', optB: '1', optC: '' },
    { id: 5, optA: '1', optB: '', optC: '' },
    { id: 6, optA: '', optB: '', optC: '' },
    { id: 7, optA: '', optB: '', optC: '' },
    { id: 8, optA: '', optB: '1', optC: '' },
    { id: 9, optA: '', optB: '', optC: '' },
    { id: 10, optA: '', optB: '', optC: '' },
  ]
  return {
    variables,
    rows,
    variableViewConfirmed: true,
    questionGroups,
  }
}

describe('dataReadiness', () => {
  describe('missing % and question groups (checkbox / multi_select)', () => {
    it('flags high missing % when columns are NOT in a question group', () => {
      const dataset = makeMultiResponseStyleDataset([])
      const result = checkDataReadiness(dataset)

      const missingItems = result.items.filter((i) => i.category === 'missing' && i.id.startsWith('missing-'))
      expect(missingItems.length).toBe(3)
      const vars = missingItems.map((i) => i.variable).sort()
      expect(vars).toEqual(['optA', 'optB', 'optC'])
    })

    it('does NOT flag missing % for columns in a checkbox question group', () => {
      const dataset = makeMultiResponseStyleDataset([
        { id: 'q1', label: 'Reasons (select max 2)', type: 'checkbox', variableNames: ['optA', 'optB', 'optC'] },
      ])
      const result = checkDataReadiness(dataset)

      const missingPerVar = result.items.filter((i) => i.category === 'missing' && i.id.startsWith('missing-'))
      expect(missingPerVar.length).toBe(0)

      const multiResponseInfo = result.items.find((i) => i.id === 'multi-response-info')
      expect(multiResponseInfo).toBeDefined()
      expect(multiResponseInfo?.severity).toBe('info')
    })

    it('does NOT flag missing % for columns in a multi_select question group', () => {
      const dataset = makeMultiResponseStyleDataset([
        { id: 'q1', label: 'Reasons (select max 2)', type: 'multi_select', variableNames: ['optA', 'optB', 'optC'] },
      ])
      const result = checkDataReadiness(dataset)

      const missingPerVar = result.items.filter((i) => i.category === 'missing' && i.id.startsWith('missing-'))
      expect(missingPerVar.length).toBe(0)

      const multiResponseInfo = result.items.find((i) => i.id === 'multi-response-info')
      expect(multiResponseInfo).toBeDefined()
    })

    it('does NOT flag missing % for columns in a matrix question group', () => {
      const dataset = makeMultiResponseStyleDataset([
        { id: 'q1', label: 'Grid question', type: 'matrix', variableNames: ['optA', 'optB', 'optC'] },
      ])
      const result = checkDataReadiness(dataset)

      const missingPerVar = result.items.filter((i) => i.category === 'missing' && i.id.startsWith('missing-'))
      expect(missingPerVar.length).toBe(0)
    })

    it('still flags missing % for columns NOT in any multi-response group', () => {
      const dataset = makeMultiResponseStyleDataset([
        { id: 'q1', label: 'Reasons', type: 'checkbox', variableNames: ['optA', 'optB'] },
      ])
      const result = checkDataReadiness(dataset)

      const missingItems = result.items.filter((i) => i.category === 'missing' && i.id.startsWith('missing-'))
      expect(missingItems.length).toBe(1)
      expect(missingItems[0].variable).toBe('optC')
    })
  })
})
