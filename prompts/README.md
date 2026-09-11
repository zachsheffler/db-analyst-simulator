# Prompts for generating course content with Claude

These prompts turn your lecture material into **content packs** the game can load. Each prompt is self-contained: paste it into Claude (claude.ai, Claude Code, or the API) together with your notes, and it returns a JSON file.

## Workflow

1. **Notation first.** Run `01-import-notation.md` once with your ER / relational / SQL / visualization lecture notes. It produces a small pack that overrides the game's vocabulary, symbols, mapping rules, dialect notes, and chart-choice rules so feedback reads the way you teach it. Save it as `public/packs/notation.json`.
2. **Design challenges.** Run `02-design-challenges.md` with a case study (or ask for new ones in a domain). Save as `public/packs/<name>-design.json`.
3. **Query sets.** Run `03-query-pack.md` to create a database and question templates from your SQL lectures. Save as `public/packs/<name>-queries.json`.
4. **Presentation challenges.** Run `04-presentation-challenges.md` with your visualization unit and a database. Save as `public/packs/<name>-viz.json`.
5. **Viz sprint questions.** Run `06-viz-sprint-pack.md` for the timed chart drill (short questions graded by comparing the visual's numbers with a reference query). Diagramming sprints need no extra content: their questions are generated from the design challenges' reference solutions.
6. **List each file** in `public/packs/manifest.json`:
   ```json
   { "packs": ["notation.json", "riverbend-db.json", "riverbend-challenges.json", "week3-design.json"] }
   ```
7. **Validate** before publishing:
   ```
   npm run validate
   ```
   This builds every database, runs every question template (SQL and viz sprints), checks that each presentation challenge's ideal visual reproduces its reference query, feeds every design challenge's reference solution through the graders (a reference must score 100%), and generates every diagramming-sprint question to confirm its reference answer scores 100%. Paste any failures into `05-review-and-fix.md` to have Claude repair the pack.
8. **Build and deploy** (`npm run build`, publish `dist/`). Students can also import a pack file directly from the Home tab without a rebuild, which is handy for testing.

## Employers (difficulty tiers)

Every challenge belongs to a **company** (the student's employer), and each company is a difficulty tier: `easy`, `medium`, or `hard`. The shipped tiers are Dave's Gig Log (easy, 5 tables), Ulysses Tech Tips (medium, 9 tables) and Mega EpicGames (hard, 13 tables). A pack can add a new company (a `companies` entry plus a database) or add jobs to an existing one by using its `company` id (`dave`, `utt`, `mega`).

## Tips

- Give Claude the *existing* pack (`public/packs/riverbend-challenges.json`) as a worked example along with the prompt. It removes most format guesswork.
- One pack may contain any mix of `databases`, `design`, `queries`, `presentation`, and `notation`. Split by week or topic so you can enable/disable them in the manifest.
- Keep IDs stable: student progress is stored per challenge ID.
- The full format reference is in `docs/content-format.md`.
