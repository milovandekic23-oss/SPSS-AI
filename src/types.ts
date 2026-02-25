/** Measurement level for variable view (Smart Data Reader) */
export type MeasurementLevel = 'nominal' | 'ordinal' | 'scale'

/** Variable type inferred or set by user */
export type VariableType = 'string' | 'integer' | 'decimal' | 'date' | 'boolean'

/** Role in analysis */
export type VariableRole = 'input' | 'target' | 'id' | 'none'

export type ValueLabel = { code: number | string; label: string }

/** Per-variable metadata editable in Variable View */
export interface VariableMeta {
  name: string
  label: string
  measurementLevel: MeasurementLevel
  variableType: VariableType
  role: VariableRole
  valueLabels: ValueLabel[]
  missingCodes: (number | string)[]
  missingPct: number
}

/** Row of data keyed by variable name */
export type DataRow = Record<string, string | number | null>

/** Parsed dataset + variable metadata (session state) */
export interface DatasetState {
  variables: VariableMeta[]
  rows: DataRow[]
  variableViewConfirmed: boolean
}
