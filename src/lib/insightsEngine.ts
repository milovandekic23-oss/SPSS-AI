/**
 * Insights engine: HTML export and helpers for the v2 report (narratives, follow-ups, quality, contradictions live in insightsReport).
 */

import type { ReportFinding, InsightsReport } from './insightsReport'
import type { TestResult } from './statsRunner'

const TIER1_IDS: TestId[] = ['freq', 'desc', 'missing']
type TestId = import('./statsRunner').TestId

/** Interest score for a finding (used when report doesn't pre-compute it). */
export function scoreFinding(finding: ReportFinding): number {
  return finding.interestScore
}

/** Sort findings by interest score descending. */
export function sortFindingsByInterest(findings: ReportFinding[]): ReportFinding[] {
  return [...findings].sort((a, b) => b.interestScore - a.interestScore)
}

/** Prefer report narrative when available. */
export function narrativeForFinding(result: TestResult, finding?: ReportFinding): string {
  if (finding?.narrative) return finding.narrative
  if (result.plainLanguage) return result.plainLanguage.replace(/^In practice:\s*/i, '').trim()
  const first = result.insight.split(/[.!?]/)[0]?.trim()
  return first ? first + '.' : result.testName
}

/** Prefer report follow-up when available. */
export function followUpSuggestion(result: TestResult, finding?: ReportFinding): string | null {
  if (finding?.followUp) return finding.followUp
  return result.nextStep?.replace(/^Next step:\s*/i, '') ?? null
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderTableHTML(table: Record<string, string | number>[] | undefined): string {
  if (!table || table.length === 0) return ''
  const headers = Object.keys(table[0])
  return `<table>
    <thead><tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${table
        .map((row) => `<tr>${headers.map((h) => `<td>${escHtml(String(row[h] ?? '—'))}</td>`).join('')}</tr>`)
        .join('\n')}
    </tbody>
  </table>`
}

/**
 * Generate full APA-style HTML report from a v2 InsightsReport (data quality, contradictions, narratives, follow-ups).
 */
export function exportReportHTML(report: InsightsReport, datasetName = 'Dataset'): string {
  const { findings, keyHeadlines, executiveSummary, contradictions, dataQuality, generatedAt } = report

  const keyFindingsList = keyHeadlines.slice(0, 5).map((h) => `<li>${escHtml(h)}</li>`).join('\n')
  const contradictionsList =
    contradictions.length > 0
      ? contradictions
          .map(
            (c) =>
              `<div class="contradiction">⚠ ${escHtml(c.message)} <em>(Tests: ${c.involvedTests.join(', ')})</em></div>`
          )
          .join('\n')
      : '<p>No contradictions detected.</p>'

  const methodsTests = findings
    .filter((f) => !TIER1_IDS.includes(f.result.testId))
    .map((f) => f.result.testName)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ')

  const findingsHTML = findings
    .map((f) => {
      const tableHTML = renderTableHTML(f.result.table)
      const warningsHTML =
        f.warnings.length > 0
          ? `<div class="warnings">${f.warnings.map((w) => `<p>⚠ ${escHtml(w)}</p>`).join('')}</div>`
          : ''
      const followUpHTML = f.followUp
        ? `<p class="followup">💡 <strong>Follow-up:</strong> ${escHtml(f.followUp)}</p>`
        : ''
      return `
        <div class="finding ${f.isKey ? 'key-finding' : ''}">
          <h3>${escHtml(f.result.testName)}${f.isKey ? ' <span class="badge">Key Finding</span>' : ''}</h3>
          <p class="takeaway">${escHtml(f.mainTakeaway)}</p>
          <details><summary>Details (statistics &amp; table)</summary>
          <p class="narrative">${escHtml(f.narrative)}</p>
          ${warningsHTML}
          ${tableHTML}
          </details>
          ${followUpHTML}
        </div>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Statistics Report — ${escHtml(datasetName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; background: #fff; max-width: 900px; margin: 0 auto; padding: 48px 32px; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 18px; font-weight: 700; margin: 32px 0 12px; border-bottom: 2px solid #1C35D4; padding-bottom: 6px; color: #1C35D4; }
    h3 { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
    p { margin-bottom: 8px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 32px; }
    .quality { padding: 12px 16px; border-left: 4px solid; margin-bottom: 24px; font-size: 13px; }
    .quality.good { border-color: #27ae60; background: #f0fff4; }
    .quality.caution { border-color: #e67e22; background: #fffbf0; }
    .quality.poor { border-color: #e74c3c; background: #fff5f5; }
    ul { padding-left: 20px; margin-bottom: 12px; }
    li { margin-bottom: 4px; }
    .finding { margin-bottom: 32px; padding: 20px; border: 1px solid #e5e5e3; }
    .key-finding { border-left: 4px solid #1C35D4; }
    .badge { font-size: 10px; background: #1C35D4; color: white; padding: 2px 8px; vertical-align: middle; font-family: sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .narrative { font-size: 13px; color: #2c3e50; margin-bottom: 12px; }
    .warnings p { font-size: 12px; color: #e67e22; margin-bottom: 4px; }
    .followup { font-size: 12px; color: #27ae60; margin-top: 10px; }
    .contradiction { background: #fffbf0; border-left: 3px solid #e67e22; padding: 10px 14px; margin-bottom: 10px; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 12px; font-family: 'Courier New', monospace; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #1a1a1a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-family: sans-serif; }
    td { padding: 8px 12px; border-bottom: 1px solid #e5e5e3; }
    .methods { font-size: 12px; color: #555; font-style: italic; }
    @media print { body { padding: 24px; } .finding { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>Statistics Report</h1>
  <p class="meta">Dataset: <strong>${escHtml(datasetName)}</strong> &nbsp;|&nbsp; ${dataQuality.totalRows} rows, ${dataQuality.totalVariables} variables &nbsp;|&nbsp; Generated: ${escHtml(generatedAt)}</p>

  <div class="quality ${dataQuality.overallRating}">
    <strong>Data Quality: ${dataQuality.overallRating.toUpperCase()}</strong>
    ${dataQuality.smallSampleWarning ? '<br>⚠ Small sample (n &lt; 30) — interpret inferential results with caution.' : ''}
    ${dataQuality.highMissingnessVars.length > 0 ? `<br>⚠ High missingness (&gt;20%): ${dataQuality.highMissingnessVars.map(escHtml).join(', ')}` : ''}
    ${dataQuality.lowVarianceVars.length > 0 ? `<br>ℹ Low variance (&gt;90% one category): ${dataQuality.lowVarianceVars.map(escHtml).join(', ')}` : ''}
  </div>

  ${executiveSummary ? `<h2>Summary</h2><p class="takeaway">${escHtml(executiveSummary)}</p>` : ''}

  <h2>Key Findings</h2>
  ${keyHeadlines.length > 0 ? `<ul>${keyFindingsList}</ul>` : '<p>No statistically significant findings detected.</p>'}

  <h2>Contradictions &amp; Consistency Checks</h2>
  ${contradictionsList}

  <h2>Full Report</h2>
  ${findingsHTML}

  <h2>Methods</h2>
  <p class="methods">Analysis was conducted on ${dataQuality.totalRows} cases with ${dataQuality.totalVariables} variables. Analyses run: descriptive statistics, frequency distributions, missing value summary${methodsTests ? `, ${methodsTests}` : ''}. Significance α = 0.05. Effect sizes reported alongside p-values. Client-side computation, no external API.</p>
</body>
</html>`
}

/** Open the HTML report in a new browser tab. */
export function openReportInNewTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  if (w) w.focus()
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Download the HTML report as a file. */
export function downloadReport(html: string, filename = 'statistics-report.html'): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
