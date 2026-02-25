import { useState } from 'react'
import type { DatasetState } from '../types'
import { runInsightsReport, getHeadline, type InsightsReport, type ReportFinding } from '../lib/insightsReport'
import { TestResultPanel } from './TestResultPanel'

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
      <h2>Insights & Charts</h2>
      <p style={{ color: '#2c3e50', marginBottom: 16 }}>
        Generate a report from your data. The platform runs the applicable analyses and surfaces the main findings.
        All insights are computed from your dataset — no external API is used.
      </p>

      {!report && (
        <>
          <p style={{ marginBottom: 12 }}>
            Your dataset has <strong>{dataset.variables.length} variables</strong> and <strong>n = {dataset.rows.length}</strong> rows.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            style={{
              padding: '0.5rem 1.25rem',
              background: loading ? '#95a5a6' : '#3498db',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'default' : 'pointer',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            {loading ? 'Generating report…' : 'Generate report'}
          </button>
        </>
      )}

      {report && report.findings.length === 0 && (
        <p style={{ padding: 16, background: '#fef9e7', borderRadius: 8, color: '#7d6608' }}>
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

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          padding: 16,
          background: '#f8f9fa',
          borderLeft: '4px solid #3498db',
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <p style={{ margin: 0, lineHeight: 1.5, color: '#2c3e50' }}>
          <strong>What you’re seeing:</strong> The report below is built from analyses run on your data. Important findings are listed first; expand any section for the full table, chart, and interpretation. Every insight comes from computed results only — nothing is fabricated.
        </p>
      </div>

      {keyFindings.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 18, marginBottom: 12, color: '#2c3e50' }}>Key findings</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, color: '#34495e' }}>
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

      <h3 style={{ fontSize: 18, marginBottom: 12, color: '#2c3e50' }}>Full report</h3>
      <p style={{ fontSize: 14, color: '#6c757d', marginBottom: 16 }}>
        Expand any section to see the full table, chart, and what the result means.
      </p>

      {report.findings.map((finding, index) => (
        <FindingBlock key={index} finding={finding} />
      ))}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          style={{
            padding: '0.4rem 1rem',
            background: loading ? '#bdc3c7' : '#ecf0f1',
            color: '#2c3e50',
            border: '1px solid #bdc3c7',
            borderRadius: 6,
            cursor: loading ? 'default' : 'pointer',
            fontSize: 14,
          }}
        >
          {loading ? 'Regenerating…' : 'Regenerate report'}
        </button>
      </div>
    </div>
  )
}

function FindingBlock({ finding }: { finding: ReportFinding }) {
  const { result, validation } = finding
  const headline = getHeadline(result)
  const summaryLabel = validation.consistent
    ? headline
    : `${headline} — ⚠ Check result`

  return (
    <details
      style={{
        marginBottom: 12,
        border: '1px solid #bdc3c7',
        borderRadius: 8,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 14,
          color: '#2c3e50',
          listStyle: 'none',
        }}
      >
        <span style={{ marginRight: 8 }}>▸</span> {summaryLabel}
      </summary>
      <div style={{ padding: '0 16px 16px', borderTop: '1px solid #ecf0f1' }}>
        <TestResultPanel result={result} />
      </div>
    </details>
  )
}
