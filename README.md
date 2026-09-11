# DB Analyst Simulator

A browser game for an introductory databases course. Students work through the three phases of a database project, in order:

| Module | What the student does | How it is graded |
|---|---|---|
| **1 · Design** | Reads a business brief, draws an ER diagram (entities, attributes, relationships with cardinality/participation, weak entities, composite/multivalued/derived attributes), maps it to a relational schema (tables, PKs, FKs), then writes `CREATE TABLE` statements. **Diagramming sprint:** timed mini-questions generated from pieces of the brief (one entity, one relationship, one mapping) | ER diagrams are graded on the *amount and nature* of what is drawn (entities and attributes are paired by name where possible and by structure otherwise), with deliberately broad feedback ("missing two attributes: one derived, one multivalued"); the schema is compared with the reference; the DDL is executed in a real SQLite database and probed with INSERT tests |
| **2 · Query** | Timed sprint: generated questions answered with real SQL; streaks and speed multiply points | The student's result set is compared with the reference query's result set |
| **3 · Viz** | Builds the right visual for a business question in the tool of their choice: a **Power BI**-style report canvas, a **Tableau**-style sheet (pills, shelves, Marks card, Show Me) or a **ggplot2 / RStudio**-style recipe that writes the tidyverse code live. All three support ad-hoc **calculated fields**. **Viz sprint:** timed chart questions | Jobs: chart type, fields, aggregation, filters, sort, title, and visualization principles are checked; equivalent field choices are accepted when the data matches. Sprints: the visual's numbers must match a reference query, the chart type must be acceptable |

Everything runs in the browser (SQLite via WebAssembly). No server, no accounts; progress is stored in `localStorage` and can be exported from the Report card tab.

A **professor chat** (Teams/WhatsApp-style) sits in the corner. Point it at any OpenAI-compatible endpoint you run yourself (Ollama, LM Studio, llama.cpp, vLLM…) under *Settings & packs*; it gets the current task, the student's work and the latest check as context, gives nudges and encouragement, and demurs on anything off-topic. Without a model it falls back to short scripted replies.

## Employers = difficulty settings

The student picks an employer; each is a difficulty tier with its own database and jobs.

| Employer | Tier | Database | Jobs |
|---|---|---|---|
| **Dave's Gig Log** 🛵 | Easy | 5 tables: his car, scooter and bicycle, four gig apps, gigs and expenses | 1 design job, 30 SQL templates, 6 viz jobs, 26 viz sprint templates |
| **Ulysses Tech Tips** 🎬 | Medium | 9 tables: departments, employees (with managers), channels, videos, products, manufacturers, sponsors, sponsorships | 2 design jobs, 40 SQL templates (incl. self-joins), 6 viz jobs, 28 viz sprint templates |
| **Mega EpicGames** 🎮 | Hard | 13 tables: studios, games, genres, platforms, customers, store sales with a revenue cut, reviews, hardware products/orders/lines, credit accounts and a weak-entity transaction ledger | 2 design jobs, 42 SQL templates, 8 viz jobs, 30 viz sprint templates |

Diagramming-sprint questions are generated from the design jobs (roughly 10–25 per employer).

## Workspace layout

A fixed 2×2 grid: the vertical divider sits at 60 % of the width, the horizontal divider at 70 % of the height.

| | Left (60 %) | Right (40 %) |
|---|---|---|
| **Top (70 %)** | The program: Diagramming, Query Workbench, or Viz | Instructions & help: the brief, hints, notation reminders / mapping rules / SQL notes / viz principles, and the latest grade report |
| **Bottom (30 %)** | On a job: a **quick reference** (attribute-type symbols, column types & key marks, CREATE TABLE cheat sheet, chart chooser) plus Check / Prev / Next / Leave. In a sprint: the countdown, score, streak and Submit / Skip / End | Professor chat |

Press <kbd>?</kbd> anywhere for the keyboard shortcuts of the current screen (ER canvas: <kbd>E</kbd>/<kbd>A</kbd>/<kbd>R</kbd> to add, <kbd>K</kbd>/<kbd>M</kbd>/<kbd>D</kbd>/<kbd>O</kbd>/<kbd>P</kbd>/<kbd>W</kbd>/<kbd>I</kbd> to toggle attribute/entity/relationship types, <kbd>1</kbd>/<kbd>2</kbd> to cycle cardinality, arrows to nudge, <kbd>Tab</kbd> to cycle selection; schema editor: <kbd>T</kbd>/<kbd>C</kbd>/<kbd>S</kbd>, <kbd>Enter</kbd> adds the next column; everywhere: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> checks or submits, <kbd>Alt</kbd>+<kbd>N</kbd> skips).

