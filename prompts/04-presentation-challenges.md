# Prompt 04 — Generate presentation (Power BI-style) challenges

Copy everything below the line into Claude. Paste: your visualization unit notes and the database definition the challenges should use (e.g. `databases[0]` from `public/packs/riverbend-db.json`).

---

You are writing content for **DB Analyst Simulator**, a teaching game for an introductory databases course. Its **Present** module imitates Microsoft Power BI: a report canvas, a *Visualizations* pane with chart types and field wells (X-axis / Legend / Y-axis, or Columns for a table), a *Fields* pane listing every table and column, and a *Filters* pane. Relationships between tables come from the database's foreign keys, so a student can combine fields from several tables and the game builds the join automatically. Each challenge is a business question; the student builds a visual and the game grades chart type, fields, aggregation, filters, sorting, title, and any visualization principles from my unit.

Produce ONE JSON content pack containing a `presentation` array (and, if my notes define chart-choice rules, a `notation.viz.principles` array). Output only the JSON in a single code block.

## What I want

<e.g. "Ten challenges of increasing difficulty on the Riverbend database that exercise: a single-number KPI, category comparison, time trend, filtered comparison, part-to-whole, a legend breakdown, a table, and two 'trap' questions where the obvious chart violates one of my principles.">

## Output format

```json
{
  "format": "db-analyst-simulator/pack@1",
  "id": "<pack id>",
  "title": "<pack title>",
  "presentation": [
    {
      "id": "p-monthly-trend",
      "company": "<employer id: dave | utt | mega, or a company defined in this pack>",
      "title": "Monthly revenue trend",
      "difficulty": 2,
      "database": "riverbend",
      "brief": "<the business question, 1–3 sentences; say what to show, over what, and whether a title/sort/filter is required>",
      "hints": ["<1–3 nudges>"],
      "expected": {
        "types": ["line"],
        "axis": { "table": "SalesTransaction", "column": "TMonth" },
        "legend": { "table": "Region", "column": "RegionName" },
        "values": [{ "field": { "table": "SoldVia", "column": "LineTotal" }, "agg": "sum" }],
        "columns": [{ "table": "Product", "column": "ProductName" }],
        "filters": [{ "field": { "table": "Region", "column": "RegionName" }, "op": "in", "values": ["West"] }],
        "sort": { "by": "axis", "dir": "asc" },
        "requireTitle": true
      },
      "referenceSql": "SELECT T.TMonth, SUM(S.LineTotal) FROM SalesTransaction T JOIN SoldVia S ON T.TID = S.TID GROUP BY T.TMonth ORDER BY 1",
      "points": 100
    }
  ],
  "notation": {
    "viz": {
      "principles": [
        { "id": "pie-slices", "text": "<rule in my words>", "check": { "kind": "maxPieSlices", "max": 6 } }
      ]
    }
  }
}
```

### Field semantics

- `types`: acceptable visual types, best first. Allowed: `clusteredColumn`, `clusteredBar`, `stackedColumn`, `line`, `pie`, `donut`, `card`, `table`. List every type that a reasonable analyst could defend; the first is used as the ideal.
- `axis`: the category field (for pie/donut this is the slice field). May be a list of acceptable fields. `legend`: optional series field. `values`: measures with aggregation `sum`, `avg`, `count`, `countDistinct`, `min`, `max` (or a list of acceptable aggregations, e.g. `["count","countDistinct"]` for an ID). `columns`: only for `table` (unaggregated columns; put summed measures in `values`).
- `filters`: `op` is `in` (values list), `eq`, `gte`, `lte`, or `between` (two values). Filter on the human-readable column (RegionName, not RegionID).
- `sort`: `by` is `axis` or `value`. Omit it when order does not matter. Bars/pies default to value-descending and lines to axis-ascending, so only require what the question actually states.
- `referenceSql` **is required**: a SQLite query that returns exactly the data the ideal visual shows, dimension columns first (axis, then legend), then the measure(s), with ORDER BY matching `sort`. It lets the grader accept a different but equivalent field choice (e.g. counting a different column that yields the same numbers).
- Only fields that exist in the database. For "revenue" use a stored line total column if the database has one; the visual builder cannot multiply columns.
- `notation.viz.principles[].check.kind`: `maxPieSlices` (with `max`), `requireTitle`, `lineNeedsOrderedAxis`, `maxSeries` (with `max`), `barNotForTime`, or `advisory` (shown, never enforced). Use `advisory` for rules that cannot be checked mechanically.

### Rules

- Difficulty 1 = one field/card; 2 = axis + measure; 3 = adds a filter or a specific aggregation; 4 = legend breakdown or a principle trap; 5 = two or more of those.
- The brief must state everything the grader will check (a required title, sort direction, filter) in plain business language, and must not name the chart type unless that is the point of the question.
- Each challenge should require joining at least two tables when difficulty ≥ 2 (that is what makes the model view useful).
- If my notes contain chart-choice rules, encode them as principles and write at least one "trap" challenge where the naive choice violates a rule (e.g. 30 categories → pie).

## Checklist before you answer

- `referenceSql` runs in SQLite and its columns correspond to axis, legend, value(s) in that order.
- Every `table`/`column` exists in the database; `database` matches its `id`.
- Valid JSON.

## Materials

<paste visualization unit and database definition here>
