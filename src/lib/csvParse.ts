import Papa from 'papaparse'
import type { VariableMeta, DataRow, MeasurementLevel, VariableType } from '../types'

function inferMeasurementLevel(
  _name: string,
  values: (string | number | null)[],
  uniqueCount: number
): MeasurementLevel {
  const numeric = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
  const allNumeric = values.length > 0 && numeric.length === values.filter((v) => v != null && v !== '').length
  if (!allNumeric || numeric.length === 0) return 'nominal'
  const distinct = new Set(numeric).size
  if (distinct <= 7 && distinct <= uniqueCount) return uniqueCount <= 5 ? 'ordinal' : 'scale'
  return 'scale'
}

function inferVariableType(values: (string | number | null)[]): VariableType {
  const nonNull = values.filter((v) => v != null && v !== '')
  if (nonNull.length === 0) return 'string'
  const numeric = nonNull.every((v) => typeof v === 'number' || !Number.isNaN(Number(v)))
  if (numeric) {
    const hasDecimal = nonNull.some((v) => String(v).includes('.'))
    return hasDecimal ? 'decimal' : 'integer'
  }
  const dates = nonNull.filter((v) => {
    const s = String(v)
    return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)
  })
  if (dates.length === nonNull.length) return 'date'
  if (nonNull.every((v) => /^(true|false|1|0)$/i.test(String(v)))) return 'boolean'
  return 'string'
}

function toLabel(name: string): string {
  return name
    .replace(/^Q\d+_?/i, '')
    .replace(/[_.-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || name
}

export function parseCSV(csvText: string): { variables: VariableMeta[]; rows: DataRow[] } {
  if (!csvText || typeof csvText !== 'string') return { variables: [], rows: [] }
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true })
  const rows = Array.isArray(parsed?.data) ? parsed.data : []
  if (rows.length < 2) return { variables: [], rows: [] }

  const rawHeaders = rows[0]
  const headers: string[] = rawHeaders.map((h, j) => {
    const s = (h != null ? String(h).trim() : '') || `Column_${j + 1}`
    return s
  })
  const dataRows: DataRow[] = []
  const colValues: (string | number | null)[][] = headers.map(() => [])

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const obj: DataRow = {}
    headers.forEach((h, j) => {
      const raw = row[j] ?? ''
      const trimmed = typeof raw === 'string' ? raw.trim() : String(raw)
      let val: string | number | null = trimmed === '' ? null : trimmed
      const num = Number(val)
      if (val !== null && !Number.isNaN(num) && String(num) === String(val)) val = num
      obj[h] = val
      colValues[j].push(val)
    })
    dataRows.push(obj)
  }

  const variables: VariableMeta[] = headers.map((name, j) => {
    const values = colValues[j]
    const nonMissing = values.filter((v): v is string | number => v != null && v !== '')
    const missingPct = values.length ? ((values.length - nonMissing.length) / values.length) * 100 : 0
    const uniqueCount = new Set(nonMissing).size
    const measurementLevel = inferMeasurementLevel(name, values, uniqueCount)
    const variableType = inferVariableType(values)
    const valueLabels: { code: number | string; label: string }[] = []
    if (measurementLevel !== 'scale' && uniqueCount <= 10) {
      const counts = new Map<string | number, number>()
      nonMissing.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
      Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([code]) => valueLabels.push({ code, label: String(code) }))
    }
    return {
      name,
      label: toLabel(name),
      measurementLevel,
      variableType,
      role: 'none',
      valueLabels,
      missingCodes: [],
      missingPct: Math.round(missingPct * 10) / 10,
    }
  })

  return { variables, rows: dataRows }
}
