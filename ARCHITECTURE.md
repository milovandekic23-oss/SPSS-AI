# Statistics Assistant — App Architecture & Connections

Reference document for continuing work. Describes how the app is structured and how pieces connect.

---

## 1. High-level architecture

```
main.tsx
  └── App.tsx (root state: dataset, activeModule, apiKey)
        ├── Header (title, description, ApiKeyInput)
        ├── Nav (tabs: Variable View | Test Suggester | Insights & Charts)
        ├── DataReadinessPanel (when variableViewConfirmed)
        └── Main (MainErrorBoundary)
              ├── VariableView   (when activeModule === 'variable')
              ├── TestSuggester  (when activeModule === 'tests' && variableViewConfirmed)
              └── Insights       (when activeModule === 'insights' && variableViewConfirmed)
```

- **Single source of truth:** `dataset` and `apiKey` live in App state. All modules receive `dataset` (and `apiKey` for Insights) as props; updates go through `setDataset` / `setApiKey`.
- **Gating:** Test Suggester and Insights are only usable after Variable View is confirmed and Data Readiness allows it (`canProceedToTests(readiness)`). Variable View is always available.

---

## 2. Data flow (dataset lifecycle)

1. **Upload (VariableView)**  
   User uploads CSV → `parseCSV()` (lib/csvParse) → `{ variables, rows }` with inferred types/measurement levels → `onDatasetChange({ variables, rows, variableViewConfirmed: false, questionGroups: [] })` → App state updated.

2. **Variable View (VariableView)**  
   User edits variable metadata (type, label, measure, role, missing codes, value labels, “In analysis”), and/or creates/assigns **question groups** (checkbox, multi_select, matrix, etc.). Each change calls `onDatasetChange({ ...dataset, variables | questionGroups })`.  
   Optional: “Apply suggestions” for question groups uses `suggestQuestionGroups()` (lib/questionGroups) and `applySuggestedQuestionGroups()`.

3. **Confirm (VariableView)**  
   User clicks “Process Data” → `onDatasetChange({ ...dataset, variableViewConfirmed: true })`.  
   After this, Data Readiness panel appears and Test Suggester / Insights tabs become enabled (if readiness allows).

4. **Data Readiness (DataReadinessPanel)**  
   Reads `dataset` (must have `variableViewConfirmed`). Calls `checkDataReadiness(dataset)` (lib/dataReadiness).  
   - **Missing %:** Variables in `questionGroups` with type `checkbox` / `multi_select` / `matrix` are **skipped** (no missing items for those columns).  
   - **One-click actions:** “Exclude from analysis”, “Exclude all critical”, “Remove duplicate rows”, “Winsorize” / “Remove outlier rows” call `onDatasetChange` with updated `variables` or `rows`.  
   - **canProceedToTests(result):** Used by App to enable/disable Test Suggester and Insights.

5. **Test Suggester (TestSuggester)**  
   User picks a test → `runTest(testId, dataset, selectedVars?)` (lib/statsRunner) → `TestResult` → `TestResultPanel`.

6. **Insights (Insights)**  
   - **Without API key:** “Generate report” → `runInsightsReport(dataset)` (lib/insightsReport) → rule-based report; export via `exportReportHTML` / `openReportInNewTab` / `downloadReport` (lib/insightsEngine).  
   - **With API key:** Same report **plus** AI question box (useAI: `routeQuery` → `runTest` → `interpretResult`) and per-finding “Get AI interpretation” (useAI: `interpretResult`).

---

## 3. Key modules (UI)

| Module | Role | Key props | Key dependencies |
|--------|------|-----------|------------------|
| **VariableView** | CSV upload, variable metadata, question groups | `dataset`, `onDatasetChange` | parseCSV, suggestQuestionGroups, applySuggestedQuestionGroups |
| **DataReadinessPanel** | Readiness checklist, one-click fixes | `dataset`, `onDatasetChange`, `onOpenVariableView` | checkDataReadiness, canProceedToTests, removeDuplicateRows, winsorizeVariable, removeOutlierRowsByIQR |
| **TestSuggester** | Test cards, run test, show result | `dataset` | runTest, getSuggestedVariables, TestResultPanel |
| **Insights** | Report generation, AI Q&A, per-finding AI interpretation | `dataset`, `apiKey` | runInsightsReport, getHeadline, exportReportHTML, openReportInNewTab, downloadReport, useAI, runTest, TestResultPanel |
| **ApiKeyInput** | Header API key entry (session only) | `apiKey`, `onApiKeyChange` | theme, styles |
| **TestResultPanel** | Renders a single TestResult (table, chart, insight) | `result` | theme, Recharts |

---

## 4. Lib layer (core logic)

