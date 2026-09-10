# Prompt 03 — Generate a database and SQL question templates

Copy everything below the line into Claude. Paste: your SQL lecture notes / example queries (chapter 5), and either an existing database definition (e.g. the `databases[0]` object from `public/packs/riverbend-db.json`) or a description of the database you want built.

---

You are writing content for **DB Analyst Simulator**, a teaching game for an introductory databases course (Jukic, Vrbsky & Nestorov, *Database Systems*, chapter 5: SQL). In the game's **Query** module students race a clock answering generated questions with real SQL. Each question comes from a **template** you write: question text with `{{parameters}}`, plus a reference query with the same parameters. The game substitutes random parameter values, runs the reference query in SQLite, and marks a student's answer correct when its result set matches (column names and column order are ignored; row order matters only when `orderMatters` is true).

Produce ONE JSON content pack. Output only the JSON in a single code block.

## What I want

<e.g. "Use the Riverbend database I pasted and write 40 templates that mirror the query types in my chapter 5 slides, difficulty 1–5, at least 3 per topic." — or "Build a new database for a university (students, courses, sections, enrollments, instructors) with ~200 enrollment rows, then write 30 templates.">

## Output format

```json
{
  "format": "db-analyst-simulator/pack@1",
  "id": "<pack id>",
  "title": "<pack title>",
  "databases": [
    {
      "id": "<db id, referenced by query sets and presentation challenges>",
      "name": "<display name>",
      "description": "<one sentence for the sidebar>",
      "ddl": ["CREATE TABLE ... (...)", "..."],
      "seed": ["INSERT INTO ... VALUES (...)", "..."],
      "tableNotes": { "<TableName>": "<one-line note shown under the table in the sidebar>" }
    }
  ],
  "queries": [
    {
      "id": "<set id>",
      "company": "<employer id: dave | utt | mega, or a company defined in this pack>",
      "title": "<title shown in the sprint picker>",
      "database": "<db id>",
      "questions": [
        {
          "id": "q01",
          "topic": "select-where",
          "difficulty": 1,
          "points": 10,
          "text": "List the names of products priced above ${{price}}.",
          "sql": "SELECT ProductName FROM Product WHERE Price > {{price}}",
          "params": { "price": { "values": [30, 50, 100] } },
          "orderMatters": false,
          "hints": ["<shown after the second wrong attempt>"]
        },
        {
          "id": "q02",
          "topic": "join",
          "difficulty": 3,
          "text": "List the store name and date of every transaction by customer {{cid}}.",
          "sql": "SELECT S.StoreName, T.TDate FROM SalesTransaction T JOIN Store S ON T.StoreID = S.StoreID WHERE T.CustomerID = '{{cid}}'",
          "params": { "cid": { "from": "SELECT DISTINCT CustomerID FROM SalesTransaction" } }
        }
      ]
    }
  ]
}
```

### Rules for the database (skip if I supplied one)

- SQLite syntax. Use `PRIMARY KEY`, `FOREIGN KEY (...) REFERENCES T (col)`, `NOT NULL`; types `INT`, `DECIMAL(p,s)`, `VARCHAR(n)`, `CHAR(n)`, `DATE`. Put DDL in dependency order (parents first). Foreign keys are enforced during seeding.
- Dates as `'YYYY-MM-DD'`. If time series questions or charts are wanted, also store `TYear INT` and `TMonth CHAR(7)` (`'YYYY-MM'`) columns.
- Make the data *interesting*: some NULLs in an optional column, at least one parent row with no children (for outer joins / NOT IN), duplicates in categorical columns (for DISTINCT / GROUP BY), and realistic magnitudes. 100–600 fact rows is plenty; each INSERT is one statement (no multi-row VALUES).
- Escape single quotes in strings by doubling them.

### Rules for templates

- `topic` must be one of: `select-basic`, `select-where`, `distinct-order`, `like-in-between`, `aggregate`, `group-by`, `having`, `join`, `multi-join`, `alias`, `subquery`, `set-ops`, `exists`, `self-join`, `null`, `outer-join`. Cover every topic my lectures cover, roughly in proportion.
- `difficulty` 1–5 (default points 10/15/20/30/40). 1 = single table, no conditions; 2 = conditions/sorting; 3 = aggregates, one join; 4 = multi-join, HAVING, subqueries, set ops; 5 = correlated subqueries, tricky combinations.
- Question `text` must unambiguously determine the result: say which columns to return and in what circumstances, e.g. "Return a single number", "Show the category ID and the count". Do not ask for column headings. Say "sorted by …" only when you also set `orderMatters: true`.
- `params`: each parameter either has `values` (a fixed list) or `from` (a SQL query whose first column supplies values). Quote string parameters inside the reference SQL (`'{{state}}'`), never numeric ones. Choose parameter sources so the reference query almost never returns zero rows.
- The reference `sql` must run in SQLite and return only the columns the text asks for. Round averages with `ROUND(x, 2)` and say so in the text.
- Only SELECT statements are allowed in the sprint; no DML/DDL templates.
- 2–3 hints per template, each a nudge (the clause or function to use), never the answer.

## Employer

Query sets belong to a `company` (see prompts/README.md). If you build a new database, also add a `companies` entry with `id`, `name`, `tier` (easy|medium|hard), `logo`, `contact`, `tagline`, `description`, and reference it from the set.

## Checklist before you answer

- Every `{{param}}` in `text` also appears in `sql` and is defined in `params`.
- Every table and column in the templates exists in the DDL.
- IDs are unique; `database` matches a database `id`.
- Valid JSON (escape quotes in SQL strings correctly).

## Materials

<paste database definition and/or lecture notes here>
