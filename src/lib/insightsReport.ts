/**
 * Insights report: run applicable tests on the dataset, validate results,
 * and build an ordered report. All insights come from computed results only (no API).
 */

import type { DatasetState } from '../types'
import { getSuggestedVariables, runTest, type TestId, type TestResult } from './statsRunner'
import { validateTestResult, type ResultValidation } from './resultValidator'

const REPORT_TEST_ORDER: TestId[] = [
  'freq',
  'desc',
  'missing',
  'crosstab',
  'corr',
  'spearman',
  'ttest',
  'anova',
  'linreg',
  'logreg',
  'mann',
  'paired',
  'pca',
]

/** Minimum variables required for a test to be worth running in the report */
function hasEnoughVariables(testId: TestId, variableCount: number): boolean {
  switch (testId) {
    case 'crosstab':
      return variableCount >= 2
    case 'corr':
    case 'spearman':
      return variableCount >= 2
    case 'ttest':
    case 'anova':
    case 'mann':
      return variableCount >= 2
    case 'linreg':
    case 'logreg':
      return variableCount >= 2
    case 'paired':
      return variableCount >= 2
    case 'pca':
      return variableCount >= 2
    default:
      return variableCount >= 1
  }
}

/** True if this result should be highlighted as a key finding (always important or statistically significant) */
export function isKeyFinding(result: TestResult): boolean {
  const tier1: TestId[] = ['freq', 'desc', 'missing']
  if (tier1.includes(result.testId)) return true
  const insight = result.insight ?? ''
  const hasSignificant = /statistically significant/i.test(insight)
  const hasNotSignificant = /not statistically significant|no significant/i.test(insight)
  return hasSignificant && !hasNotSignificant
}

/** One finding in the report: result + validation. Only includes results from runTest (no fabrication). */
export interface ReportFinding {
  result: TestResult
  validation: ResultValidation
  isKey: boolean
}

export interface InsightsReport {
  findings: ReportFinding[]
  /** Short headlines for key findings only, in order */
  keyHeadlines: string[]
}

/**
 * Run applicable tests in tier order, validate each result, and build the report.
 * All insights are derived from computed results only.
 */
export function runInsightsReport(dataset: DatasetState): InsightsReport {
  const findings: ReportFinding[] = []
  const keyHeadlines: string[] = []

  for (const testId of REPORT_TEST_ORDER) {
    const suggested = getSuggestedVariables(testId, dataset)
    if (!hasEnoughVariables(testId, suggested.variables.length)) continue

    const result = runTest(testId, dataset)
    if (!result) continue

    const validation = validateTestResult(result)
    const isKey = isKeyFinding(result)
    findings.push({ result, validation, isKey })
    if (isKey) keyHeadlines.push(getHeadline(result))
  }

  return { findings, keyHeadlines }
}

/** One-line headline for a result (for key findings list and expandable summary). */
export function getHeadline(result: TestResult): string {
  if (result.keyStat) return `${result.testName}: ${result.keyStat}`
  const firstSentence = result.insight.split(/[.!?]/)[0]?.trim()
  if (firstSentence) return firstSentence + (result.insight.includes('.') ? '.' : '')
  return result.testName
}
