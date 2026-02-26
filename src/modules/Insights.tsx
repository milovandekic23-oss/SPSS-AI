import { useState, useCallback, useRef } from 'react'
import type { DatasetState } from '../types'
import { runInsightsReport, getHeadline, type InsightsReport, type ReportFinding, type DataQualitySummary } from '../lib/insightsReport'
import { exportReportHTML, openReportInNewTab, downloadReport } from '../lib/insightsEngine'
import { runTest } from '../lib/statsRunner'
import { useAI } from '../hooks/useAI'
import { TestResultPanel } from './TestResultPanel'
import { styles, theme } from '../theme'
import type { TestResult } from '../lib/statsRunner'

interface InsightsProps {
  dataset: DatasetState
  apiKey: string
}

export function Insights({ dataset, apiKey }: InsightsProps) {
  const [report, setReport] = useState<InsightsReport | null>(null)
  const [loading, setLoading] = useState(false)
  const hasApiKey = apiKey.length > 0

  const handleGenerate = useCallback(() => {
    setLoading(true)
    setTimeout(() => {
      try {
        setReport(runInsightsReport(dataset))
      } finally {
        setLoading(false)
      }
    }, 0)
  }, [dataset])

  return (
    <section>
      <header style={styles.sectionHeader}>
        <h2 style={styles.textSection}>
          Insights<sup style={styles.sup}>3</sup>
        </h2>
      </header>
      <p style={{ ...styles.textBody, marginBottom: 16 }}>
        {hasApiKey
          ? 'Ask a question about your data in plain English — AI will choose the right test and run it. Or generate a full automated report below.'
          : 'Generate a full automated report from your data. All analyses are computed locally — no external API required.'}
      </p>

      {hasApiKey && <AIQuestionBox dataset={dataset} apiKey={apiKey} />}

      <div style={{ marginTop: hasApiKey ? 32 : 0 }}>
        <h3 style={{ ...styles.textLabel, marginBottom: 8, opacity: 0.7 }}>Automated report</h3>
        <p style={{ ...styles.textBody, marginBottom: 12, opacity: 0.8 }}>
          Your dataset has <strong>{dataset.variables.length} variables</strong> and <strong>n = {dataset.rows.length}</strong> rows.
        </p>

        {!report && (
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
        )}

        {report && report.findings.length === 0 && (
          <p style={{ padding: 16, background: theme.colors.surfaceMuted, border: `1px solid ${theme.colors.border}`, fontSize: 13 }}>
            No analyses could be run with the current variable setup. Confirm Variable View (measurement levels) and try again.
          </p>
        )}

        {report && report.findings.length > 0 && (
          <ReportView report={report} dataset={dataset} apiKey={apiKey} onRegenerate={handleGenerate} loading={loading} />
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────
// AI QUESTION BOX
// ─────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
  testResult?: TestResult
  aiInterpretation?: string
}

function AIQuestionBox({ dataset, apiKey }: { dataset: DatasetState; apiKey: string }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const { ask, routeQuery, interpretResult, loading, error } = useAI(apiKey, dataset)
  const bottomRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const handleSubmit = useCallback(async () => {
    const q = question.trim()
    if (!q || loading || !dataset) return
    setQuestion('')

    const userMsg: Message = { role: 'user', content: q }
    setMessages((prev) => [...prev, userMsg])
    scrollToBottom()

    const history = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.testResult))
      .map((m) => ({ role: m.role, content: m.content }))

    const route = await routeQuery(q)

    if (route && route.testId && route.confidence !== 'low') {
      const selectedVars = [route.outcomeVar, route.groupVar, ...route.predictorVars].filter(
        (v): v is string => !!v
      )
      const testResult = runTest(route.testId, dataset, selectedVars.length > 0 ? selectedVars : undefined)

      if (testResult) {
        const interp = await interpretResult(testResult)
        const interpText = interp
          ? `${interp.summary}\n\n${interp.plainLanguage}${interp.nextStep ? `\n\n**Next step:** ${interp.nextStep}` : ''}${interp.warnings.length > 0 ? `\n\n⚠ ${interp.warnings.join(' ')}` : ''}`
          : null

        const assistantMsg: Message = {
          role: 'assistant',
          content: route.reason,
          testResult,
          aiInterpretation: interpText ?? undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
        scrollToBottom()
        return
      }
    }

    const response = await ask(q, history)
    if (response.text) {
      setMessages((prev) => [...prev, { role: 'assistant', content: response.text }])
      scrollToBottom()
    }
  }, [question, loading, messages, routeQuery, interpretResult, ask, dataset, scrollToBottom])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const exampleQuestions = [
    'Which variables predict income?',
    'Is there a difference between groups?',
    'What are the key findings in my data?',
    'Which variable has the most missing data?',
  ]

  return (
    <div
      style={{
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        padding: 20,
      }}
    >
      <h3 style={{ ...styles.suggestionTitle, fontSize: 16, marginBottom: 12 }}>
        🤖 Ask a question about your data
      </h3>

      {messages.length === 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {exampleQuestions.map((eq) => (
            <button
              key={eq}
              type="button"
              onClick={() => setQuestion(eq)}
              style={{
                background: theme.colors.background,
                border: `1px solid ${theme.colors.border}`,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: theme.font.family,
                color: theme.colors.textMuted,
              }}
            >
              {eq}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div
          style={{
            maxHeight: 480,
            overflowY: 'auto',
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.map((msg, i) => (
            <div key={i}>
              <div
                style={{
                  padding: '10px 14px',
                  background: msg.role === 'user' ? theme.colors.accent : theme.colors.background,
                  color: msg.role === 'user' ? '#FFFFFF' : theme.colors.text,
                  fontSize: 13,
                  lineHeight: 1.5,
                  maxWidth: msg.role === 'user' ? '70%' : '100%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginLeft: msg.role === 'user' ? 'auto' : 0,
                  borderLeft: msg.role === 'assistant' ? `3px solid ${theme.colors.accent}` : 'none',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
              {msg.testResult && (
                <div style={{ marginTop: 8 }}>
                  {msg.aiInterpretation && (
                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#f0f4ff',
                        borderLeft: `3px solid ${theme.colors.accent}`,
                        fontSize: 13,
                        lineHeight: 1.5,
                        marginBottom: 8,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <strong style={styles.textLabel}>🤖 AI Interpretation</strong>
                      <p style={{ margin: '6px 0 0' }}>{msg.aiInterpretation}</p>
                    </div>
                  )}
                  <TestResultPanel result={msg.testResult} />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 'Does satisfaction differ by department?' or 'What predicts income?'"
          disabled={loading}
          rows={2}
          style={{
            flex: 1,
            padding: '8px 10px',
            fontSize: 13,
            fontFamily: theme.font.family,
            border: `1px solid ${theme.colors.border}`,
            resize: 'vertical',
            background: loading ? theme.colors.background : '#FFFFFF',
            color: theme.colors.text,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !question.trim()}
          style={{
            ...styles.btn,
            ...styles.btnPrimary,
            marginTop: 0,
            alignSelf: 'flex-end',
            opacity: loading || !question.trim() ? 0.6 : 1,
            cursor: loading || !question.trim() ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '…' : 'Ask →'}
        </button>
      </div>

      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#e74c3c' }}>
          ⚠ {error}. Check your API key at{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
            console.anthropic.com
          </a>
        </p>
      )}

      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => setMessages([])}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            fontSize: 11,
            color: theme.colors.textFaded ?? theme.colors.textMuted,
            cursor: 'pointer',
            padding: 0,
            fontFamily: theme.font.family,
          }}
        >
          Clear conversation
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// REPORT VIEW
// ─────────────────────────────────────────────

function ReportView({
  report,
  dataset,
  apiKey,
  onRegenerate,
  loading,
}: {
  report: InsightsReport
  dataset: DatasetState
  apiKey: string
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
            {keyFindings.map((f, i) => {
              const freqFindings = report.findings.filter((x) => x.result.testId === 'freq')
              const questionNumber =
                f.result.testId === 'freq' ? freqFindings.indexOf(f) + 1 : undefined
              const questionLabel = f.result.testId === 'freq' && f.result.variablesAnalyzed?.[0]?.label
              const displayHeadline =
                questionNumber != null && questionLabel
                  ? `${questionNumber}. ${questionLabel}`
                  : getHeadline(f.result)
              return (
                <li key={i} style={{ marginBottom: 6 }}>
                  {f.validation.consistent ? (
                    <span>{displayHeadline}</span>
                  ) : (
                    <span>
                      {displayHeadline}
                      <span style={{ color: '#e67e22', fontSize: 12, marginLeft: 6 }}>
                        (Check details: {f.validation.issues.join('; ')})
                      </span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <h3 style={{ ...styles.suggestionTitle, fontSize: 20, marginBottom: 12 }}>Full report</h3>
      <p style={{ ...styles.textBody, opacity: 0.7, marginBottom: 16 }}>
        Expand any section to see the narrative, table, chart, and follow-up suggestion.
      </p>

      {report.findings.map((finding, index) => {
        const freqFindings = report.findings.filter((f) => f.result.testId === 'freq')
        const questionNumber =
          finding.result.testId === 'freq'
            ? freqFindings.indexOf(finding) + 1
            : undefined
        const questionLabel =
          finding.result.testId === 'freq'
            ? finding.result.variablesAnalyzed?.[0]?.label
            : undefined
        return (
          <FindingBlock
            key={index}
            finding={finding}
            dataset={dataset}
            apiKey={apiKey}
            questionNumber={questionNumber}
            questionLabel={questionLabel}
          />
        )
      })}

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

function FindingBlock({
  finding,
  dataset,
  apiKey,
  questionNumber,
  questionLabel,
}: {
  finding: ReportFinding
  dataset: DatasetState
  apiKey: string
  questionNumber?: number
  questionLabel?: string
}) {
  const { result, validation, narrative, followUp, warnings, interestScore } = finding
  const [aiInterpretation, setAiInterpretation] = useState<string | null>(null)
  const [loadingInterp, setLoadingInterp] = useState(false)
  const { interpretResult } = useAI(apiKey, dataset)
  const hasApiKey = apiKey.length > 0

  const handleAIInterpret = useCallback(async () => {
    if (!hasApiKey || loadingInterp) return
    setLoadingInterp(true)
    const interp = await interpretResult(result)
    if (interp) {
      setAiInterpretation(
        `${interp.summary}\n\n${interp.plainLanguage}${interp.nextStep ? `\n\nNext step: ${interp.nextStep}` : ''}${interp.warnings.length > 0 ? `\n\n⚠ ${interp.warnings.join(' ')}` : ''}`
      )
    }
    setLoadingInterp(false)
  }, [hasApiKey, loadingInterp, interpretResult, result])

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
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          <span style={{ marginRight: 8 }}>▸</span>{' '}
          {questionNumber != null ? `${questionNumber}. ${questionLabel ?? headline}` : summaryLabel}
        </span>
        {interestScore >= 5 && (
          <span
            style={{
              fontSize: 10,
              background: theme.colors.accent,
              color: '#FFFFFF',
              padding: '2px 8px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            Notable
          </span>
        )}
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
        {hasApiKey && !aiInterpretation && (
          <button
            type="button"
            onClick={handleAIInterpret}
            disabled={loadingInterp}
            style={{
              ...styles.btn,
              marginTop: 0,
              marginBottom: 12,
              padding: '6px 14px',
              fontSize: 11,
              opacity: loadingInterp ? 0.6 : 1,
              cursor: loadingInterp ? 'default' : 'pointer',
            }}
          >
            {loadingInterp ? 'Getting AI interpretation…' : '🤖 Get AI interpretation'}
          </button>
        )}
        {aiInterpretation && (
          <div
            style={{
              padding: '10px 14px',
              background: '#f0f4ff',
              borderLeft: `3px solid ${theme.colors.accent}`,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            <strong style={styles.textLabel}>🤖 AI Interpretation</strong>
            <p style={{ margin: '6px 0 0' }}>{aiInterpretation}</p>
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
