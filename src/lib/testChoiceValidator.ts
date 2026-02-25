/**
 * Pre-run validation: is this test appropriate for the dataset?
 * Cambridge PhD Statistics supervisor — ensures the right test is chosen for the data.
 */

import type { TestId } from './statsRunner'
import type { DatasetState, DataRow } from '../types'

export interface TestChoiceValidation {
  valid: boolean
  warnings: string[]
  suggestedAlternative?: TestId
}

function includedVariables(dataset: DatasetState) {
  return dataset.variables.filter((v) => v.includeInAnalysis !== false)
}

function getDistinctValues(rows: DataRow[], varName: string): (string | number)[] {
  const set = new Set<string | number>()
  for (const row of rows) {
    const v = row[varName]
    if (v === null || v === undefined || v === '') continue
    set.add(v)
  }
  return Array.from(set)
}

export function validateTestChoice(
  testId: TestId,
  dataset: DatasetState,
  selectedVarNames?: string[]
): TestChoiceValidation {
  const variables = includedVariables(dataset)
  const { rows } = dataset
  const scaleVars = variables.filter((v) => v.measurementLevel === 'scale')
  const nominalVars = variables.filter((v) => v.measurementLevel === 'nominal')
  const ordinalVars = variables.filter((v) => v.measurementLevel === 'ordinal')
  const warnings: string[] = []

  switch (testId) {
    case 'freq':
      if (variables.length === 0) return { valid: false, warnings: ['No variables available.'] }
      return { valid: true, warnings }

    case 'desc':
      if (scaleVars.length === 0) return { valid: false, warnings: ['No scale variables. Set at least one variable to Scale.'] }
      return { valid: true, warnings }

    case 'missing':
      return { valid: true, warnings }

    case 'crosstab': {
      const [rowVar, colVar] = selectedVarNames ?? [nominalVars[0]?.name, nominalVars[1]?.name ?? nominalVars[0]?.name]
      if (!rowVar || !colVar || nominalVars.length < 2)
        return { valid: false, warnings: ['Crosstab requires two categorical (nominal or ordinal) variables.'] }
      return { valid: true, warnings }
    }

    case 'corr':
    case 'spearman': {
      const vars = testId === 'corr' ? scaleVars : [...scaleVars, ...ordinalVars]
      const [v1, v2] = selectedVarNames ?? vars.slice(0, 2).map((v) => v.name)
      if (!v1 || !v2 || vars.length < 2)
        return { valid: false, warnings: [`${testId === 'corr' ? 'Pearson' : 'Spearman'} requires two scale (or ordinal) variables.`] }
      let pairs = 0
      for (const r of rows) {
        const a = r[v1]
        const b = r[v2]
        if (a != null && a !== '' && b != null && b !== '' && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) pairs++
      }
      if (pairs < 3) return { valid: false, warnings: [`Need at least 3 paired observations; you have ${pairs}.`] }
      return { valid: true, warnings }
    }

    case 'ttest': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name
      const groupName = selectedVarNames?.[1] ?? nominalVars.find((v) => getDistinctValues(rows, v.name).length === 2)?.name
      if (!outcomeName || !groupName)
        return { valid: false, warnings: ['Need one scale outcome and one categorical variable with exactly two groups.'] }
      const groups = getDistinctValues(rows, groupName)
      if (groups.length !== 2)
        return { valid: false, warnings: [`Grouping variable has ${groups.length} categories; t-test requires 2.`], suggestedAlternative: groups.length >= 3 ? 'anova' : undefined }
      const n1 = rows.filter((r) => r[groupName] === groups[0]).filter((r) => typeof r[outcomeName] === 'number').length
      const n2 = rows.filter((r) => r[groupName] === groups[1]).filter((r) => typeof r[outcomeName] === 'number').length
      if (n1 < 2 || n2 < 2)
        return { valid: false, warnings: [`Need at least 2 observations per group; you have ${n1} and ${n2}.`] }
      if (n1 < 30 || n2 < 30) warnings.push('Sample size under 30 per group; consider Mann-Whitney U if normality is in doubt.')
      return { valid: true, warnings }
    }

    case 'anova': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name
      const groupName = selectedVarNames?.[1] ?? nominalVars.find((v) => getDistinctValues(rows, v.name).length >= 3)?.name ?? nominalVars[0]?.name
      if (!outcomeName || !groupName)
        return { valid: false, warnings: ['Need one scale outcome and one categorical variable with 3+ groups.'] }
      const groupVals = getDistinctValues(rows, groupName)
      if (groupVals.length < 3)
        return { valid: false, warnings: [`Grouping variable has ${groupVals.length} categories; ANOVA requires 3+.`], suggestedAlternative: groupVals.length === 2 ? 'ttest' : undefined }
      const nPerGroup = groupVals.map((g) => rows.filter((r) => r[groupName] === g).filter((r) => typeof r[outcomeName] === 'number').length)
      if (nPerGroup.some((np) => np < 2))
        return { valid: false, warnings: [`Need at least 2 observations per group; you have ${nPerGroup.join(', ')}.`] }
      if (nPerGroup.some((np) => np < 30)) warnings.push('Small group sizes; consider Kruskal-Wallis if assumptions are violated.')
      return { valid: true, warnings }
    }

    case 'linreg': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name
      const predictorNames = selectedVarNames?.slice(1) ?? scaleVars.slice(1, 4).map((v) => v.name)
      if (!outcomeName || !predictorNames?.length)
        return { valid: false, warnings: ['Need one scale outcome and at least one predictor.'] }
      const vars = [outcomeName, ...predictorNames]
      const complete = rows.filter((r) => vars.every((v) => r[v] != null && r[v] !== ''))
      if (complete.length < 4) return { valid: false, warnings: [`Need at least 4 complete cases; you have ${complete.length}.`] }
      return { valid: true, warnings }
    }

    case 'logreg': {
      const outcomeName = selectedVarNames?.[0] ?? nominalVars.find((v) => getDistinctValues(rows, v.name).length === 2)?.name
      const predictorNames = selectedVarNames?.slice(1) ?? [...scaleVars.slice(0, 2).map((v) => v.name), ...nominalVars.filter((v) => getDistinctValues(rows, v.name).length === 2).slice(0, 1).map((v) => v.name)].filter(Boolean)
      if (!outcomeName || !predictorNames?.length)
        return { valid: false, warnings: ['Need one binary outcome and at least one predictor.'] }
      const outcomeVals = getDistinctValues(rows, outcomeName)
      if (outcomeVals.length !== 2)
        return { valid: false, warnings: [`Outcome must have exactly two categories; it has ${outcomeVals.length}.`] }
      const vars = [outcomeName, ...predictorNames]
      const complete = rows.filter((r) => vars.every((v) => r[v] != null && r[v] !== ''))
      if (complete.length < 10) return { valid: false, warnings: [`Need at least 10 complete cases for stable estimates; you have ${complete.length}.`] }
      return { valid: true, warnings }
    }

    case 'mann': {
      const outcomeName = selectedVarNames?.[0] ?? scaleVars[0]?.name ?? ordinalVars[0]?.name
      const groupName = selectedVarNames?.[1] ?? nominalVars[0]?.name
      if (!outcomeName || !groupName)
        return { valid: false, warnings: ['Need one scale or ordinal outcome and one categorical group variable.'] }
      const groupVals = getDistinctValues(rows, groupName)
      const samples = groupVals.map((g) => rows.filter((r) => r[groupName] === g).filter((r) => typeof r[outcomeName] === 'number' || r[outcomeName] != null).length)
      if (samples.some((s) => s < 1) || samples.reduce((a, b) => a + b, 0) < 3)
        return { valid: false, warnings: ['Need at least one observation per group and 3 total.'] }
      return { valid: true, warnings }
    }

    case 'paired': {
      const measureNames = selectedVarNames?.length ? selectedVarNames : scaleVars.slice(0, 2).map((v) => v.name)
      if (!measureNames?.length || measureNames.length < 2)
        return { valid: false, warnings: ['Need at least two scale variables (e.g. pre and post).'] }
      const [v1, v2] = measureNames.slice(0, 2)
      const pairs = rows.filter((r) => typeof r[v1] === 'number' && typeof r[v2] === 'number').length
      if (pairs < 3) return { valid: false, warnings: [`Need at least 3 paired observations; you have ${pairs}.`] }
      return { valid: true, warnings }
    }

    case 'pca':
      if (scaleVars.length < 1) return { valid: false, warnings: ['Need at least one scale variable.'] }
      const pcaVars = selectedVarNames ?? scaleVars.slice(0, 6).map((v) => v.name)
      const pcaComplete = rows.filter((r) => pcaVars.every((v) => r[v] != null && r[v] !== '' && !Number.isNaN(Number(r[v]))))
      if (pcaComplete.length < 4) return { valid: false, warnings: [`Need at least 4 complete cases; you have ${pcaComplete.length}.`] }
      return { valid: true, warnings }

    default:
      return { valid: true, warnings }
  }
}