| File | Role |
|------|------|
| **csvParse** | `parseCSV(text)` → `{ variables: VariableMeta[], rows: DataRow[] }`. Infers measurement level, variable type; builds initial VariableMeta; normalizes row keys. |
| **dataReadiness** | `checkDataReadiness(dataset)` → DataReadinessResult (items, score, level, missingPctByVar, outlierSummaries, etc.). Skips missing-% for vars in checkbox/multi_select/matrix question groups. `canProceedToTests(result)`. Helpers: `removeDuplicateRows`, `winsorizeVariable`, `removeOutlierRowsByIQR`. |
| **questionGroups** | `suggestQuestionGroups(dataset)` → suggested QuestionGroup[] (stem + binary heuristics). `applySuggestedQuestionGroups(dataset, suggested)` → new DatasetState with questionGroups set. |
| **statsRunner** | `runTest(testId, dataset, selectedVars?)` → TestResult \| null. Implements all tests (freq, desc, missing, crosstab, corr, spearman, ttest, anova, linreg, logreg, mann, paired, pca, goodness, onesamplet, pointbiserial). `getSuggestedVariables(testId, dataset)`. |
| **insightsReport** | `runInsightsReport(dataset)` → InsightsReport (findings, keyHeadlines, contradictions, dataQuality, generatedAt). Each finding: result, validation, isKey, interestScore, narrative, followUp, warnings. `getHeadline(result)`. Contradiction detection, data quality summary. |
| **insightsEngine** | `exportReportHTML(report, datasetName)` → HTML string. `openReportInNewTab(html)`, `downloadReport(html, filename)`. Helpers for narrative/followUp/score. |
| **resultValidator** | `validateTestResult(result)` → { consistent, issues }. |
| **testChoiceValidator** | Validation for test choice / variable selection. |

---

## 5. Hooks

| Hook | Role |
|------|------|
| **useAI(apiKey, dataset)** | Claude API integration. `ask(question, history)` → Q&A text. `routeQuery(question)` → { testId, outcomeVar, groupVar, predictorVars, reason, confidence }. `interpretResult(result)` → { summary, plainLanguage, nextStep, warnings }. Builds dataset context (variable names, types, measurement levels, missing %, value ranges) — no raw rows sent. |

---

## 6. Types (src/types.ts)

- **VariableMeta:** name, label, measurementLevel, variableType, role, valueLabels, missingCodes, missingPct, includeInAnalysis.
- **QuestionGroup:** id, label, type (checkbox | multi_select | matrix | dropdown | ranking | group), variableNames.
- **DataRow:** `Record<string, string | number | null>`.
- **DatasetState:** variables, rows, variableViewConfirmed, questionGroups.

Used everywhere: VariableView, Data Readiness, statsRunner, insightsReport, useAI.

---

## 7. How AI is wired

- **ApiKeyInput** in header: key in React state only; when set, shows “🔑 AI enabled”.
- **Insights** receives `apiKey`. If set:
  - **AI question box:** User types question → `routeQuery(question)` → Claude returns testId + variables → `runTest(testId, dataset, selectedVars)` → `interpretResult(testResult)` → show result + AI interpretation + TestResultPanel.
  - **Report findings:** Each finding has a “Get AI interpretation” button → `interpretResult(result)` → show summary, plain language, next step, warnings (lazy, on click).
- **useAI** builds context from `dataset` (variable names, types, measurement levels, missing %, value ranges). No row data sent to the API.

---

## 8. File map (quick reference)

```
src/
  main.tsx              # Entry: createRoot, App
  App.tsx                # State (dataset, activeModule, apiKey), layout, DataReadinessPanel, tabs, MainErrorBoundary
  types.ts               # VariableMeta, QuestionGroup, DatasetState, DataRow, etc.
  theme.ts               # theme, styles

  modules/
    VariableView.tsx     # Upload CSV, variable table, question groups, Process Data
    DataReadinessPanel.tsx # Checklist, one-click actions, “Exclude all critical”
    TestSuggester.tsx    # Test cards, run test, TestResultPanel
    Insights.tsx         # AI question box, Generate report, ReportView, FindingBlock (+ AI interpretation)
    ApiKeyInput.tsx      # API key input in header (session only)
    TestResultPanel.tsx  # Renders one TestResult (table, chart, insight)

  hooks/
    useAI.ts             # ask, routeQuery, interpretResult (Claude); buildDatasetContext

  lib/
    csvParse.ts          # parseCSV
    dataReadiness.ts     # checkDataReadiness, canProceedToTests, multiResponseOptionVarNames, actions
    dataReadiness.test.ts
    questionGroups.ts    # suggestQuestionGroups, applySuggestedQuestionGroups
    statsRunner.ts       # runTest, getSuggestedVariables, TestId, TestResult
    insightsReport.ts    # runInsightsReport, getHeadline, ReportFinding, InsightsReport, contradictions, dataQuality
    insightsReport.test.ts
    insightsEngine.ts    # exportReportHTML, openReportInNewTab, downloadReport
    resultValidator.ts
    resultValidator.test.ts
    testChoiceValidator.ts
    testChoiceValidator.test.ts
    statisticalGuidance.ts
```

---

## 9. Important connections (for tomorrow)

- **Variable View → Data Readiness:** When user assigns columns to a checkbox/multi_select/matrix question group, `dataset.questionGroups` changes → `checkDataReadiness` skips missing-% for those vars → Missing % items for those columns disappear immediately (same dataset reference, useMemo in DataReadinessPanel).
- **Data Readiness → Test Suggester / Insights:** `canProceedToTests(readiness)` is derived in App from `getDataReadinessForApp(dataset)` and `canProceedToTests(readiness)`; tabs are enabled/disabled and nav respects it.
- **Insights report vs AI:** Report is always rule-based (`runInsightsReport`). AI adds: (1) question box that routes to a test and shows AI interpretation, (2) optional “Get AI interpretation” per finding. Export/regenerate use the same report (exportReportHTML, openReportInNewTab, downloadReport).
- **Changing dataset:** Any `onDatasetChange(newState)` updates App state; VariableView, DataReadinessPanel, TestSuggester, and Insights all receive the same `dataset` (or `dataset` + `apiKey` for Insights).

Use this doc to jump back into the codebase and see how new changes should plug into the existing flow.
