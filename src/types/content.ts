/**
 * Content pack format for DB Analyst Simulator.
 *
 * A pack is a single JSON file. It may contain any subset of: databases,
 * design challenges, query sets, presentation challenges, and a notation
 * override. See docs/content-format.md for the human-readable spec and
 * prompts/ for Claude prompts that generate packs from lecture material.
 */

export const PACK_FORMAT = 'db-analyst-simulator/pack@1'

// ---------------------------------------------------------------------------
// Notation: the instructor's conventions (ER symbols, schema conventions, SQL)
// ---------------------------------------------------------------------------

export interface Notation {
  /** Human-readable name of the notation, e.g. "Jukic (Database Systems 3e)" */
  name: string
  er: {
    /** Vocabulary shown in the UI. */
    terms: {
      entity: string
      attribute: string
      relationship: string
      uniqueAttribute: string // e.g. "unique attribute" (Jukic) or "key attribute"
      multivalued: string
      derived: string
      composite: string
      optional: string
      mandatory: string
      weakEntity: string
    }
    /** Symbol at the line end nearest the entity for MAX cardinality. */
    maxOne: 'bar' | 'none'
    maxMany: 'crowfoot' | 'arrow' | 'letterM'
    /** Symbol for MIN cardinality (participation). */
    minZero: 'circle' | 'none'
    minOne: 'bar'
    /** Where the min/max symbols sit relative to the entity. */
    symbolOrder: 'min-inner' | 'max-inner'
    /** How to write cardinality in feedback text, e.g. "1:M" */
    cardinalityText: { one: string; many: string; sep: string }
    /** Short bullet reminders shown in the Design module help panel. */
    reminders: string[]
  }
  relational: {
    pkMark: 'underline' | 'bold'
    fkMark: 'italic' | 'dashed-underline' | 'prefix'
    /** Preferred naming case for tables/columns; 'free' means don't nag. */
    namingCase: 'snake' | 'pascal' | 'camel' | 'upper' | 'free'
    /** Mapping rules, as short reminders. */
    mappingRules: string[]
  }
  sql: {
    /** Dialect the lectures teach (Oracle, MySQL, SQL Server, ...). Execution is always SQLite. */
    teachingDialect: string
    /** Reminders about differences between teaching dialect and SQLite. */
    dialectNotes: string[]
    /** Style preferences the grader nags about (not enforced). */
    style: string[]
  }
  viz: {
    /** Chart-choice rules from the visualization unit. */
    principles: VizPrinciple[]
  }
}

export interface VizPrinciple {
  id: string
  /** Shown to the student when the rule fires. */
  text: string
  /** Machine-checkable rule, or "advisory" if only shown as a reminder. */
  check:
    | { kind: 'maxPieSlices'; max: number }
    | { kind: 'requireTitle' }
    | { kind: 'lineNeedsOrderedAxis' }
    | { kind: 'maxSeries'; max: number }
    | { kind: 'barNotForTime' }
    | { kind: 'advisory' }
}

// ---------------------------------------------------------------------------
// Companies: the "employer" a student works for. Each is a difficulty tier.
// ---------------------------------------------------------------------------

export type Tier = 'easy' | 'medium' | 'hard'

export interface Company {
  id: string
  name: string
  tier: Tier
  /** One-line pitch shown on the job card. */
  tagline: string
  /** A few sentences of backstory shown in the help panel. */
  description: string
  /** Emoji used as the company logo. */
  logo?: string
  /** Who the student reports to; used in instructions text. */
  contact?: string
}

// ---------------------------------------------------------------------------
// Databases (shared by the Query and Presentation modules)
// ---------------------------------------------------------------------------

