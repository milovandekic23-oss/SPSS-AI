/**
 * Oxford-level statistical guidance: when to use each test, assumptions, and alternatives.
 * Follows standard practice: describe first, then bivariate (association / group comparison), then regression.
 */

import type { TestId } from './statsRunner'

export interface TestGuidance {
  id: TestId
  name: string
  /** One-line plain-language summary: what this analysis does and what you get */
  summary: string
  whenToUse: string
  assumptions: string
  alternatives: string
  forLevels: string
}

export const TEST_GUIDANCE: Record<TestId, TestGuidance> = {
  freq: {
    id: 'freq',
    name: 'Frequencies & percentages',
    summary: 'Counts and percentages per category — table and bar chart.',
    whenToUse: 'Use for categorical (nominal or ordinal) variables to describe the distribution of responses. Always run first to check for coding errors and missing patterns.',
    assumptions: 'None. Descriptive only.',
    alternatives: 'For scale variables, use descriptive statistics (mean, SD, min, max) instead.',
    forLevels: 'Nominal / Ordinal',
  },
  desc: {
    id: 'desc',
    name: 'Descriptive statistics (Mean, SD, Min, Max)',
    summary: 'Mean, SD, min, max for numeric variables — table and optional chart.',
    whenToUse: 'Use for continuous (scale) variables to summarise central tendency and spread. Report before any inferential test. Check skewness and outliers.',
    assumptions: 'None. Descriptive only. For inference (e.g. t-test, ANOVA) normality and approximate equal variances are assumed.',
    alternatives: 'For skewed data or ordinal variables, report median and IQR instead of mean and SD.',
    forLevels: 'Scale (continuous)',
  },
  missing: {
    id: 'missing',
    name: 'Missing value summary',
    summary: 'How many missing values per variable — table with counts and %.',
    whenToUse: 'Always run early to assess missingness by variable. If >5–10% missing, consider multiple imputation or sensitivity analysis; if >30%, treat with caution.',
    assumptions: 'None.',
    alternatives: 'None. Always informative.',
    forLevels: 'All variables',
  },
  crosstab: {
    id: 'crosstab',
    name: 'Crosstabulation & Chi-Square test of independence',
    summary: 'Cross-tabulation of two categorical variables plus Chi-Square (and Fisher if 2×2).',
    whenToUse: 'Use when both variables are categorical (nominal or ordinal) and you want to test whether they are associated. Rows and columns are cross-classified; Chi-Square tests the null of no association.',
    assumptions: 'Expected count in each cell ≥ 5 (otherwise use Fisher’s exact test). Observations are independent. No structural zeros.',
    alternatives: 'If any expected count < 5: Fisher’s exact test (2×2) or consider collapsing categories. For ordinal × ordinal: consider Spearman correlation or ordinal logistic regression.',
    forLevels: 'Nominal × Nominal (or ordinal)',
  },
  corr: {
    id: 'corr',
    name: 'Pearson correlation',
    summary: 'Strength and direction of linear relationship between two numeric variables (r and p).',
    whenToUse: 'Use for two continuous variables to measure linear association. Reports r (−1 to +1) and tests H₀: ρ = 0. Do not use for non-linear relationships.',
    assumptions: 'Linearity; approximate bivariate normality (or large n); no influential outliers. Correlation does not imply causation.',
    alternatives: 'If relationship is monotonic but not linear, or data are ordinal: use Spearman rank correlation. For non-linear association, consider scatterplot and possibly transformation.',
    forLevels: 'Scale × Scale',
  },
  spearman: {
    id: 'spearman',
    name: 'Spearman rank correlation',
    summary: 'Monotonic association between two variables (ρ and p) — robust to non-normality.',
    whenToUse: 'Use for two ordinal or scale variables when the relationship is monotonic but not necessarily linear. Robust to outliers and non-normality.',
    assumptions: 'Monotonic relationship; ordinal comparison or ranks. No assumption of linearity or normality.',
    alternatives: 'If relationship is linear and data are scale: Pearson correlation is more powerful. For nominal variables use crosstab and Chi-Square.',
    forLevels: 'Scale × Scale or Ordinal × Ordinal',
  },
  ttest: {
    id: 'ttest',
    name: 'Independent-samples t-test',
    summary: 'Compare mean of one numeric variable between two groups (t, p, Levene, Welch).',
    whenToUse: 'Use when you have one continuous outcome and one categorical predictor with exactly two independent groups. Tests H₀: equal population means.',
    assumptions: 'Independence; approximate normality of the outcome in each group; approximate equality of variances (homoscedasticity). For n ≥ 30 per group, t-test is robust to non-normality.',
    alternatives: 'If n < 30 per group or normality clearly violated: use Mann-Whitney U (non-parametric). If variances unequal: Welch t-test (often default in software).',
    forLevels: 'Scale outcome, 2 groups (independent)',
  },
  anova: {
    id: 'anova',
    name: 'One-way ANOVA',
    summary: 'Compare mean of one numeric variable across 3+ groups (F, p, post-hoc Tukey).',
    whenToUse: 'Use when you have one continuous outcome and one categorical factor with three or more independent groups. Tests H₀: all group means equal. Follow with post-hoc comparisons if significant.',
    assumptions: 'Independence; approximate normality within each group; homogeneity of variances (Levene’s test).',
    alternatives: 'If assumptions violated or ordinal outcome: Kruskal-Wallis (non-parametric). If variances unequal: Welch ANOVA or robust methods.',
    forLevels: 'Scale outcome, 3+ groups (independent)',
  },
  linreg: {
    id: 'linreg',
    name: 'Linear regression',
    summary: 'Predict a numeric outcome from one or more predictors — coefficients, R², p.',
    whenToUse: 'Use to predict a continuous outcome from one or more predictors (continuous or categorical). Reports coefficients, R², and significance. Check residuals for linearity and homoscedasticity.',
    assumptions: 'Linear relationship; independence of errors; constant variance of errors; approximate normality of errors. No strong multicollinearity among predictors.',
    alternatives: 'If outcome is binary: logistic regression. If outcome is count: Poisson or negative binomial regression (not yet in app). If non-linear: add polynomial terms or use GAM.',
    forLevels: 'Scale outcome, one or more predictors',
  },
  logreg: {
    id: 'logreg',
    name: 'Logistic regression',
    summary: 'Predict a binary outcome — odds ratios and Wald tests for each predictor.',
    whenToUse: 'Use when the outcome is binary (e.g. yes/no) and you want to model the probability as a function of predictors. Reports odds ratios and significance.',
    assumptions: 'Independence; linearity of log-odds in continuous predictors; no perfect separation. Sufficient events per predictor (e.g. ≥10).',
    alternatives: 'If outcome has 3+ categories: multinomial or ordinal logistic regression (not yet in app). If count outcome: Poisson or negative binomial regression (not yet in app). If matched data: conditional logistic regression.',
    forLevels: 'Binary outcome, one or more predictors',
  },
  mann: {
    id: 'mann',
    name: 'Mann-Whitney U / Kruskal-Wallis',
    summary: 'Non-parametric comparison of groups (2 groups: U; 3+: Kruskal–Wallis H).',
    whenToUse: 'Use when comparing groups on a continuous or ordinal outcome and normality or equal-variance assumptions are violated, or sample size is small (e.g. n < 30 per group). Non-parametric alternatives to t-test (2 groups) and one-way ANOVA (3+ groups).',
    assumptions: 'Independent groups; ordinal comparison (distributions differ by location, not necessarily shape).',
    alternatives: 'If assumptions for t-test/ANOVA are met, parametric tests are more powerful. For paired data use Wilcoxon signed-rank.',
    forLevels: 'Ordinal or scale outcome, 2+ groups (independent)',
  },
  paired: {
    id: 'paired',
    name: 'Paired t-test / Repeated-measures ANOVA',
    summary: 'Compare two (or more) repeated measures on the same units — paired t or repeated ANOVA.',
    whenToUse: 'Use when the same units are measured more than once (e.g. before/after, or under different conditions). Paired t-test for 2 time points; repeated-measures ANOVA for 3+.',
    assumptions: 'Paired or repeated measures; difference (or residuals) approximately normal for paired t-test; sphericity for repeated-measures ANOVA.',
    alternatives: 'If normality of differences violated: Wilcoxon signed-rank (2 time points). For repeated measures with violations: mixed models or non-parametric alternatives.',
    forLevels: 'Scale outcome, within-subject factor (2+ levels)',
  },
  pca: {
    id: 'pca',
    name: 'Principal component analysis',
    summary: 'Dimension reduction — eigenvalues and % variance per component.',
    whenToUse: 'Use for dimension reduction when you have many correlated scale variables. Extracts components that explain variance; useful for construct validation or reducing predictors.',
    assumptions: 'Scale variables; linear relationships; sufficient N (e.g. ≥5 per variable). Consider correlation matrix if variables are on different scales.',
    alternatives: 'Factor analysis if you assume latent factors. For classification with groups: discriminant analysis. For multiple outcomes: MANOVA.',
    forLevels: 'Scale variables (two or more)',
  },
}

export function getTestGuidance(testId: TestId): TestGuidance {
  return TEST_GUIDANCE[testId] ?? {
    id: testId,
    name: String(testId),
    summary: 'Run to see result or requirements.',
    whenToUse: 'See documentation for when to use this test.',
    assumptions: 'Check test-specific assumptions.',
    alternatives: 'Consult a statistician or textbook for alternatives.',
    forLevels: 'Varies',
  }
}
