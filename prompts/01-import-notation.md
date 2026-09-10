# Prompt 01 — Import my notation and vocabulary

Copy everything below the line into Claude, then paste your lecture material where indicated.

---

You are helping me configure a teaching game called **DB Analyst Simulator** for my introductory databases course. The game has three modules (ER/relational design, SQL querying, and a Power BI-style presentation module) and it explains mistakes to students in words. I want that feedback, the symbols it draws, and the rules it enforces to match **my** lectures, which are based on Jukic, Vrbsky & Nestorov, *Database Systems* (chapters 1–6) plus a visualization unit of my own.

Read the lecture material I paste at the end, then produce ONE JSON file: a content pack containing only a `notation` object. Output only the JSON in a single code block, nothing else.

## Output format

```json
{
  "format": "db-analyst-simulator/pack@1",
  "id": "notation",
  "title": "<course name> notation",
  "notation": {
    "name": "<short label shown in the app header, e.g. 'MIS 3320 — Jukic notation'>",
    "er": {
      "terms": {
        "entity": "entity",
        "attribute": "attribute",
        "relationship": "relationship",
        "uniqueAttribute": "unique attribute",
        "multivalued": "multivalued",
        "derived": "derived",
        "composite": "composite",
        "optional": "optional",
        "mandatory": "mandatory",
        "weakEntity": "weak entity"
      },
      "maxOne": "bar",
      "maxMany": "crowfoot",
      "minZero": "circle",
      "minOne": "bar",
      "symbolOrder": "min-inner",
      "cardinalityText": { "one": "1", "many": "M", "sep": ":" },
      "reminders": ["<5–8 one-line rules students forget, in your words>"]
    },
    "relational": {
      "pkMark": "underline",
      "fkMark": "italic",
      "namingCase": "free",
      "mappingRules": ["<your ER-to-relational mapping rules, one per line, in the order you teach them>"]
    },
    "sql": {
      "teachingDialect": "<dialect you teach, e.g. 'Oracle'>",
      "dialectNotes": ["<differences students will hit because the game runs SQLite; keep the five defaults below unless you know better>"],
      "style": ["<style rules you grade on, e.g. 'uppercase keywords'>"]
    },
    "viz": {
      "principles": [
        { "id": "<slug>", "text": "<rule as you phrase it>", "check": { "kind": "maxPieSlices", "max": 6 } }
      ]
    }
  }
}
```

### Field meanings and allowed values

- `er.terms`: the words the game uses. Jukic says *unique attribute* (not *key attribute*), *optional/mandatory participation*, *weak entity*. Use exactly the terms from my notes.
- Line-end symbols drawn at the **entity** end of a relationship line:
  - `maxOne`: `"bar"` or `"none"`; `maxMany`: `"crowfoot"`, `"arrow"`, or `"letterM"`.
  - `minZero`: `"circle"` or `"none"`; `minOne`: `"bar"`.
  - `symbolOrder`: `"min-inner"` means the participation symbol sits between the diamond and the cardinality symbol (crow's-foot convention: the outermost symbol is the maximum). `"max-inner"` flips it.
- `cardinalityText`: how cardinality is written in feedback (`1:M`, `1:N`, `1..*`, ...).
- `relational.pkMark`: `"underline"` or `"bold"`. `fkMark`: `"italic"`, `"dashed-underline"`, or `"prefix"`. `namingCase`: `"snake"`, `"pascal"`, `"camel"`, `"upper"`, or `"free"` (only nags, never deducts).
- `sql.dialectNotes` defaults (keep unless my notes contradict them):
  1. "Queries run in SQLite. Everything covered in chapters 5–6 works: CREATE TABLE with PRIMARY KEY / FOREIGN KEY / NOT NULL / UNIQUE, INSERT, SELECT, joins, GROUP BY, HAVING, subqueries, UNION / INTERSECT / EXCEPT, views."
  2. "Data types INT, DECIMAL(p,s), VARCHAR(n), CHAR(n), DATE are accepted (lengths are not enforced)."
  3. "Dates are 'YYYY-MM-DD' strings; strftime('%Y', col) extracts the year."
  4. "MINUS (Oracle) is spelled EXCEPT; string concatenation is ||; there is no TO_DATE."
  5. "Foreign keys are enforced."
- `viz.principles[].check.kind` must be one of:
  - `{"kind":"maxPieSlices","max":N}` — fires when a pie/donut has more than N slices
  - `{"kind":"requireTitle"}` — fires when the visual has no title
  - `{"kind":"lineNeedsOrderedAxis"}` — fires when a line chart's axis field does not look like time (date/month/year/week/quarter)
  - `{"kind":"maxSeries","max":N}` — fires when a legend produces more than N series
  - `{"kind":"barNotForTime"}` — fires when a bar/column chart has a time axis with more than 6 bars
  - `{"kind":"advisory"}` — never fires; shown to students as a reminder only
  Turn every rule in my visualization unit into one of these. If a rule cannot be checked mechanically, make it `advisory` so students still see it.

## Rules

- Do not invent conventions that are not in my notes; where my notes are silent, keep the default value shown above.
- Every string students will read must use my vocabulary and be one sentence.
- Output valid JSON only (no comments, no trailing commas).

## My lecture material

<paste your ER diagram lecture, relational mapping lecture, SQL conventions, and visualization unit here>
