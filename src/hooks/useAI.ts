/**
 * useAI — Claude API integration hook for better insight reports.
 *
 * Three modes:
 *  1. ask(question, history) — free-text Q&A about the dataset
 *  2. routeQuery(question) — returns { testId, outcomeVar, predictorVars, groupVar, reason }
 *     so the caller can run the right test with the right variables
 *  3. interpretResult(result) — richer plain-English interpretation of a TestResult
 *
 * The dataset context (variable names, types, sample size, descriptive stats)
 * is sent with every request so Claude can reason about the actual data.
 *
 * API key is stored in React state only — never localStorage, never a server.
 */

import { useState, useCallback } from 'react'
import type { DatasetState } from '../types'
import type { TestResult, TestId } from '../lib/statsRunner'

// ─────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert statistician and data analyst assistant built into a web-based statistics tool. Your goal is to make statistical analysis accessible to everyone — from complete beginners to experienced researchers.

COMMUNICATION RULES:
- Always lead with the plain-language meaning before technical details.
- Never use statistical jargon without immediately explaining it in simple terms.
- When something is uncertain or assumptions may be violated, warn the user clearly.
- Never fabricate results. If you cannot answer from the data provided, say so clearly.
- Do not make causal claims from correlational data.
- Keep responses concise — 3–6 sentences for explanations, longer only if genuinely needed.

STATISTICAL KNOWLEDGE:
- You know when to use each test: t-test (2 groups, scale outcome), ANOVA (3+ groups), chi-square (2 categorical variables), Pearson/Spearman correlation (2 scale/ordinal variables), linear regression (predict scale outcome), logistic regression (predict binary outcome), Mann-Whitney (non-parametric group comparison), paired t-test (repeated measures), PCA (dimension reduction).
- You know effect size benchmarks: Cohen's d (small=0.2, medium=0.5, large=0.8), r (small=0.1, medium=0.3, large=0.5), R² (weak=0.1, moderate=0.25, strong=0.5), Cramér's V (weak=0.1, moderate=0.3, strong=0.5), η² (small=0.01, medium=0.06, large=0.14).
- Always check assumptions: normality (Shapiro-Wilk, sample size), equal variances (Levene's), independence, minimum cell counts for chi-square.
- Warn when n < 30 per group for parametric tests, n < 10 per cell for chi-square, or >20% missing values.

RESPONSE STYLE:
- Short, direct answers. No bullet lists unless listing multiple items.
- End with one concrete next step.
- Use "statistically significant" only when p < 0.05.`

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface AIResponse {
  text: string
  error?: string
}

export interface RouteQueryResult {
  testId: TestId
  outcomeVar: string | null
  predictorVars: string[]
  groupVar: string | null
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

export interface AIInterpretation {
  summary: string
  plainLanguage: string
  nextStep: string
  warnings: string[]
}

// ─────────────────────────────────────────────
// DATASET CONTEXT BUILDER
// ─────────────────────────────────────────────

function buildDatasetContext(dataset: DatasetState): string {
  const { variables, rows } = dataset
  const n = rows.length

  const varSummaries = variables
    .filter((v) => v.includeInAnalysis !== false)
    .map((v) => {
      const missing = (v.missingPct ?? 0) > 0 ? `, ${v.missingPct}% missing` : ''
      const uniqueVals =
        v.measurementLevel !== 'scale'
          ? (() => {
              const vals = new Set(rows.map((r) => r[v.name]).filter((x) => x != null && x !== ''))
              const preview = Array.from(vals).slice(0, 5).join(', ')
              return `, values: [${preview}${vals.size > 5 ? '…' : ''}]`
            })()
          : (() => {
              const nums = rows
                .map((r) => Number(r[v.name]))
                .filter((x) => !isNaN(x))
              if (nums.length === 0) return ''
              const mn = Math.min(...nums)
              const mx = Math.max(...nums)
              const avg = nums.reduce((a, b) => a + b, 0) / nums.length
              return `, range: ${mn}–${mx}, mean: ${avg.toFixed(1)}`
            })()
      return `  - "${v.label}" (${v.name}): ${v.measurementLevel}, ${v.variableType}${missing}${uniqueVals}`
    })
    .join('\n')

  return `DATASET CONTEXT:
Sample size: n = ${n}
Variables (${variables.length} total, ${variables.filter((v) => v.includeInAnalysis !== false).length} in analysis):
${varSummaries}

Available tests: freq, desc, missing, crosstab, corr, spearman, ttest, anova, linreg, logreg, mann, paired, pca`
}

// ─────────────────────────────────────────────
// CLAUDE API CALL
// ─────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemOverride?: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemOverride ?? SYSTEM_PROMPT,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = (err as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`
    throw new Error(msg)
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[]
  }
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

