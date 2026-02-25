import { useState } from 'react'
import type { DatasetState } from '../types'

interface InsightsProps {
  dataset: DatasetState
}

export function Insights({ dataset }: InsightsProps) {
  const [question, setQuestion] = useState('')
  const [insight, setInsight] = useState<string | null>(null)

  const handleAsk = () => {
    if (!question.trim()) return
    // Placeholder: in a full implementation, this would call an AI or local analysis
    // and render a chart (Recharts) + 2–4 sentence insight.
    setInsight(
      `📌 INSIGHT (placeholder)\nYou asked: "${question.trim()}"\n\n` +
        `With ${dataset.variables.length} variables and ${dataset.rows.length} rows, the assistant would run the ` +
        `appropriate analysis, show a chart (bar/histogram/scatter/pie/boxplot), and write a 2–4 sentence ` +
        `summary in plain language. Add an AI backend or client-side stats (e.g. simple-correlation, jStat) ` +
        `to power this module.`
    )
  }

  return (
    <section>
      <h2>Insights & Chart Generator</h2>
      <p>Ask questions about your data in plain language. Examples:</p>
      <ul style={{ color: '#555', marginBottom: 16 }}>
        <li>Which variable has the most missing data?</li>
        <li>What&apos;s the relationship between age and income?</li>
        <li>Show me the distribution of responses for Q3.</li>
        <li>Are there any outliers? Summarize key findings.</li>
      </ul>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="e.g. Which variable has the most missing data?"
          style={{
            flex: 1,
            padding: '0.5rem 10px',
            borderRadius: 6,
            border: '1px solid #bdc3c7',
            fontSize: 16,
          }}
        />
        <button
          type="button"
          onClick={handleAsk}
          style={{
            padding: '0.5rem 1rem',
            background: '#9b59b6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Ask
        </button>
      </div>
      {insight && (
        <div
          style={{
            padding: 16,
            background: '#f4ecf7',
            borderLeft: '4px solid #9b59b6',
            borderRadius: 4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {insight}
        </div>
      )}
    </section>
  )
}
