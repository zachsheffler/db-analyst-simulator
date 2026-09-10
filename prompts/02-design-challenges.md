# Prompt 02 — Generate design challenges (ER → schema → DDL)

Copy everything below the line into Claude. Attach or paste: (a) your notation pack from prompt 01 if you have one, (b) the case studies or the domain/difficulty you want, and (c) optionally `public/packs/riverbend-challenges.json` as a worked example.

---

You are writing content for **DB Analyst Simulator**, a teaching game for an introductory databases course based on Jukic, Vrbsky & Nestorov, *Database Systems*, chapters 2–3 (ER modeling and mapping to relational schemas) and 5 (SQL DDL). In the game's **Design** module a student reads a business brief, draws an ER diagram in an editor, maps it to a relational schema, and writes CREATE TABLE statements that run in SQLite. The game grades each step automatically against a reference solution that **you** will write. Because the grading is automatic, precision matters more than prose.

Produce ONE JSON content pack containing a `design` array. Output only the JSON in a single code block.

## What I want

<describe here: e.g. "Three challenges of difficulty 2, 3 and 4 in the domain of a public library, covering: composite and multivalued attributes, a derived attribute, a 1:M, an M:N with attributes, a 1:1, and (in the hardest) a weak entity and a unary relationship." — or paste your own case study text and say "turn this into a challenge">

## Output format

```json
{
  "format": "db-analyst-simulator/pack@1",
  "id": "<kebab-case pack id>",
  "title": "<pack title>",
  "design": [
    {
      "id": "<kebab-case, stable>",
      "company": "<employer id: dave | utt | mega, or a new company defined in this pack>",
      "title": "<business name>",
      "difficulty": 1,
      "brief": "<the requirements the student reads; paragraphs separated by blank lines (\\n\\n)>",
      "hints": ["<optional, revealed on demand, 2–4 of them>"],
      "er": {
        "entities": [
          {
            "name": "CUSTOMER",
            "aliases": ["Client"],
            "weak": false,
            "attributes": [
              { "name": "CustomerID", "aliases": ["ID", "CustNo"], "key": true },
              { "name": "Name" },
              { "name": "Address", "composite": ["Street", "City", "Zip"] },
              { "name": "Phone", "multivalued": true },
              { "name": "Age", "derived": true },
              { "name": "LogNo", "partialKey": true }
            ]
          }
        ],
        "relationships": [
          {
            "name": "Places",
            "aliases": ["Makes"],
            "identifying": false,
            "sides": [
              { "entity": "CUSTOMER", "max": "1", "min": "mandatory" },
              { "entity": "ORDER", "max": "M", "min": "optional" }
            ],
            "attributes": [],
            "rationale": "<one sentence quoting the brief that justifies the cardinality>"
          }
        ]
      },
      "schema": {
        "tables": [
          {
            "name": "ORDER_LINE",
            "aliases": ["OrderItem", "Contains"],
            "note": "<why this table exists, shown if the student omits it>",
            "columns": [
              { "name": "OrderID" },
              { "name": "ProductID" },
              { "name": "Quantity", "type": "INT" },
              { "name": "ShipDate", "nullable": true },
              { "name": "AccountID", "unique": true }
            ],
            "pk": ["OrderID", "ProductID"],
            "fks": [
              { "columns": ["OrderID"], "refTable": "ORDER" },
              { "columns": ["ProductID"], "refTable": "PRODUCT" }
            ]
          }
        ],
        "notes": ["<explanations shown after grading, e.g. why the 1:1 FK goes on a particular side>"],
        "alternates": [{ "tables": [ "<a complete alternative table list, e.g. with the 1:1 FK on the other side>" ] }]
      },
      "ddl": {
        "tests": [
          { "description": "<what the test demonstrates>", "sql": "INSERT INTO ... ; INSERT INTO ...", "expect": "ok" },
          { "description": "An order for a non-existent customer is rejected.", "sql": "INSERT INTO ORDER (...) VALUES (...)", "expect": "error" }
        ]
      },
      "points": { "er": 100, "schema": 100, "ddl": 100 }
    }
  ]
}
```

## Semantics you must get right

**Relationship sides.** Each side describes the symbols drawn at *that entity's* end of the line, i.e. how many instances of that entity relate to one instance of the other entity:
- `max` is `"1"` or `"M"`; `min` is `"mandatory"` (at least one) or `"optional"` (may be zero).
- "Each ORDER is placed by exactly one CUSTOMER; a customer may place many orders or none" ⇒ CUSTOMER side `max:"1", min:"mandatory"`, ORDER side `max:"M", min:"optional"`.
- Cardinality in feedback is written `sides[0].max : sides[1].max`, so put the "1" side first for 1:M relationships.
- Unary relationships list the same entity on both sides with a `role` on each (e.g. `"supervisor"` / `"subordinate"`).
- A weak entity has `"weak": true`, one attribute with `"partialKey": true`, and its relationship to the owner has `"identifying": true`.
- Attributes of an M:N relationship go in the relationship's `attributes`, not on an entity.

**Schema.** Apply the mapping rules exactly:
- Every regular entity → one table; the unique attribute → `pk`.
- Composite attribute → its components as columns; derived attributes are **not** stored; multivalued attribute → its own table with `pk` = [owner PK, value] and an FK to the owner.
- 1:M → FK on the M side. M:N → bridge table with both FKs, composite PK, and the relationship's attributes. 1:1 → FK on the mandatory side marked `"unique": true`; put the other placement in `alternates`. Weak entity → table whose PK is [owner PK, partial key].
- Column names must be consistent across tables (an FK column should be named like the PK it references, or give `aliases`).
- Add `aliases` generously for names students plausibly use (`ID`, `CustNo`, `Cust_ID`, singular/plural do not need aliases: matching already ignores case, plurals, underscores, and common abbreviations).

**DDL tests.** Write 5–8 tests using the reference table and column names (the game rewrites them to the student's names). Each test is one or more statements separated by `;`. Tests run in order on the same database, so insert parent rows before children. Include at least: a clean insert chain (`ok`), an FK violation (`error`), a PK/composite-PK violation (`error`), and, when the brief allows it, a NULL in an optional FK (`ok`).

**Brief.** 150–350 words. Name every entity in CAPITALS the first time. State every cardinality and participation explicitly in business language ("may", "must", "exactly one", "one or more", "or none yet"). Mention every attribute the reference expects, and signal composite/multivalued/derived attributes in words ("made up of", "one or more", "can be calculated").

## Checklist before you answer

- Every `sides[].entity`, `fks[].refTable` and `pk` column name exists exactly as spelled.
- The brief justifies every cardinality; nothing in the reference is unstated in the brief.
- The reference schema follows from the reference ER by the mapping rules with no extra or missing tables.
- Tests only reference tables/columns in the reference schema and respect insert order.
- Valid JSON, no comments.

## Employer

Every challenge needs a `company` id. Use an existing employer (`dave` = easy gig-economy log, `utt` = medium YouTube studio, `mega` = hard games publisher/store/hardware/credit) and keep the brief in that company's voice, or define a new one in the same pack:

```json
"companies": [{ "id": "<id>", "name": "<name>", "tier": "easy|medium|hard", "logo": "<emoji>", "contact": "<who briefs the student>", "tagline": "<one line>", "description": "<2–3 sentences>" }]
```

## Materials

<paste notation pack / case study / example pack here>
