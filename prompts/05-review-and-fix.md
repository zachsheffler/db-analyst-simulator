# Prompt 05 — Review, fix, and align a pack

Use this after running `npm run validate`, after a class session surfaced confusing feedback, or to re-word a pack in your lecture vocabulary. Copy everything below the line into Claude, then paste the pack and the validator output / notes.

---

You are reviewing a content pack for **DB Analyst Simulator** (format `db-analyst-simulator/pack@1`). The pack may contain `databases`, `design` challenges (ER reference + relational schema reference + DDL tests), `queries` (parameterized SQL question templates), `presentation` challenges (expected Power BI-style visual + reference SQL), and a `notation` override.

Return the **complete corrected pack** as a single JSON code block, followed by a short bullet list of what you changed and why. Do not drop or rename any `id`s (student progress is keyed on them) unless I ask.

## Checks to perform

1. **Validator failures.** Fix every item in the validator output I paste. Typical causes: a DDL test inserts a child before its parent; a reference query uses a column that does not exist; a `{{param}}` is undefined; a `referenceSql` column order does not match axis → legend → value; an ER `sides[].entity` misspells an entity.
2. **Brief ↔ reference consistency (design).** Every cardinality, participation, attribute flag (composite / multivalued / derived / partial key), and weak entity in `er` must be stated in the `brief`; every table, column, PK and FK in `schema` must follow from `er` by the mapping rules. Flag and fix anything a diligent student could not have inferred.
3. **Aliases.** Add `aliases` for names students plausibly use so lenient matching succeeds (e.g. `ID`, `Cust_Number`, `Description`). Case, plurals, underscores and common abbreviations are already handled.
4. **Question text (queries).** Each `text` must determine the result set exactly (which columns, which rows). Say "Return a single number" for aggregates, "Round to 2 decimals" when the SQL rounds, and set `orderMatters` only when the text says "sorted".
5. **Presentation briefs.** Everything graded (title, sort, filter) is stated in the brief; `types` includes every defensible chart; `referenceSql` reproduces the ideal visual.
6. **Vocabulary.** Reword feedback strings (`rationale`, `note`, `notes`, `hints`, `reminders`, `mappingRules`, principle `text`) to match the terminology in my notes: <paste terms or say "use Jukic's terms: unique attribute, participation, weak entity, relational schema, bridge/associative table…">.
7. **Employers.** Every design challenge, query set and presentation challenge has a `company` that exists (`dave`, `utt`, `mega`, or one defined in `companies`).
8. **Difficulty balance.** Report the count of items per difficulty and per topic; suggest (do not silently add) gaps.

## Materials

<paste pack JSON, validator output, and any student feedback here>
