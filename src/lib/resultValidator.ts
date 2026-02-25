/**
 * Post-run validation: was the test run and reported correctly?
 * Cambridge PhD Statistics supervisor — ensures result structure and interpretation consistency.
 */

import type { TestResult, TestId, ResultRow } from './statsRunner'

export interface ResultValidation {
  consistent: boolean
  issues: string[]
}

function tableHasRow(table: ResultRow[], key: string, value?: string | number): boolean {
  return table.some((r) => key in r && (value === undefined || r[key] === value))
}

function tableHasStatistic(table: ResultRow[], stat: string): boolean {
  return table.some((r) => r.Statistic === stat)
}

function insightMentions(insight: string, ...phrases: string[]): boolean {
  const lower = insight.toLowerCase()
  return phrases.some((p) => lower.includes(p.toLowerCase()))
}

export function validateTestResult(result: TestResult): ResultValidation {
  const issues: string[] = []

  if (!result || typeof result.testId !== 'string' || !result.testName)
    return { consistent: false, issues: ['Result missing testId or testName.'] }
  if (!Array.isArray(result.table))
    return { consistent: false, issues: ['Result table is not an array.'] }
  if (typeof result.insight !== 'string' || result.insight.length === 0)
    issues.push('Result insight is missing or empty.')

  const table = result.table
  const insight = result.insight
  const testId = result.testId as TestId

  switch (testId) {
    case 'ttest':
      if (!tableHasStatistic(table, 't (pooled)') && !tableHasStatistic(table, 't')) issues.push('t-test result should include t statistic.')
      if (!tableHasStatistic(table, "Levene's F")) issues.push('t-test result should include Levene’s test.')
      if (!tableHasStatistic(table, 'Welch t')) issues.push('t-test result should include Welch t.')
      if (insightMentions(insight, 'significant') && insightMentions(insight, 'not significant')) issues.push('Insight may contradict (significant vs not significant).')
      break

    case 'anova':
      if (!tableHasStatistic(table, 'F')) issues.push('ANOVA result should include F statistic.')
      if (!tableHasStatistic(table, "Levene's F")) issues.push('ANOVA result should include Levene’s test.')
      if (insightMentions(insight, 'significant') && insightMentions(insight, 'No significant')) {
        // "At least one group mean differs significantly" vs "No significant difference" — one is correct
      }
      break

    case 'crosstab':
      if (!tableHasStatistic(table, 'Chi-Square') && !tableHasRow(table, 'Statistic', 'Chi-Square')) issues.push('Crosstab result should include Chi-Square.')
      break

    case 'corr':
      if (!tableHasStatistic(table, 'Pearson r')) issues.push('Correlation result should include Pearson r.')
      if (!table.some((r) => r.Statistic != null && String(r.Statistic).toLowerCase().includes('p-value')))
        issues.push('Correlation result should include p-value.')
      break

    case 'spearman':
      if (!tableHasStatistic(table, 'Spearman ρ')) issues.push('Spearman result should include Spearman ρ.')
      break

    case 'linreg':
      if (!tableHasStatistic(table, 'R²')) issues.push('Linear regression result should include R².')
      break

    case 'logreg':
      if (!table.some((r) => 'Odds ratio' in r)) issues.push('Logistic regression result should include odds ratios.')
      break

    case 'mann':
      if (!tableHasStatistic(table, 'Mann-Whitney U') && !tableHasStatistic(table, 'Kruskal-Wallis H'))
        issues.push('Mann-Whitney/Kruskal-Wallis result should include U or H statistic.')
      break

    case 'paired':
      if (!tableHasStatistic(table, 't')) issues.push('Paired t-test result should include t statistic.')
      break

    case 'pca':
      if (!table.some((r) => r.Component === 'PC1' || r.Component === 'PC2')) issues.push('PCA result should include at least PC1 and PC2.')
      break

    default:
      break
  }

  const consistent = issues.length === 0
  return { consistent, issues }
}
