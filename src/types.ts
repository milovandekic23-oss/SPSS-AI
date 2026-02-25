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

/** Type of multi-column question (survey-style) */
export type QuestionGroupType = 'checkbox' | 'matrix' | 'ranking' | 'group'

/** Group of columns treated as one question (e.g. checkbox, matrix, ranking) */
export interface QuestionGroup {
  id: string
  label: string
  type: QuestionGroupType
  variableNames: string[]
}

/** Row of data keyed by variable name */
export type DataRow = Record<string, string | number | null>

/** Parsed dataset + variable metadata (session state) */
export interface DatasetState {
  variables: VariableMeta[]
  rows: DataRow[]
  variableViewConfirmed: boolean
  /** Columns grouped into one question (checkbox, matrix, ranking, etc.) */
  questionGroups: QuestionGroup[]
}