Modules render into the help and controls panels through named slots (`src/components/Slots.tsx`), so a module only has to declare what belongs in each panel.

Default notation follows Jukic, Vrbsky & Nestorov, *Database Systems* (ch. 1–6). All vocabulary, symbols, mapping rules, dialect notes and chart rules are configurable through a content pack.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ — host it anywhere (GitHub Pages, LMS, S3)
npm run validate   # check content packs and self-test the graders
```

`vite.config.ts` sets `base: './'`, so the built site works from any sub-path.

### Docker

```bash
docker build -t db-analyst-simulator .        # validates content, builds, packages with nginx
docker run --rm -p 8080:80 db-analyst-simulator
# or
docker compose up --build                     # http://localhost:8080
```

The image is a two-stage build (Node 22 to build, nginx to serve). Uncomment the volume in `docker-compose.yml` to swap content packs without rebuilding.

### GitHub Pages

`.github/workflows/pages.yml` validates, builds, and deploys `dist/` on every push to `main`. Enable it once in the repository settings (Settings → Pages → Source: GitHub Actions).

## Content

Content lives in JSON packs in `public/packs/`, listed in `public/packs/manifest.json`:

- `dave-db.json`, `utt-db.json`, `mega-db.json` — the three employer databases (regenerate with `npm run gen:db`, which runs `scripts/gen-company-dbs.mjs`).
- `dave-challenges.json`, `utt-challenges.json`, `mega-challenges.json` — the jobs for each employer (design, SQL sprint, viz jobs, viz sprint; the viz sprint sections are produced by `scripts/gen-viz-sprints.py`).
- `riverbend-db.json` / `riverbend-challenges.json` — an extra worked example (a bike-shop chain) that is not in the manifest; add it to `manifest.json` to enable it, or use it as the sample when prompting Claude.

To add your own material, use the Claude prompts in [`prompts/`](prompts/README.md): they turn lecture notes into packs (notation, design challenges, query sets, presentation challenges) and there is a review prompt for fixing validator output. The full format is documented in [`docs/content-format.md`](docs/content-format.md). Students can also import a pack file from the Home tab without a rebuild.

## Scoring

- **Design**: each step is worth 100 points by default; the best score per step is kept. 3 stars ≥ 95 %, 2 stars ≥ 75 %, 1 star ≥ 50 %.
- **Sprints (SQL, Viz, Diagramming)**: base points by difficulty (10/15/20/30/40) × streak multiplier (+10 % per consecutive correct, max 2×) × speed bonus (1.5× under 60 s, 1.25× under 2 min). Second attempt 60 %, third+ 30 %, revealed solution 0. Skips are free but reset the streak. A diagramming answer counts as correct at 90 % or better.
- **Viz jobs**: 100 points per challenge; best score kept.

## Project layout

```
src/
  types/content.ts        pack format (source of truth)
  content/                default notation, pack loading/validation/merging
  lib/                    sqlite wrapper, name matching, result comparison, graders, viz query builder,
                          calculated-field resolver, sprint helpers, design-sprint generator, hotkeys, LLM client
  components/             Slots (help/controls panels), ControlBar, quick-reference cards, grade report, tables
  modules/design/         ER canvas + editor, schema editor + diagram, DDL step, diagramming sprint
  modules/query/          SQL sprint UI
  modules/present/        shared viz workbench + Power BI / Tableau / ggplot skins, viz jobs and viz sprint
  pages/                  company picker, professor chat, report card, settings & packs
public/packs/             content packs + manifest
prompts/                  Claude prompts for generating packs from lectures
scripts/                  database generator, content validator
docs/                     format reference
```

## Notes and limitations

- SQL runs in SQLite. Oracle/MySQL-specific syntax (`MINUS`, `TO_DATE`, `NVL`) is not available; the DDL step shows dialect notes from the notation pack.
- ER grading matches names leniently (case, plurals, underscores, common abbreviations, per-challenge aliases) but cannot read minds: briefs should name entities and attributes explicitly.
- Calculated fields are SQLite expressions; the three viz skins share one query builder, so "DAX" and "R" are costumes, not interpreters (the ggplot skin shows real tidyverse code but the recipe form drives it).
- The professor chat needs a CORS-enabled OpenAI-compatible endpoint (for Ollama: `OLLAMA_ORIGINS=* ollama serve`). A 3B-class instruction model is enough.
- Progress is per browser. For graded use, ask students to export their report card JSON.
