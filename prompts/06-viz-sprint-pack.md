# Prompt 06 — Generate viz sprint questions

Copy everything below the line into Claude. Paste: the database definition (`databases[0]` from a `*-db.json` pack) and, optionally, the existing `vizSprints` section of `public/packs/dave-challenges.json` as a worked example.

---

You are writing content for **DB Analyst Simulator**, a teaching game for an introductory databases course. Its **Viz sprint** is a timed drill: the student gets a short business question and must build the visual (in a Power BI-, Tableau- or ggplot-style workbench) whose numbers match a reference SQL query. Grading compares the visual's data with the reference result (column names and column order do not matter; row order only matters when the question asks for sorting), checks that the visual type is one of the acceptable types, and optionally requires a title. Students may define **calculated fields** (`Earnings + Tips`, `SUM(Fee) * 1000.0 / SUM(Views)`), so any field choice that yields the same numbers is accepted.

Produce ONE JSON content pack containing a `vizSprints` array. Output only the JSON in a single code block.

## What I want

<e.g. "25 questions on the Dave database: 4 single-number cards, 6 category comparisons, 3 trends, 2 part-to-whole, 2 tables, 3 filtered (with parameters), 3 calculated fields, 2 two-dimension, 2 sorted.">

## Output format

```json
{
  "format": "db-analyst-simulator/pack@1",
  "id": "<pack id>",
  "title": "<pack title>",
  "vizSprints": [
    {
      "id": "dave-viz-sprint",
      "company": "dave",
      "title": "Dave's Gig Log — viz sprint",
      "database": "dave",
      "questions": [
        {
          "id": "dv17",
          "topic": "filter",
          "difficulty": 3,
          "text": "Monthly total earnings (GigMonth), but only for gigs on {{platform}}.",
          "sql": "SELECT G.GigMonth, SUM(G.Earnings) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID WHERE P.PlatformName = '{{platform}}' GROUP BY G.GigMonth",
          "types": ["line", "clusteredColumn"],
          "params": { "platform": { "from": "SELECT PlatformName FROM Platform" } },
          "orderMatters": false,
          "requireTitle": false,
          "hints": ["Drop PlatformName into the filters and tick one value."]
        }
      ]
    }
  ]
}
```

### Rules for the reference SQL

- The workbench builds `SELECT dim1, dim2, AGG(measure) … GROUP BY dim1, dim2`. Your reference must return **the dimensions first, then one column per measure**, and nothing else. A card returns exactly one column and one row.
- Use the human-readable column for the axis (`PlatformName`, not `PlatformID`); join through foreign keys exactly as the database declares them.
- Integer division: SQLite divides integers as integers. When a calculated field is intended to be fractional, write the constant as `1000.0`, `100.0`, `60.0` and put the same expression in the question text so the student can copy it.
- `orderMatters: true` only for questions that say "ranked / highest first / lowest first"; then end the SQL with `ORDER BY 2 DESC` (or `ASC`) and avoid measures that can tie.
- Parameters: `{{name}}` placeholders with `params.name` = `{ "values": [...] }` or `{ "from": "SELECT …" }` (first column). Make sure every draw yields rows (e.g. pick statuses that actually have transactions).

### Topics and difficulty

`single-value` (1), `compare` (2), `trend` (2), `part-whole` (2), `table` (2–3), `filter` (3), `calc` (3–4), `two-dim` (4), `sort` (3). Visual types: `clusteredColumn`, `clusteredBar`, `stackedColumn`, `line`, `pie`, `donut`, `card`, `table` — list every defensible type, best first.
