# Content pack format (`db-analyst-simulator/pack@1`)

A pack is one JSON file. The game loads every file listed in `public/packs/manifest.json`, plus any packs a student imports from the Home tab. Packs are merged: databases are keyed by `id`, challenges are concatenated, and `notation` overrides are applied in manifest order (later packs win).

```json
{
  "format": "db-analyst-simulator/pack@1",
  "id": "week3",
  "title": "Week 3 — ER modeling",
  "description": "optional",
  "notation": { },
  "companies": [ ],
  "databases": [ ],
  "design": [ ],
  "queries": [ ],
  "presentation": [ ],
  "vizSprints": [ ]
}
```

Every section is optional. The TypeScript source of truth is `src/types/content.ts`; `npm run validate` checks packs against it and against the graders.

## `notation` — vocabulary, symbols, rules

Partial override of `src/content/defaultNotation.ts` (deep-merged). See `prompts/01-import-notation.md` for every field. Highlights:

| Path | Meaning |
|---|---|
| `er.terms.*` | words used in feedback (`uniqueAttribute`, `weakEntity`, …) |
| `er.maxOne`, `er.maxMany`, `er.minZero`, `er.minOne`, `er.symbolOrder` | line-end symbols drawn on the ER canvas |
| `er.cardinalityText` | how `1:M` is written in feedback |
| `er.reminders[]` | shown next to the ER editor |
| `relational.mappingRules[]` | shown next to the schema editor |
| `relational.namingCase` | `snake` / `pascal` / `camel` / `upper` / `free` (advisory) |
| `sql.dialectNotes[]`, `sql.style[]` | shown next to the DDL editor |
| `viz.principles[]` | chart-choice rules; machine-checked kinds: `maxPieSlices`, `requireTitle`, `lineNeedsOrderedAxis`, `maxSeries`, `barNotForTime`; `advisory` is display-only |

## `companies[]` — employers as difficulty tiers

```json
{
  "id": "dave",
  "name": "Dave's Gig Log",
  "tier": "easy",
  "logo": "🛵",
  "contact": "Dave",
  "tagline": "one line for the job card",
  "description": "2–3 sentences shown in the help panel"
}
```

Every design challenge, query set and presentation challenge carries a `company` id. The company picker sorts companies by tier. Shipped: `dave` (easy), `utt` (medium), `mega` (hard).

## `databases[]`

```json
{
  "id": "riverbend",
  "name": "Riverbend Cycles",
  "description": "shown in sidebars",
  "ddl": ["CREATE TABLE ...", "..."],
  "seed": ["INSERT INTO ...", "..."],
  "tableNotes": { "SoldVia": "one row per product per transaction" }
}
```

SQLite syntax. Statements run in order with foreign keys enforced. The Present module derives table relationships from `FOREIGN KEY` clauses, so declare them.

## `design[]` — ER → relational schema → DDL

```json
{
  "id": "vet-clinic",
  "company": "riverbend",
  "title": "Riverbend Veterinary Clinic",
  "difficulty": 2,
  "brief": "requirements text; paragraphs separated by \n\n",
  "hints": ["optional"],
  "er": { "entities": [], "relationships": [] },
  "schema": { "tables": [], "notes": [], "alternates": [] },
  "ddl": { "tests": [] },
  "points": { "er": 100, "schema": 100, "ddl": 100 }
}
```

### `er.entities[]`

```json
{
  "name": "OWNER",
  "aliases": ["PetOwner"],
  "weak": false,
  "attributes": [
    { "name": "OwnerID", "aliases": ["ID"], "key": true },
    { "name": "Address", "composite": ["Street", "City", "Zip"] },
    { "name": "Phone", "multivalued": true },
    { "name": "Age", "derived": true },
    { "name": "LogNo", "partialKey": true },
    { "name": "Nickname", "optional": true }
  ]
}
```

### `er.relationships[]`

```json
{
  "name": "Owns",
  "aliases": ["Has"],
  "identifying": false,
  "sides": [
    { "entity": "OWNER", "max": "1", "min": "mandatory", "role": "optional, for unary" },
    { "entity": "PET",   "max": "M", "min": "optional" }
  ],
  "attributes": [],
  "rationale": "quoted in feedback when cardinality is wrong"
}
```

**Side semantics.** A side describes the symbols at *that entity's* end of the line: how many of that entity relate to one instance of the other. `max` ∈ `"1" | "M"`, `min` ∈ `"mandatory" | "optional"`. Cardinality is reported as `sides[0].max : sides[1].max`, so list the "1" side first for 1:M. Unary relationships name the same entity twice with `role`s.

