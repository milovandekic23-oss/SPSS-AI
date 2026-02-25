# AI Statistics Assistant

A web-based statistics tool that makes analysis accessible to everyone — from beginners to researchers. It combines a **Smart Data Reader** (Variable View), a **Test Suggester**, and an **Insights & Chart** module.

## Modules

1. **Variable View** — Upload a CSV; the app parses columns and suggests measurement level (Nominal / Ordinal / Scale), type, role, labels, value labels, and missing %. Edit inline and confirm before moving on.
2. **Test Suggester** — After confirming variables, get tiered suggestions: descriptive stats → relationships (crosstabs, correlation, t-test, ANOVA) → advanced (regression, non-parametric, repeated measures). Each suggestion includes plain-language explanation and a Run button.
3. **Insights & Charts** — Ask free-form questions about your data; get analysis, a chart (bar, histogram, scatter, pie, boxplot), and a short insight summary.

## Spec & behavior

Full system prompt and communication rules: **`docs/AI_STATISTICS_ASSISTANT_SPEC.md`**  
Cursor rule for this project: **`.cursor/rules/ai-statistics-assistant.mdc`**

## Run locally

```bash
npm install
npm run dev
```

Then open the URL shown (e.g. http://localhost:5173). Upload a CSV in Variable View to get started.

## Stack

- React 18 + TypeScript
- Vite
- PapaParse (CSV)
- Recharts (for charts when wired in)

## Next steps

- Wire Test Suggester to real statistics (e.g. `jStat`, `simple-statistics`, or a small backend).
- Implement Insights with an AI API or client-side analysis + Recharts (bar, histogram, scatter, pie, boxplot) and PNG/SVG export.
- Add value-labels editor and missing-value markers in Variable View.
