import { useMemo, useState } from 'react'
import type { DatasetState } from '../types'
import { checkDataReadiness, canProceedToTests, type DataReadinessResult, type ReadinessItem } from '../lib/dataReadiness'
import { theme } from '../theme'

interface DataReadinessPanelProps {
  dataset: DatasetState | null
  /** If provided, the panel can offer "Exclude from analysis" and other fixes. */
  onDatasetChange?: (dataset: DatasetState) => void
  /** If provided, show "Go to Variable View" to fix issues there. */
  onOpenVariableView?: () => void
}

const SEVERITY_STYLE: Record<ReadinessItem['severity'], { bg: string; border: string; label: string }> = {
  info: { bg: '#e8f4fd', border: '#1C35D4', label: 'Info' },
  caution: { bg: '#fef9e7', border: '#f1c40f', label: 'Caution' },
  warning: { bg: '#fdebd0', border: '#e67e22', label: 'Warning' },
  critical: { bg: '#fadbd8', border: '#c0392b', label: 'Critical' },
}

const LEVEL_STYLE: Record<DataReadinessResult['level'], { bg: string; color: string; label: string }> = {
  ready: { bg: '#d5f5e3', color: '#1e8449', label: 'Ready' },
  needs_attention: { bg: '#fef9e7', color: '#b7950b', label: 'Needs Attention' },
  not_ready: { bg: '#fadbd8', color: '#c0392b', label: 'Not Ready' },
}

export function DataReadinessPanel({ dataset, onDatasetChange, onOpenVariableView }: DataReadinessPanelProps) {
  const [heatmapOpen, setHeatmapOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)

  const result = useMemo(() => (dataset?.variableViewConfirmed && dataset ? checkDataReadiness(dataset) : null), [dataset])

  const handleExcludeFromAnalysis = (varName: string) => {
    if (!dataset || !onDatasetChange) return
    const next = {
      ...dataset,
      variables: dataset.variables.map((v) =>
        v.name === varName ? { ...v, includeInAnalysis: false } : v
      ),
    }
    onDatasetChange(next)
  }

  if (!result || !dataset) return null

  const canProceed = canProceedToTests(result)
  const levelStyle = LEVEL_STYLE[result.level]

  return (
    <section
      style={{
        marginBottom: 24,
        padding: 16,
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Data readiness</h3>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            backgroundColor: levelStyle.bg,
            color: levelStyle.color,
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {levelStyle.label}
        </span>
        <span style={{ fontSize: 13, color: theme.colors.textMuted }}>Score: {result.score}/100</span>
        {!canProceed && (
          <span style={{ fontSize: 13, color: '#c0392b', fontWeight: 500 }}>
            Resolve critical issues before running tests.
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen(!detailsOpen)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 13,
          color: theme.colors.accent,
          textDecoration: 'underline',
          marginBottom: 8,
        }}
      >
        {detailsOpen ? '▼' : '▶'} Checklist ({result.items.length} items)
      </button>

      {detailsOpen && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', fontSize: 13 }}>
            {result.items.map((item) => {
              const sev = SEVERITY_STYLE[item.severity]
              return (
                <li
                  key={item.id}
                  style={{
                    marginBottom: 6,
                    padding: '8px 10px',
                    background: sev.bg,
                    borderLeft: `4px solid ${sev.border}`,
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>[{sev.label}]</span> {item.message}
                  {item.suggestion && (
                    <div style={{ marginTop: 4, fontSize: 12, color: theme.colors.textMuted }}>
                      Suggestion: {item.suggestion}
                    </div>
                  )}
                  {item.variable && item.category === 'missing' && onDatasetChange && (
                    <button
                      type="button"
                      onClick={() => handleExcludeFromAnalysis(item.variable!)}
                      style={{
                        marginTop: 6,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                        background: theme.colors.surface,
                        border: `1px solid ${theme.colors.border}`,
                        borderRadius: 4,
                      }}
                    >
                      Exclude from analysis
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {result.items.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 12, color: theme.colors.textMuted }}>How to fix</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.5 }}>
                <li><strong>High missing %:</strong> Use “Exclude from analysis” above, or in Variable View uncheck “In analysis” for that variable. If the variable is an <strong>option in a multi-select question</strong> (e.g. “Select max 2”), go to Variable View → Question groups → create a group with type <strong>Checkbox</strong> and assign the option columns to it — then readiness will not flag them.</li>
                <li><strong>Outliers / non-normal:</strong> Use non-parametric tests (e.g. Mann-Whitney, Kruskal-Wallis) in Test Suggester.</li>
                <li><strong>Duplicates:</strong> Clean or deduplicate in your source data.</li>
              </ul>
              {onOpenVariableView && (
                <button
                  type="button"
                  onClick={onOpenVariableView}
                  style={{
                    marginTop: 10,
                    padding: '8px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    background: theme.colors.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                  }}
                >
                  Go to Variable View to fix
                </button>
              )}
            </div>
          )}

          {result.missingHeatmap && result.missingHeatmap.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setHeatmapOpen(!heatmapOpen)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 13,
                  color: theme.colors.accent,
                  textDecoration: 'underline',
                }}
              >
                {heatmapOpen ? '▼' : '▶'} Missing data heatmap (variable × row)
              </button>
              {heatmapOpen && (
                <div
                  style={{
                    marginTop: 8,
                    overflowX: 'auto',
                    maxHeight: 200,
                    overflowY: 'auto',
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: 4,
                    padding: 8,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {result.missingHeatmap.slice(0, 15).map(({ varName, rowFlags }) => (
                      <div key={varName} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ minWidth: 120, fontSize: 11 }} title={varName}>
                          {varName.length > 18 ? varName.slice(0, 18) + '…' : varName}
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 0 }}>
                          {rowFlags.map((f, i) => (
                            <div
                              key={i}
                              style={{
                                width: 4,
                                height: 10,
                                backgroundColor: f ? '#d5f5e3' : '#fadbd8',
                                borderRadius: 0,
                              }}
                              title={`Row ${i}: ${f ? 'valid' : 'missing'}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: theme.colors.textMuted }}>
                    Green = present, red = missing. Sampled rows if n &gt; 100.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function getDataReadinessForApp(dataset: DatasetState | null): DataReadinessResult | null {
  if (!dataset?.variableViewConfirmed || !dataset) return null
  return checkDataReadiness(dataset)
}