// ─────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────

export function useAI(apiKey: string, dataset: DatasetState | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const context = dataset ? buildDatasetContext(dataset) : ''

  const ask = useCallback(
    async (
      question: string,
      history: { role: 'user' | 'assistant'; content: string }[] = []
    ): Promise<AIResponse> => {
      if (!apiKey) return { text: '', error: 'No API key set.' }
      if (!dataset) return { text: '', error: 'No dataset loaded.' }
      setLoading(true)
      setError(null)
      try {
        const messages: { role: 'user' | 'assistant'; content: string }[] = [
          ...history,
          {
            role: 'user',
            content: `${context}\n\nUser question: ${question}`,
          },
        ]
        const text = await callClaude(apiKey, messages)
        return { text }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        return { text: '', error: msg }
      } finally {
        setLoading(false)
      }
    },
    [apiKey, context]
  )

  const routeQuery = useCallback(
    async (question: string): Promise<RouteQueryResult | null> => {
      if (!apiKey || !dataset) return null
      setLoading(true)
      setError(null)
      try {
        const varNames = dataset.variables
          .filter((v) => v.includeInAnalysis !== false)
          .map((v) => v.name)
          .join(', ')

        const prompt = `${context}

User question: "${question}"

Based on the dataset above, decide which statistical test best answers this question and which variables to use.

Respond ONLY with a valid JSON object — no explanation, no markdown, no backticks:
{
  "testId": one of [freq, desc, missing, crosstab, corr, spearman, ttest, anova, linreg, logreg, mann, paired, pca],
  "outcomeVar": variable name string or null,
  "predictorVars": array of variable name strings (can be empty),
  "groupVar": variable name string or null,
  "reason": one plain-English sentence explaining why this test fits,
  "confidence": "high" | "medium" | "low"
}

Variable names available: ${varNames}`

        const raw = await callClaude(apiKey, [{ role: 'user', content: prompt }])
        const clean = raw.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(clean) as RouteQueryResult
        return parsed
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [apiKey, context, dataset]
  )

  const interpretResult = useCallback(
    async (result: TestResult): Promise<AIInterpretation | null> => {
      if (!apiKey || !dataset) return null
      setLoading(true)
      setError(null)
      try {
        const resultSummary = JSON.stringify({
          testName: result.testName,
          keyStat: result.keyStat,
          insight: result.insight,
          effectSize: result.effectSize,
          effectSizeLabel: result.effectSizeLabel,
          variablesAnalyzed: result.variablesAnalyzed,
          tablePreview: result.table.slice(0, 6),
        })

        const prompt = `${context}

Statistical test result:
${resultSummary}

Provide a richer interpretation of this result specific to this dataset's context and variable names.

Respond ONLY with a valid JSON object — no explanation, no markdown, no backticks:
{
  "summary": "2-3 sentence interpretation using the actual variable names from the dataset",
  "plainLanguage": "1 sentence in plain English a non-statistician would understand",
  "nextStep": "1 concrete next analysis step",
  "warnings": ["array of 0-3 short warning strings if assumptions or data quality issues apply, else empty array"]
}`

        const raw = await callClaude(apiKey, [{ role: 'user', content: prompt }])
        const clean = raw.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(clean) as AIInterpretation
        return parsed
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [apiKey, context]
  )

  return { ask, routeQuery, interpretResult, loading, error }
}
