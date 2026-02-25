import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TestSuggester } from './TestSuggester'
import type { DatasetState } from '../types'

function makeDataset(): DatasetState {
  return {
    variables: [
      { name: 'age', label: 'Age', measurementLevel: 'scale', variableType: 'integer', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
      { name: 'gender', label: 'Gender', measurementLevel: 'nominal', variableType: 'string', role: 'none', valueLabels: [], missingCodes: [], missingPct: 0 },
    ],
    rows: [
      { age: 25, gender: 'M' },
      { age: 30, gender: 'F' },
      { age: 28, gender: 'M' },
    ],
    variableViewConfirmed: true,
    questionGroups: [],
  }
}

describe('TestSuggester', () => {
  it('renders test cards', () => {
    const dataset = makeDataset()
    render(<TestSuggester dataset={dataset} />)
    expect(screen.getByText(/Recommended Tests/)).toBeInTheDocument()
    const runButtons = screen.getAllByRole('button', { name: /Run this test/i })
    expect(runButtons.length).toBeGreaterThan(0)
  })

  it('shows result panel when Run this test is clicked', async () => {
    const dataset = makeDataset()
    const user = userEvent.setup()
    render(<TestSuggester dataset={dataset} />)
    const freqCard = screen.getByTestId('test-card-freq')
    const runButton = freqCard.querySelector('button')
    expect(runButton).toBeInTheDocument()
    await user.click(runButton!)
    const panel = document.querySelector('[data-testid="test-result-panel"]')
    expect(panel).toBeInTheDocument()
    expect(panel!.textContent).toMatch(/Frequencies for|insight|Message|Error/)
  }, 5000)

  it('Run button is not disabled when no suggested vars (always clickable)', () => {
    const dataset = {
      ...makeDataset(),
      variables: [
        { ...makeDataset().variables[0], measurementLevel: 'nominal' as const },
        { ...makeDataset().variables[1], measurementLevel: 'nominal' as const },
      ],
    }
    render(<TestSuggester dataset={dataset} />)
    const runButtons = screen.getAllByRole('button', { name: /Run this test/i })
    runButtons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(false)
    })
  })
})