### `schema.tables[]`

```json
{
  "name": "PET",
  "aliases": [],
  "note": "shown if the table is missing",
  "columns": [
    { "name": "PetID", "aliases": ["ID"], "type": "INT", "nullable": false },
    { "name": "OwnerID" },
    { "name": "AccountID", "unique": true }
  ],
  "pk": ["PetID"],
  "fks": [{ "columns": ["OwnerID"], "refTable": "OWNER", "refColumns": ["OwnerID"] }]
}
```

`schema.alternates[]` holds complete alternative table lists (e.g. the 1:1 FK on the other side); the best-scoring variant is used. `schema.notes[]` are shown after grading.

### `ddl.tests[]`

```json
{ "description": "A pet with a non-existent owner is rejected.", "sql": "INSERT INTO PET (...) VALUES (...)", "expect": "error" }
```

Tests use reference names; the grader rewrites them to the student's table/column names (via the same lenient matching used for grading) and runs them in order on the student's database. Multiple statements may be separated by `;`.

### How design grading works

- Names are matched case-insensitively, ignoring plurals, punctuation, and common abbreviations (`Cust`, `Qty`, `No`, `DOB`, …), plus the explicit `aliases`. A column may also be matched with the table name stripped (`Customer.CustID` ≈ `Customer.ID`).
- **ER**: grading is about the *amount and nature* of the model, not the names. Entities and attributes are paired by name where possible and **by structure otherwise** (attribute counts, attribute types, weak flag, number of relationships), so a correctly drawn entity called `THING` still counts. Points: entity present (6 each), weak flag (3), each attribute present (2) + key/multivalued/derived/composite/partial-key type (1–2 each), relationship present (4), cardinality (6, half credit for one side), participation (4, half credit), identifying (2). Extra entities/relationships are warnings unless excessive. Scaled to `points.er`.
  The report shows **broad feedback only** ("VEHICLE: 4 of 5 attributes present; missing one (one derived)", "relationship VEHICLE–GIG: cardinality wrong on one side"). The exact errors, including `rationale`, are attached to the grade as hidden items and handed to the professor chat so it can nudge without reciting the answer.
- **Schema**: table present (6), column present (2), `unique` column is UNIQUE or PK (2), PK correct (4), each FK (4), penalties for wrong FKs and too many extra tables. Scaled to `points.schema`.
- **DDL**: script runs (10) + schema grade of the introspected database (70) + tests (20 shared). Scaled to `points.ddl`.

## `queries[]` — sprint question sets

```json
{
  "id": "riverbend-sql",
  "company": "riverbend",
  "title": "Riverbend Cycles — SQL sprint",
  "database": "riverbend",
  "questions": [
    {
      "id": "q04",
      "topic": "select-where",
      "difficulty": 1,
      "points": 10,
      "text": "List the names of products priced above ${{price}}.",
      "sql": "SELECT ProductName FROM Product WHERE Price > {{price}}",
      "params": { "price": { "values": [30, 50, 100] } },
      "orderMatters": false,
      "hints": ["Use a WHERE clause."]
    }
  ]
}
```

- `params.<name>` is `{ "values": [...] }` or `{ "from": "SELECT ..." }` (first column of the result). Placeholders are `{{name}}`; quote string params inside the SQL yourself.
- The generator redraws parameters up to 10 times to avoid empty reference results.
- Grading: the student's result must have the same number of columns and the same multiset of rows as the reference (numbers compared to 2 decimals, strings case-insensitively, column order free). With `orderMatters`, row order must match too.
- Topics: `select-basic`, `select-where`, `distinct-order`, `like-in-between`, `aggregate`, `group-by`, `having`, `join`, `multi-join`, `alias`, `subquery`, `set-ops`, `exists`, `self-join`, `null`, `outer-join`, `view`, `dml` (the last two are not usable in sprints, which allow SELECT only).
- Default points by difficulty: 10 / 15 / 20 / 30 / 40.

## Diagramming sprints (generated, no content needed)

