---
name: marketing-data-analysis
description: Analyze marketing data from CSV or XLSX files or pasted tables (campaigns, funnels, traffic, conversions, spend, ROI). Use when the user asks to understand a spreadsheet, find what is working or not, compare periods or channels, or prepare numbers for a report.
version: 0.1.0
---

# Marketing Data Analysis

Follow these steps in order. Explain results in plain language: the user is
learning, so define any technical term the first time you use it.

## 1. Understand the request
- Ask ONE question if the goal is unclear: what decision will this analysis
  support? (budget, channel choice, report, experiment result)
- Confirm the file path or the pasted data.

## 2. Inspect the data before analysing
- Read the file. Report: number of rows, column names, date range, and
  obvious problems (empty cells, duplicates, mixed formats, outliers).
- Never guess column meanings. If a column is ambiguous, ask.
- If the file is large, work on a summary or a sample and say so.

## 3. Compute the metrics that matter
Pick only what the data supports:
- Volume: impressions, clicks, sessions, leads, orders.
- Rates: CTR = clicks / impressions, conversion rate = conversions / visits.
- Cost: CPC = spend / clicks, CPL = spend / leads, CAC = spend / new customers.
- Return: ROAS = revenue / ad spend, ROI = (revenue - cost) / cost.
Show the formula used. Use the code interpreter for calculations; do not
do arithmetic in your head.

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
