import { useState } from 'react'
import type { DatasetState } from '../types'
import { runInsightsReport, getHeadline, type InsightsReport, type ReportFinding, type DataQualitySummary } from '../lib/insightsReport'
import { exportReportHTML, openReportInNewTab, downloadReport } from '../lib/insightsEngine'
import { TestResultPanel } from './TestResultPanel'
import { styles, theme } from '../theme'

interface InsightsProps {
  dataset: DatasetState
}

export function Insights({ dataset }: InsightsProps) {
  const [report, setReport] = useState<InsightsReport | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGenerate = () => {
    setLoading(true)
    try {
      const next = runInsightsReport(dataset)
      setReport(next)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <header style={styles.sectionHeader}>
        <h2 style={styles.textSection}>
          Distribution<sup style={styles.sup}>3</sup>
        </h2>
      </header>
      <p style={{ ...styles.textBody, marginBottom: 16 }}>
        Generate a report from your data. The platform runs the applicable analyses and surfaces the main findings.
        All insights are computed from your dataset — no external API is used.
      </p>

      {!report && (
        <>
          <p style={{ ...styles.textBody, marginBottom: 12 }}>
            Your dataset has <strong>{dataset.variables.length} variables</strong> and <strong>n = {dataset.rows.length}</strong> rows.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            style={{
              ...styles.btn,
              ...styles.btnPrimary,
              marginTop: 0,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Generating report…' : 'Generate report'}
          </button>
        </>
      )}

      {report && report.findings.length === 0 && (
        <p style={{ padding: 16, background: theme.colors.surfaceMuted, border: `1px solid ${theme.colors.border}`, fontSize: 13 }}>
          No analyses could be run with the current variable setup. Confirm Variable View (measurement levels) and try again.
        </p>
      )}

      {report && report.findings.length > 0 && (
        <ReportView report={report} onRegenerate={handleGenerate} loading={loading} />
      )}
    </section>
  )
}

function ReportView({
  report,
  onRegenerate,
  loading,
}: {
  report: InsightsReport
  onRegenerate: () => void
  loading: boolean
}) {
  const keyFindings = report.findings.filter((f) => f.isKey)
  const { dataQuality, contradictions } = report

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          ...styles.chartContainer,
          borderLeft: `4px solid ${theme.colors.accent}`,
          marginBottom: 24,
        }}
      >
        <p style={{ margin: 0, ...styles.textBody }}>
          <strong>What you’re seeing:</strong> The report below is built from analyses run on your data. Important findings are listed first; expand any section for the full table, chart, and interpretation. Every insight comes from computed results only — nothing is fabricated.
        </p>
      </div>

      <DataQualityBlock summary={dataQuality} />

      {contradictions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ ...styles.suggestionTitle, fontSize: 18, marginBottom: 8 }}>Consistency checks</h3>
          <p style={{ ...styles.textBody, fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
            The following patterns may be worth checking — they are not necessarily errors.
          </p>
          {contradictions.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                marginBottom: 8,
                background: theme.colors.surfaceMuted,
                borderLeft: '3px solid #e67e22',
                fontSize: 13,
                ...styles.textBody,
              }}
            >
              ⚠ {c.message}
              <span style={{ color: theme.colors.textMuted, fontSize: 12 }}> (Tests: {c.involvedTests.join(', ')})</span>
            </div>
          ))}
        </div>
      )}

      {keyFindings.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ ...styles.suggestionTitle, fontSize: 20, marginBottom: 12 }}>Key findings</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, ...styles.textBody }}>
            {keyFindings.map((f, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {f.validation.consistent ? (
                  <span>{getHeadline(f.result)}</span>
                ) : (
                  <span>
                    {getHeadline(f.result)}
                    <span style={{ color: '#e67e22', fontSize: 12, marginLeft: 6 }}>
                      (Check details: {f.validation.issues.join('; ')})
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 style={{ ...styles.suggestionTitle, fontSize: 20, marginBottom: 12 }}>Full report</h3>
      <p style={{ ...styles.textBody, opacity: 0.7, marginBottom: 16 }}>
        Expand any section to see the narrative, table, chart, and follow-up suggestion.
      </p>

      {report.findings.map((finding, index) => (
        <FindingBlock key={index} finding={finding} />
      ))}

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => openReportInNewTab(exportReportHTML(report))}
          style={{
            ...styles.btn,
            ...styles.btnPrimary,
            marginTop: 0,
            opacity: 1,
            cursor: 'pointer',
          }}
        >
          Open report in new tab
        </button>
        <button
          type="button"
          onClick={() => downloadReport(exportReportHTML(report))}
          style={{
            ...styles.btn,
            marginTop: 0,
            cursor: 'pointer',
          }}
        >
          Download report (HTML)
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          style={{
            ...styles.btn,
            marginTop: 0,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Regenerating…' : 'Regenerate report'}
        </button>
      </div>
    </div>
  )
}

function DataQualityBlock({ summary }: { summary: DataQualitySummary }) {
  const borderColor =
    summary.overallRating === 'good' ? '#27ae60' : summary.overallRating === 'caution' ? '#e67e22' : '#e74c3c'
  const bg = summary.overallRating === 'good' ? '#f0fff4' : summary.overallRating === 'caution' ? '#fffbf0' : '#fff5f5'
  return (
    <div
      style={{
        padding: '12px 16px',
        marginBottom: 24,
        borderLeft: `4px solid ${borderColor}`,
        background: bg,
        fontSize: 13,
        ...styles.textBody,
      }}
    >
      <strong>Data quality: {summary.overallRating}</strong>
      {summary.smallSampleWarning && (
        <div style={{ marginTop: 4 }}>⚠ Small sample (n &lt; 30) — interpret inferential results with caution.</div>
      )}
      {summary.highMissingnessVars.length > 0 && (
        <div style={{ marginTop: 4 }}>⚠ High missingness (&gt;20%): {summary.highMissingnessVars.join(', ')}</div>
      )}
      {summary.lowVarianceVars.length > 0 && (
        <div style={{ marginTop: 4 }}>ℹ Low variance (&gt;90% one category): {summary.lowVarianceVars.join(', ')}</div>
      )}
    </div>
  )
}

function FindingBlock({ finding }: { finding: ReportFinding }) {
  const { result, validation, narrative, followUp, warnings } = finding
  const headline = getHeadline(result)
  const summaryLabel = validation.consistent
    ? headline
    : `${headline} — ⚠ Check result`

  return (
    <details
      style={{
        marginBottom: 12,
        ...styles.chartContainer,
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 14,
          ...styles.textBody,
          listStyle: 'none',
        }}
      >
        <span style={{ marginRight: 8 }}>▸</span> {summaryLabel}
      </summary>
      <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${theme.colors.border}` }}>
        {narrative && (
          <p style={{ marginBottom: 12, fontSize: 13, color: theme.colors.textMuted ?? '#555', ...styles.textBody }}>
            {narrative}
          </p>
        )}
        {warnings.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {warnings.map((w, i) => (
              <p key={i} style={{ fontSize: 12, color: '#e67e22', marginBottom: 4, ...styles.textBody }}>
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
        <TestResultPanel result={result} />
        {followUp && (
          <p style={{ marginTop: 12, fontSize: 12, color: '#27ae60', fontStyle: 'italic', ...styles.textBody }}>
            💡 <strong>Follow-up:</strong> {followUp}
          </p>
        )}
      </div>
    </details>
  )
}
