---
name: marketing-data-analysis
description: Analyze marketing data from CSV or XLSX files or pasted tables (campaigns, funnels, traffic, conversions, spend, ROI). Use when the user asks to understand a spreadsheet, find what is working or not, compare periods or channels, or prepare numbers for a report.
version: 0.1.0
metadata:
  nova:
    tools: none
    tools_allowed_when:
      - '\.(csv|xlsx|xls)\b'
      - '[a-z]:[\\/]'
    triggers:
      - csv
      - xlsx
      - spreadsheet
      - planilha
      - campaign data
      - campaign results
      - dados de campanha
      - resultados da campanha
      - analyze the data
      - analyse the data
      - analisar os dados
      - analise de dados
      - data analysis
      - conversion rate
      - taxa de conversao
      - roas
      - roi
      - cpc
      - cpl
      - cac
      - ctr
      - metrics
      - metricas
      - kpi
      - kpis
---

# Marketing Data Analysis

Follow these steps in order. Explain results in plain language: the user is
learning, so define any technical term the first time you use it.

## 1. Understand the request
- Ask ONE question if the goal is unclear: what decision will this analysis
  support? (budget, channel choice, report, experiment result)
- If the data is pasted in the message, work from it directly and answer in
  plain text. Do NOT call any tool, and never invent a file name.
- Use tools only when the user gives a real file path. If the file cannot be
  found, ask for the correct path instead of guessing.

## 2. Inspect the data before analysing
- Look at the data. Report: number of rows, column names, date range, and
  obvious problems (empty cells, duplicates, mixed formats, outliers).
- Never guess column meanings. If a column is ambiguous, ask.
- If the file is large, work on a summary or a sample and say so.

## 3. Compute the metrics that matter
Pick only what the data supports:
- Volume: impressions, clicks, sessions, leads, orders.
- Rates: CTR = clicks / impressions, conversion rate = conversions / visits.
- Cost: CPC = spend / clicks, CPL = spend / leads, CAC = spend / new customers.
- Return: ROAS = revenue / ad spend, ROI = (revenue - cost) / cost.
Write every calculation in full as `numerator / denominator = result`, for
example `25 / 500 = 0.05 = 5%`. Never state a rate without showing it.
Calculate each value one at a time and double-check
it: compare rates using the SAME formula for every row, and make sure the
best and worst rows are ordered correctly. Only for large files use the
code interpreter.

## 4. Compare
- Period over period, channel vs channel, campaign vs campaign.
- Give absolute change AND percentage change.
- Mark differences that are too small or based on too few samples as "not
  reliable yet".

## 5. Report the findings
Use this structure:
1. **Headline**: the single most important finding in one sentence.
2. **Evidence**: 3 to 5 numbers that support it.
3. **Caveats**: data problems or limits of the conclusion.
4. **Next step**: one concrete action or experiment to run.

## Rules
- Only state numbers that come from the data. Never invent values.
- Separate facts (what the data shows) from interpretation (why it may
  have happened).
- Correlation is not proof of cause; say "suggests", not "proves".
