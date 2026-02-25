/**
 * Suggest question groups from variable names and data patterns.
 * Groups columns that likely belong to the same question (checkboxes, multi-select, grid, etc.).
 */

import type { DatasetState, QuestionGroup } from '../types'

function nextGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Extract a common stem from a variable name for grouping (e.g. Q5_1, Q5_2 -> Q5). */
function stem(name: string): string {
  const s = name.trim()
  const sep = /[_.\-\s]+/
  const parts = s.split(sep).filter(Boolean)
  if (parts.length < 2) return s
  const last = parts[parts.length - 1]
  const lastIsIndex = /^\d+$/.test(last) || /^[a-z]$/i.test(last)
  if (lastIsIndex) return parts.slice(0, -1).join('_')
  return s
}

/** Check if a variable looks binary (0/1, yes/no, true/false) from its values in the first 100 rows. */
function looksBinary(rows: Record<string, string | number | null>[], varName: string): boolean {
  const vals = new Set<string>()
  const limit = Math.min(100, rows.length)
  for (let i = 0; i < limit; i++) {
    const v = rows[i]?.[varName]
    if (v == null || v === '') continue
    vals.add(String(v).toLowerCase())
    if (vals.size > 2) return false
  }
  return vals.size <= 2
}

/**
 * Suggest question groups from the dataset.
 * Heuristics: (1) group variables that share a name stem (e.g. Q5_1, Q5_2); (2) prefer groups of 2+ columns.
 */
export function suggestQuestionGroups(dataset: DatasetState): QuestionGroup[] {
  const { variables, rows } = dataset
  if (!variables?.length || !rows?.length) return []

  const byStem = new Map<string, string[]>()
  for (const v of variables) {
    const s = stem(v.name)
    if (!byStem.has(s)) byStem.set(s, [])
    byStem.get(s)!.push(v.name)
  }

  const groups: QuestionGroup[] = []
  const assigned = new Set<string>()

  for (const [stemName, names] of byStem) {
    if (names.length < 2) continue
    const allBinary = names.every((n) => looksBinary(rows, n))
    const type = allBinary ? 'checkbox' as const : 'matrix' as const
    const label = variables.find((x) => x.name === names[0])?.label ?? stemName
    groups.push({
      id: nextGroupId(),
      label: label.length > 40 ? label.slice(0, 37) + '…' : label,
      type,
      variableNames: [...names],
    })
    for (const n of names) assigned.add(n)
  }

  return groups
}

/** Merge suggested groups into dataset (replace empty questionGroups with suggestions). */
export function applySuggestedQuestionGroups(dataset: DatasetState, suggested: QuestionGroup[]): DatasetState {
  return { ...dataset, questionGroups: suggested }
}