The Diagramming module's sprint generates questions from the `design[]` reference solutions: draw one entity with its attributes, model one relationship (both entities with only their identifying attributes), draw an entity with all its relationships, or map an ER fragment to tables. Mini-briefs are rendered from the reference structure (`describeEntity`, `describeRelationship` in `src/lib/designSprint.ts`), so the clearer your entity and attribute names, the better the generated text reads. A mapping question's table subset is derived from `schema.tables`: the tables matched to the entities involved (foreign keys to tables outside the fragment are dropped) plus any bridge / multivalued-attribute tables whose foreign keys all stay inside the fragment. `npm run validate` generates every question and confirms its reference answer scores 100%.

## `presentation[]` — challenges in the Viz workbench

```json
{
  "id": "p2-revenue-by-category",
  "company": "riverbend",
  "title": "Revenue by category",
  "difficulty": 2,
  "database": "riverbend",
  "brief": "Which product categories bring in the most money? ...",
  "hints": [],
  "expected": {
    "types": ["clusteredBar", "clusteredColumn"],
    "axis": { "table": "Category", "column": "CategoryName" },
    "legend": { "table": "Region", "column": "RegionName" },
    "values": [{ "field": { "table": "SoldVia", "column": "LineTotal" }, "agg": "sum" }],
    "columns": [{ "table": "Product", "column": "ProductName" }],
    "filters": [{ "field": { "table": "Region", "column": "RegionName" }, "op": "in", "values": ["West"] }],
    "sort": { "by": "value", "dir": "desc" },
    "requireTitle": true
  },
  "referenceSql": "SELECT ... ORDER BY 2 DESC",
  "points": 100
}
```

- The same challenge is playable in any of the three workbench skins (Power BI-, Tableau- or ggplot-style); the student picks the tool, the grading is identical.
- Visual types: `clusteredColumn`, `clusteredBar`, `stackedColumn`, `line`, `pie`, `donut`, `card`, `table`.
- Aggregations: `sum`, `avg`, `count`, `countDistinct`, `min`, `max` (`agg` may be a list of acceptable values). `columns` is for `table` visuals only.
- Filters: `op` ∈ `in`, `eq`, `gte`, `lte`, `between`.
- Grading: type (20), each field/aggregation (8–12), data matches `referenceSql` (10), each filter (12), sort (8), title (6), and −4 per violated principle. If the student's data equals the reference data, field items are accepted even when the field choice differs.
- The visual builder joins tables along foreign keys (shortest path), aggregates with GROUP BY, and applies the default sort (value-desc for bars/pies, axis-asc for lines) when the student has not chosen one; the effective sort is what gets graded.
- **Calculated fields.** Students can define ad-hoc fields in any skin ("New measure / New column", "Create Calculated Field…", `mutate()`). An expression is SQLite syntax over column names written as `Column`, `Table.Column`, `Table[Column]` or `[Column]`; if it contains an aggregate (`SUM(Fee) / SUM(Views)`) it is used as-is as a measure, otherwise it is a row-level column that the well aggregates. Ambiguous bare column names must be qualified. Because grading accepts any visual whose data equals `referenceSql`, calculated fields never need to be declared in content.

## `vizSprints[]` — timed chart drill

```json
{
  "id": "dave-viz-sprint",
  "company": "dave",
  "title": "Dave's Gig Log — viz sprint",
  "database": "dave",
  "questions": [
    {
      "id": "dv20",
      "topic": "calc",
      "difficulty": 3,
      "text": "Total pay including tips, per platform name. Define a calculated field: Earnings + Tips.",
      "sql": "SELECT P.PlatformName, SUM(G.Earnings + G.Tips) FROM Gig G JOIN Platform P ON G.PlatformID = P.PlatformID GROUP BY P.PlatformName",
      "types": ["clusteredColumn", "clusteredBar"],
      "params": { },
      "orderMatters": false,
      "requireTitle": false,
      "hints": ["Create the field, then sum it on the y-axis."]
    }
  ]
}
```

- Same template mechanics as `queries[]` (`{{params}}`, `values` / `from`, redraws on empty results, default points 10/15/20/30/40 by difficulty).
- Grading per submit: the visual's data must equal the reference result (`compareResults`, row order only with `orderMatters`), `types` must include the student's visual type, `requireTitle` demands a title, and any machine-checked `viz.principles` violation blocks a correct answer. Everything else (field choice, aggregation, calculated fields) is free.
- The reference SQL must return the dimensions first, then one column per measure; a card returns one column, one row. See `prompts/06-viz-sprint-pack.md`.
- Topics: `single-value`, `compare`, `trend`, `part-whole`, `table`, `filter`, `calc`, `two-dim`, `sort`.
