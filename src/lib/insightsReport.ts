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
  'goodness',
  'onesamplet',
  'pointbiserial',
  'linreg',
  'logreg',
  'mann',
  'paired',
  'pca',
]

const TIER1_IDS: TestId[] = ['freq', 'desc', 'missing']
const BIVARIATE_IDS: TestId[] = ['crosstab', 'corr', 'spearman', 'ttest', 'anova', 'goodness', 'onesamplet', 'pointbiserial']

/** Minimum variables required for a test to be worth running in the report */
function hasEnoughVariables(testId: TestId, variableCount: number): boolean {
  switch (testId) {
    case 'crosstab':
      return variableCount >= 2
    case 'corr':
    case 'spearman':
    case 'pointbiserial':
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
    case 'goodness':
    case 'onesamplet':
      return variableCount >= 1
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

/** One finding in the report: result + validation + engine output. */
export interface ReportFinding {
  result: TestResult
  validation: ResultValidation
  isKey: boolean
  interestScore: number
  /** Short human-centered takeaway for the main view (no raw statistics). */
  mainTakeaway: string
  /** Fuller narrative; move stats-heavy text to Details/Appendix in UI. */
  narrative: string
  followUp: string | null
  warnings: string[]
}

/** Thematic section for grouping findings in the report. */
export interface ReportSection {
  sectionTitle: string
  findings: ReportFinding[]
}

export interface ContradictionWarning {
  message: string
  involvedTests: TestId[]
}

export interface DataQualitySummary {
  totalVariables: number
  totalRows: number
  highMissingnessVars: string[]
  lowVarianceVars: string[]
  smallSampleWarning: boolean
  overallRating: 'good' | 'caution' | 'poor'
}

export interface InsightsReport {
  findings: ReportFinding[]
  keyHeadlines: string[]
  /** 2–4 sentences in plain language for the top of the report. */
  executiveSummary: string
  contradictions: ContradictionWarning[]
  dataQuality: DataQualitySummary
  generatedAt: string
}

// ─────────────────────────────────────────────
// INTEREST SCORING
// ─────────────────────────────────────────────

function computeInterestScore(result: TestResult): number {
  let score = 0
  const insight = result.insight ?? ''
  const isSignificant =
    /statistically significant/i.test(insight) &&
    !/not statistically significant|no significant/i.test(insight)
  if (isSignificant) score += 3
  const es = result.effectSize ?? null
  const esLabel = result.effectSizeLabel ?? ''
  if (es !== null) {
    if (esLabel === "Cohen's d") {
      if (Math.abs(es) >= 0.8) score += 5
      else if (Math.abs(es) >= 0.5) score += 3
      else if (Math.abs(es) >= 0.2) score += 1
      else score -= 1
    } else if (esLabel === 'r' || esLabel === 'ρ') {
      if (Math.abs(es) >= 0.5) score += 5
      else if (Math.abs(es) >= 0.3) score += 3
      else if (Math.abs(es) >= 0.1) score += 1
      else score -= 1
    } else if (esLabel === 'R²') {
      if (es >= 0.5) score += 5
      else if (es >= 0.25) score += 3
      else if (es >= 0.1) score += 1
      else score -= 1
    } else if (esLabel === "Cramér's V") {
      if (es >= 0.3) score += 5
      else if (es >= 0.1) score += 2
      else score -= 1
    } else if (esLabel === 'η²') {
      if (es >= 0.14) score += 5
      else if (es >= 0.06) score += 3
      else if (es >= 0.01) score += 1
      else score -= 1
    }
  }
  if (TIER1_IDS.includes(result.testId)) score += 2
  if (/30% missing|high missingness/i.test(insight)) score -= 3
  if (/5% missing|some missing/i.test(insight)) score -= 1
  if (!isSignificant && es === null && !TIER1_IDS.includes(result.testId)) score -= 2
  return score
}

// ─────────────────────────────────────────────
// EFFECT SIZE DESCRIPTION
// ─────────────────────────────────────────────

function describeEffectSize(es: number | null, label: string): string {
  if (es === null) return ''
  const magnitude = (() => {
    if (label === "Cohen's d") {
      if (Math.abs(es) >= 0.8) return 'large'
      if (Math.abs(es) >= 0.5) return 'moderate'
      if (Math.abs(es) >= 0.2) return 'small'
      return 'negligible'
    }
    if (label === 'r' || label === 'ρ') {
      if (Math.abs(es) >= 0.5) return 'strong'
      if (Math.abs(es) >= 0.3) return 'moderate'
      if (Math.abs(es) >= 0.1) return 'weak'
      return 'negligible'
    }
    if (label === 'R²') {
      if (es >= 0.5) return 'strong'
      if (es >= 0.25) return 'moderate'
      if (es >= 0.1) return 'weak'
      return 'negligible'
    }
    if (label === "Cramér's V") {
      if (es >= 0.3) return 'strong'
      if (es >= 0.1) return 'moderate'
      return 'weak'
    }
    if (label === 'η²') {
      if (es >= 0.14) return 'large'
      if (es >= 0.06) return 'moderate'
      if (es >= 0.01) return 'small'
      return 'negligible'
    }
    return ''
  })()
  if (!magnitude) return ''
  return `${magnitude} (${label} = ${es.toFixed(3)})`
}

// ─────────────────────────────────────────────
// THEMATIC GROUPING
// ─────────────────────────────────────────────

function getTheme(testId: TestId): string {
  switch (testId) {
    case 'freq':
    case 'desc':
    case 'missing':
      return 'Descriptive'
    case 'crosstab':
    case 'corr':
    case 'spearman':
    case 'pointbiserial':
      return 'Associations'
    case 'ttest':
    case 'anova':
    case 'mann':
    case 'paired':
    case 'onesamplet':
      return 'Group differences'
    case 'linreg':
    case 'logreg':
      return 'Predictive'
    default:
      return 'Other'
  }
}

/** One short human-centered sentence for the main view (no p-values or raw numbers). */
function generateMainTakeaway(result: TestResult): string {
  const { testId, insight, plainLanguage } = result
  if (plainLanguage) {
    const text = plainLanguage.replace(/^In practice:\s*/i, '').trim()
    if (text.length < 120) return text
    return text.slice(0, 117) + '…'
  }
  const isSig =
    /statistically significant/i.test(insight ?? '') &&
    !/not statistically significant|no significant/i.test(insight ?? '')
  switch (testId) {
    case 'freq': {
      const first = (insight ?? '').split('.')[0]?.trim()
      return first ? `${first}. See details for full breakdown.` : 'Distribution of responses — see table for counts.'
    }
    case 'desc':
      return 'Summary of means and spread for numeric variables. Compare groups in the Associations section.'
    case 'missing':
      return 'Overview of missing data. Variables with high missingness are flagged for caution.'
    case 'corr':
    case 'spearman': {
      if (isSig) return /negative/i.test(insight ?? '') ? 'There is a negative relationship between the two variables.' : 'There is a positive relationship between the two variables.'
      return 'No clear linear relationship between the two variables.'
    }
    case 'ttest':
      return isSig ? 'The two groups differ on this outcome.' : 'The two groups are similar on this outcome.'
    case 'anova':
      return isSig ? 'At least one group differs from the others.' : 'Group means are not significantly different.'
    case 'crosstab':
      return isSig ? 'The two variables are associated — see the table for the pattern.' : 'No clear association between the two variables.'
    case 'goodness':
    case 'onesamplet':
      return (insight ?? '').split('.')[0] ?? result.testName
    case 'pointbiserial':
      return isSig ? 'The binary and numeric variables are related.' : 'No clear association between the binary and numeric variable.'
    case 'linreg':
      return isSig ? 'The model helps explain the outcome; see details for strength and predictors.' : 'The regression model does not significantly explain the outcome.'
    case 'logreg':
      return (insight ?? '').split('.')[0] ?? 'Logistic regression result — see details for odds ratios.'
    case 'mann':
      return isSig ? 'Groups differ when we look at ranks (non-parametric).' : 'No significant difference between groups (non-parametric).'
    case 'paired':
      return isSig ? 'Scores changed significantly between the two measurements.' : 'No significant average change between measurements.'
    case 'pca':
      return 'Variance is spread across components; see details for how many to retain.'
    default:
      return (insight ?? '').split('.')[0] ?? result.testName
  }
}

// ─────────────────────────────────────────────
// NARRATIVE GENERATOR
// ─────────────────────────────────────────────

function generateNarrative(result: TestResult): string {
  const { testId, insight, effectSize, effectSizeLabel } = result
  const isSignificant =
    /statistically significant/i.test(insight) &&
    !/not statistically significant|no significant/i.test(insight)
  const effectDesc = describeEffectSize(effectSize ?? null, effectSizeLabel ?? '')

  switch (testId) {
    case 'freq': {
      const first = insight.split('.')[0] ?? insight
      return `${first}. Check for categories with very low counts before running chi-square or regression.`
    }
    case 'desc':
      return `${insight} Compare these means across groups using t-tests or ANOVA.`
    case 'missing': {
      if (/30% missing/i.test(insight))
        return `${insight} Variables with >30% missing can bias analysis. Consider excluding or imputation.`
      return `${insight} Report the effective N per test when using listwise deletion.`
    }
    case 'corr':
    case 'spearman': {
      const testLabel = testId === 'corr' ? 'Pearson r' : 'Spearman ρ'
      if (isSignificant) {
        const dir = /negative/i.test(insight) ? 'negatively' : 'positively'
        return `The two variables are ${dir} and ${effectDesc} correlated (${testLabel}). ${
          effectSize != null && Math.abs(effectSize) > 0.5
            ? 'Strong relationship — consider regression to understand causality.'
            : 'Consider regression to see whether one predicts the other.'
        }`
      }
      return `No significant linear association (${testLabel}). Check the scatter plot for non-linear patterns.`
    }
    case 'ttest': {
      if (isSignificant) {
        return `The groups differ ${effectDesc} (Cohen's d). ${
          effectSize != null && Math.abs(effectSize) >= 0.8
            ? 'Large effect — practically meaningful.'
            : effectSize != null && Math.abs(effectSize) >= 0.5
              ? 'Moderate effect — report both p and Cohen\'s d.'
              : 'Effect size is small; report both p and d.'
        } Prefer Welch t if Levene p < 0.05.`
      }
      return `No significant difference between groups (t-test). ${
        effectSize != null && Math.abs(effectSize) > 0.2
          ? 'Small trend — consider statistical power.'
          : 'Groups are similar on this outcome.'
      }`
    }
    case 'anova': {
      if (isSignificant) {
        return `At least one group mean differs significantly (ANOVA). ${effectDesc} effect (η²). Use Tukey HSD rows to identify which pairs differ.`
      }
      return `No significant difference between group means (ANOVA). ${
        effectSize != null && effectSize > 0.06 ? 'Eta-squared suggests a trend — check power.' : 'Effect size is small.'
      }`
    }
    case 'crosstab': {
      if (isSignificant) {
        return `The two variables are associated (chi-square significant). ${effectDesc} (Cramér's V). ${
          effectSize != null && effectSize >= 0.3
            ? 'Strong association — examine crosstab percentages.'
            : 'Check crosstab percentages to describe the pattern.'
        } If any expected count < 5, consider Fisher's exact or collapsing categories.`
      }
      return `No significant association (chi-square). ${
        effectSize != null && effectSize > 0.1 ? 'Small trend in Cramér\'s V.' : 'Variables appear independent.'
      }`
    }
    case 'goodness':
      return insight
    case 'onesamplet':
      return insight
    case 'pointbiserial': {
      if (isSignificant) {
        return `Binary and scale variables are ${effectDesc} associated (point-biserial r). Same interpretation as a t-test with 0/1 coding.`
      }
      return `No significant association between the binary and scale variable (point-biserial r).`
    }
    case 'linreg': {
      if (isSignificant) {
        const pct = effectSize != null ? Math.round(effectSize * 100) : null
        return `The regression model is significant. ${
          pct != null ? `Predictors explain ${pct}% of variance (R² = ${effectSize?.toFixed(3)}).` : ''
        } ${
          effectSize != null && effectSize >= 0.5 ? 'Strong explanatory power.' : 'Check whether important predictors are missing.'
        } Check the coefficient table for individual significance.`
      }
      return `The overall regression is not significant. Check individual predictor p-values.`
    }
    case 'logreg':
      return `${insight} Focus on odds ratios and p < 0.05. Ensure ≥10 events per predictor for stable estimates.`
    case 'mann': {
      if (isSignificant) return `Groups differ significantly (non-parametric). Report medians alongside the test statistic.`
      return `No significant difference in distribution (non-parametric). Check sample size for power.`
    }
    case 'paired': {
      if (isSignificant) return `Significant change between measurements (paired t-test). Report mean difference and 95% CI.`
      return `No significant average change (paired t-test). Consider timing or sample size.`
    }
    case 'pca': {
      const cum = insight.match(/First (\d+) component/)?.[1]
      return cum
        ? `The first ${cum} component(s) capture most variance. Use eigenvalue > 1 or scree plot to retain components.`
        : 'Variance spread across components. Use loadings to interpret each component.'
    }
    default:
      return insight
  }
}

// ─────────────────────────────────────────────
// FOLLOW-UP SUGGESTIONS
// ─────────────────────────────────────────────

function generateFollowUp(result: TestResult): string | null {
  const { testId, insight } = result
  const isSignificant =
    /statistically significant/i.test(insight) &&
    !/not statistically significant|no significant/i.test(insight)
  switch (testId) {
    case 'freq':
      return 'Run Crosstabulation to test whether category distributions differ across groups.'
    case 'desc':
      return 'Run a t-test or ANOVA to compare these means between groups.'
    case 'missing':
      return insight.includes('30% missing') ? 'Consider excluding high-missingness variables or imputation.' : null
    case 'corr':
    case 'spearman':
      return isSignificant ? 'Run Linear Regression to quantify how well one variable predicts the other.' : 'Try a scatter plot to check for non-linear patterns.'
    case 'ttest':
      return isSignificant ? 'Run Linear Regression to control for covariates and see if the group difference holds.' : 'Run Mann-Whitney U if normality is in doubt.'
    case 'anova':
      return isSignificant ? 'Check Tukey HSD rows in the table to identify which group pairs differ.' : 'Run Kruskal-Wallis if normality is violated.'
    case 'crosstab':
      return isSignificant ? 'Examine row/column percentages to describe the direction of the association.' : null
    case 'goodness':
      return 'For two categorical variables use Crosstabulation and Chi-Square test of independence.'
    case 'onesamplet':
      return 'Compare to a known value or run independent-samples t-test if you have two groups.'
    case 'pointbiserial':
      return isSignificant ? 'Run Independent-samples t-test for group means and Cohen\'s d.' : null
    case 'linreg':
      return isSignificant ? 'Check residual plots for non-linearity or heteroscedasticity.' : 'Try adding/removing predictors or transforming variables.'
    case 'logreg':
      return 'Report Nagelkerke R² and classification table to assess model fit.'
    case 'mann':
      return isSignificant ? 'Report medians and IQRs per group.' : null
    case 'paired':
      return isSignificant ? 'Compute 95% CI for the mean difference.' : null
    case 'pca':
      return 'Examine component loadings to label each component.'
    default:
      return result.nextStep?.replace(/^Next step:\s*/i, '') ?? null
  }
}

// ─────────────────────────────────────────────
// CONTRADICTION DETECTION
// ─────────────────────────────────────────────

function detectContradictions(findings: ReportFinding[]): ContradictionWarning[] {
  const warnings: ContradictionWarning[] = []
  const resultMap = new Map<TestId, TestResult>()
  for (const f of findings) resultMap.set(f.result.testId, f.result)

  const corrResult = resultMap.get('corr')
  const ttestResult = resultMap.get('ttest')
  const spearmanResult = resultMap.get('spearman')
  if (corrResult && ttestResult) {
    const corrSig = /statistically significant/i.test(corrResult.insight) && !/not statistically significant/i.test(corrResult.insight)
    const ttestNotSig = /not statistically significant|no significant/i.test(ttestResult.insight)
    if (corrSig && ttestNotSig) {
      warnings.push({
        message: 'Pearson correlation is significant but the t-test is not. The continuous relationship may be stronger than the binary group split suggests. Check sample sizes per group.',
        involvedTests: ['corr', 'ttest'],
      })
    }
  }
  if (corrResult && spearmanResult) {
    const corrSig = /statistically significant/i.test(corrResult.insight) && !/not statistically significant/i.test(corrResult.insight)
    const spearNotSig = /not statistically significant|no significant/i.test(spearmanResult.insight)
    if (corrSig && spearNotSig) {
      warnings.push({
        message: 'Pearson is significant but Spearman is not. Pearson may be driven by outliers or non-monotonic relationship. Check the scatter plot.',
        involvedTests: ['corr', 'spearman'],
      })
    }
  }
  const mannResult = resultMap.get('mann')
  if (ttestResult && mannResult) {
    const ttestSig = /statistically significant/i.test(ttestResult.insight) && !/not statistically significant/i.test(ttestResult.insight)
    const mannNotSig = /not statistically significant|no significant/i.test(mannResult.insight)
    const mannSig = /statistically significant/i.test(mannResult.insight) && !/not statistically significant/i.test(mannResult.insight)
    const ttestNotSig = /not statistically significant|no significant/i.test(ttestResult.insight)
    if (ttestSig && mannNotSig) {
      warnings.push({
        message: 't-test is significant but Mann-Whitney is not. The t-test may be sensitive to non-normality or outliers. Prefer Mann-Whitney if normality is in doubt.',
        involvedTests: ['ttest', 'mann'],
      })
    }
    if (mannSig && ttestNotSig) {
      warnings.push({
        message: 'Mann-Whitney is significant but t-test is not. Non-parametric test detected a rank-based difference. Check group sizes and distributions.',
        involvedTests: ['ttest', 'mann'],
      })
    }
  }
  const linregResult = resultMap.get('linreg')
  if (linregResult && corrResult) {
    const linregSig = /model is significant|significant|at least one predictor/i.test(linregResult.insight)
    const corrNotSig = /not statistically significant/i.test(corrResult.insight)
    if (linregSig && corrNotSig && (linregResult.effectSize ?? 0) > 0.3) {
      warnings.push({
        message: 'Regression is significant with moderate/high R² but bivariate correlation is not. Predictors may explain outcome jointly. Examine individual coefficients.',
        involvedTests: ['linreg', 'corr'],
      })
    }
  }
  return warnings
}

// ─────────────────────────────────────────────
// DATA QUALITY SUMMARY
// ─────────────────────────────────────────────

function buildDataQualitySummary(dataset: DatasetState): DataQualitySummary {
  const { variables, rows } = dataset
  const n = rows.length
  const highMissingnessVars = variables.filter((v) => v.missingPct > 20).map((v) => v.label)
  const lowVarianceVars = variables
    .filter((v) => {
      if (v.measurementLevel === 'scale') return false
      const counts: Record<string, number> = {}
      let total = 0
      for (const row of rows) {
        const val = row[v.name]
        if (val == null || val === '') continue
        const k = String(val)
        counts[k] = (counts[k] ?? 0) + 1
        total++
      }
      if (total === 0) return false
      const maxShare = Math.max(...Object.values(counts)) / total
      return maxShare > 0.9
    })
    .map((v) => v.label)
  const smallSampleWarning = n < 30
  let overallRating: DataQualitySummary['overallRating'] = 'good'
  if (highMissingnessVars.length > 0 || smallSampleWarning) overallRating = 'caution'
  if (highMissingnessVars.length > variables.length / 3 || n < 10) overallRating = 'poor'
  return {
    totalVariables: variables.length,
    totalRows: n,
    highMissingnessVars,
    lowVarianceVars,
    smallSampleWarning,
    overallRating,
  }
}

// ─────────────────────────────────────────────
// MAIN REPORT RUNNER
// ─────────────────────────────────────────────

/**
 * Run applicable tests in tier order, validate each result, and build the report.
 * All insights are derived from computed results only.
 */
export function runInsightsReport(dataset: DatasetState): InsightsReport {
  const rawFindings: ReportFinding[] = []
  const includedVars = dataset.variables.filter((v) => v.includeInAnalysis !== false)
  const categoricalVars = includedVars.filter((v) => v.measurementLevel === 'nominal' || v.measurementLevel === 'ordinal')

  for (const testId of REPORT_TEST_ORDER) {
    if (testId === 'freq') {
      // Run frequencies for every categorical (nominal/ordinal) variable — one finding per question
      for (const v of categoricalVars) {
        const result = runTest('freq', dataset, [v.name])
        if (!result) continue
        const validation = validateTestResult(result)
        const isKey = isKeyFinding(result)
        const interestScore = computeInterestScore(result)
        const narrative = generateNarrative(result)
        const followUp = generateFollowUp(result)
        const mainTakeaway = generateMainTakeaway(result)
        const warnings: string[] = []
        if (!validation.consistent) warnings.push(...validation.issues)
        const meta = dataset.variables.find((dv) => dv.name === v.name)
        if (meta && meta.missingPct > 20) {
          warnings.push(`"${meta.label}" has ${meta.missingPct}% missing — treat this result with caution.`)
        }
        rawFindings.push({ result, validation, isKey, interestScore, mainTakeaway, narrative, followUp, warnings })
      }
      continue
    }

    const suggested = getSuggestedVariables(testId, dataset)
    if (!hasEnoughVariables(testId, suggested.variables.length)) continue

    const result = runTest(testId, dataset)
    if (!result) continue

    const validation = validateTestResult(result)
    const isKey = isKeyFinding(result)
    const interestScore = computeInterestScore(result)
    const narrative = generateNarrative(result)
    const followUp = generateFollowUp(result)
    const mainTakeaway = generateMainTakeaway(result)
    const warnings: string[] = []
    if (!validation.consistent) warnings.push(...validation.issues)
    const vars = result.variablesAnalyzed ?? []
    for (const v of vars) {
      const meta = dataset.variables.find((dv) => dv.name === v.name)
      if (meta && meta.missingPct > 20) {
        warnings.push(`"${meta.label}" has ${meta.missingPct}% missing — treat this result with caution.`)
      }
    }
    rawFindings.push({ result, validation, isKey, interestScore, mainTakeaway, narrative, followUp, warnings })
  }

  const tier1 = rawFindings.filter((f) => TIER1_IDS.includes(f.result.testId))
  const bivariate = rawFindings
    .filter((f) => BIVARIATE_IDS.includes(f.result.testId))
    .sort((a, b) => b.interestScore - a.interestScore)
  const rest = rawFindings
    .filter((f) => !TIER1_IDS.includes(f.result.testId) && !BIVARIATE_IDS.includes(f.result.testId))
    .sort((a, b) => b.interestScore - a.interestScore)
  const findings = [...tier1, ...bivariate, ...rest]
  const keyHeadlines = findings.filter((f) => f.isKey).map((f) => getHeadline(f.result))
  const executiveSummary = buildExecutiveSummary(findings)
  const contradictions = detectContradictions(findings)
  const dataQuality = buildDataQualitySummary(dataset)

  return {
    findings,
    keyHeadlines,
    executiveSummary,
    contradictions,
    dataQuality,
    generatedAt: new Date().toLocaleString(),
  }
}

/** Build 2–4 sentences in plain language from top findings (no raw statistics). */
export function buildExecutiveSummary(findings: ReportFinding[]): string {
  if (findings.length === 0) return 'No analyses were run. Add variables and try again.'
  const top = findings
    .filter((f) => f.result.testId !== 'missing' || findings.some((x) => x.result.testId === 'missing'))
    .slice(0, 8)
  const notable = top.filter((f) => f.interestScore >= 5)
  const lines: string[] = []
  if (notable.length > 0) {
    const first = notable[0]
    lines.push(first.mainTakeaway)
    if (notable.length >= 2) lines.push(notable[1].mainTakeaway)
  }
  if (lines.length === 0) lines.push(top[0].mainTakeaway)
  const n = findings.length
  if (n <= 5) lines.push(`The report includes ${n} finding${n === 1 ? '' : 's'} from your data.`)
  else lines.push(`The report summarizes ${n} findings; expand any section for details or run the test yourself to verify.`)
  return lines.join(' ')
}

/** Group findings by theme for the full report. */
export function groupFindingsByTheme(findings: ReportFinding[]): ReportSection[] {
  const byTheme = new Map<string, ReportFinding[]>()
  for (const f of findings) {
    const theme = getTheme(f.result.testId)
    if (!byTheme.has(theme)) byTheme.set(theme, [])
    byTheme.get(theme)!.push(f)
  }
  const order = ['Descriptive', 'Associations', 'Group differences', 'Predictive', 'Other']
  return order
    .filter((t) => byTheme.has(t))
    .map((sectionTitle) => ({ sectionTitle, findings: byTheme.get(sectionTitle)! }))
}

/** One-line headline for a result (for key findings list and expandable summary). Prefer context + takeaway. */
export function getHeadline(result: TestResult): string {
  if (result.plainLanguage) return result.plainLanguage.replace(/^In practice:\s*/i, '').trim()
  if (result.keyStat) return `${result.testName}: ${result.keyStat}`
  const firstSentence = result.insight.split(/[.!?]/)[0]?.trim()
  if (firstSentence) return firstSentence + (result.insight.includes('.') ? '.' : '')
  return result.testName
}