export interface DatabaseDef {
  id: string
  name: string
  description?: string
  /** CREATE TABLE statements in SQLite syntax, in dependency order. */
  ddl: string[]
  /** INSERT statements. */
  seed: string[]
  /** Optional plain-language notes per table shown in the sidebar. */
  tableNotes?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Design module
// ---------------------------------------------------------------------------

export interface ERAttributeRef {
  name: string
  aliases?: string[]
  /** Part of the unique (key) attribute set. */
  key?: boolean
  multivalued?: boolean
  derived?: boolean
  /** Component names, if composite. */
  composite?: string[]
  /** Partial key of a weak entity. */
  partialKey?: boolean
  optional?: boolean
}

export interface EREntityRef {
  name: string
  aliases?: string[]
  weak?: boolean
  attributes: ERAttributeRef[]
}

export type Participation = 'mandatory' | 'optional'
export type MaxCard = '1' | 'M'

export interface ERRelationshipSide {
  entity: string
  /** Max cardinality on THIS side of the relationship (how many of this entity per instance of the other). */
  max: MaxCard
  min: Participation
  /** Role name, needed for unary relationships. */
  role?: string
}

export interface ERRelationshipRef {
  name: string
  aliases?: string[]
  sides: [ERRelationshipSide, ERRelationshipSide]
  identifying?: boolean
  attributes?: ERAttributeRef[]
  /** Explanation used in feedback when the student gets cardinality wrong. */
  rationale?: string
}

export interface SchemaColumnRef {
  name: string
  aliases?: string[]
  type?: string
  nullable?: boolean
  /** Column must be UNIQUE (used for 1:1 relationships mapped as a foreign key). */
  unique?: boolean
}

export interface SchemaFKRef {
  columns: string[]
  refTable: string
  refColumns?: string[]
}

export interface SchemaTableRef {
  name: string
  aliases?: string[]
  columns: SchemaColumnRef[]
  pk: string[]
  fks: SchemaFKRef[]
  /** Why this table exists (bridge for M:N, multivalued attribute, ...) */
  note?: string
}

export interface DDLTest {
  description: string
  /** SQL using canonical (reference) table/column names; they are rewritten to the student's names. */
  sql: string
  expect: 'ok' | 'error'
}

export interface DesignChallenge {
  id: string
  /** Company this challenge belongs to. */
  company: string
  title: string
  difficulty: 1 | 2 | 3 | 4 | 5
  /** The business requirements, plain text with blank-line paragraphs. */
  brief: string
  hints?: string[]
  er: {
    entities: EREntityRef[]
    relationships: ERRelationshipRef[]
  }
  schema: {
    tables: SchemaTableRef[]
    /** Free-text notes shown after grading (e.g. why a bridge table exists). */
    notes?: string[]
    /** Alternative acceptable schemas (e.g. a 1:1 FK on the other side). The best-scoring one is used. */
    alternates?: { tables: SchemaTableRef[] }[]
  }
  ddl?: {
    tests?: DDLTest[]
  }
  /** Points per step; defaults 100/100/100. */
  points?: { er?: number; schema?: number; ddl?: number }
}

// ---------------------------------------------------------------------------
// Query module
// ---------------------------------------------------------------------------

export interface QueryParam {
  /** Pick a random value from the result of this SQL (first column). */
  from?: string
  /** Or pick from a fixed list. */
  values?: (string | number)[]
}

export interface QueryTemplate {
  id: string
  /** Topic tag, e.g. "select-where", "group-by", "join", "subquery" */
  topic: string
  difficulty: 1 | 2 | 3 | 4 | 5
  points?: number
  /** Question text; {{param}} placeholders are substituted. */
  text: string
  /** Reference SQL with the same placeholders. Used only for grading. */
  sql: string
  params?: Record<string, QueryParam>
  /** If true, row order must match (question should say "sorted by ..."). */
  orderMatters?: boolean
  hints?: string[]
}

export interface QuerySet {
  id: string
  company: string
  title: string
  database: string
  questions: QueryTemplate[]
}

// ---------------------------------------------------------------------------
// Presentation module
// ---------------------------------------------------------------------------

export type VisualType =
  | 'clusteredColumn'
  | 'clusteredBar'
  | 'stackedColumn'
  | 'line'
  | 'pie'
  | 'donut'
  | 'card'
  | 'table'

export type Aggregation = 'sum' | 'avg' | 'count' | 'countDistinct' | 'min' | 'max' | 'none'

export interface FieldRef {
  table: string
  column: string
}

export interface VizFilter {
  field: FieldRef
  /** 'in' with values, or a numeric range */
  op: 'in' | 'between' | 'eq' | 'gte' | 'lte'
  values: (string | number)[]
}

export interface VisualSpec {
  type: VisualType
  title?: string
  /** Category / axis field. */
  axis?: FieldRef
  /** Legend / series field. */
  legend?: FieldRef
  /** Measures (values well). */
  values: { field: FieldRef; agg: Aggregation }[]
  /** Table columns (table visual only). */
  columns?: { field: FieldRef; agg: Aggregation }[]
  filters: VizFilter[]
  sort?: { by: 'axis' | 'value'; dir: 'asc' | 'desc' }
}

export interface PresentationChallenge {
  id: string
  company: string
  title: string
  difficulty: 1 | 2 | 3 | 4 | 5
  database: string
  brief: string
  hints?: string[]
  expected: {
    /** Acceptable visual types (first is the "ideal"). */
    types: VisualType[]
    axis?: FieldRef | FieldRef[]
    legend?: FieldRef
    values?: { field: FieldRef; agg: Aggregation | Aggregation[] }[]
    columns?: FieldRef[]
    filters?: VizFilter[]
    sort?: { by: 'axis' | 'value'; dir: 'asc' | 'desc' }
    requireTitle?: boolean
  }
  /** Reference SQL producing the expected data (used to accept equivalent field choices). */
  referenceSql?: string
  points?: number
}

// ---------------------------------------------------------------------------
// Pack
// ---------------------------------------------------------------------------

export interface ContentPack {
  format: typeof PACK_FORMAT
  id: string
  title: string
  description?: string
  notation?: Partial<Notation>
  companies?: Company[]
  databases?: DatabaseDef[]
  design?: DesignChallenge[]
  queries?: QuerySet[]
  presentation?: PresentationChallenge[]
}
