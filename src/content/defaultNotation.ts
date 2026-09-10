import type { Notation } from '../types/content'

/**
 * Default notation, modeled on Jukic, Vrbsky & Nestorov, *Database Systems* (2e/3e), chapters 2-5.
 * Override any part of this from a content pack's `notation` field
 * (see prompts/01-import-notation.md to generate one from your lecture notes).
 */
export const DEFAULT_NOTATION: Notation = {
  name: 'Jukic (Database Systems) ER + relational notation',
  er: {
    terms: {
      entity: 'entity',
      attribute: 'attribute',
      relationship: 'relationship',
      uniqueAttribute: 'unique attribute',
      multivalued: 'multivalued',
      derived: 'derived',
      composite: 'composite',
      optional: 'optional',
      mandatory: 'mandatory',
      weakEntity: 'weak entity',
    },
    maxOne: 'bar',
    maxMany: 'crowfoot',
    minZero: 'circle',
    minOne: 'bar',
    symbolOrder: 'min-inner',
    cardinalityText: { one: '1', many: 'M', sep: ':' },
    reminders: [
      'Every regular entity has at least one unique attribute (underlined).',
      'A relationship is a diamond; its cardinality symbols sit at the entity ends of the lines.',
      'Maximum cardinality (1 or M) is the outer symbol; participation (0 or 1) is the inner symbol.',
      'Attributes of an M:N relationship belong on the relationship diamond.',
      'Composite attributes show their components; multivalued = double oval; derived = dashed oval.',
      'A weak entity (double rectangle) has a partial key and an identifying relationship (double diamond).',
    ],
  },
  relational: {
    pkMark: 'underline',
    fkMark: 'italic',
    namingCase: 'free',
    mappingRules: [
      'Each regular entity becomes a relation; its unique attribute becomes the primary key.',
      'Composite attributes are mapped as their individual components.',
      'A multivalued attribute becomes its own relation: FK to the owner + the value, with a composite PK.',
      'Derived attributes are not mapped (they are computed).',
      '1:M relationship: put the PK of the 1 side into the M side as a foreign key.',
      'M:N relationship: create a new relation with FKs to both sides; its PK is the combination of those FKs; relationship attributes go here.',
      '1:1 relationship: put a foreign key on either side (prefer the side with mandatory participation).',
      'Weak entity: a relation whose PK is the owner PK (as FK) combined with the partial key.',
      'Unary relationships follow the same rules, with the FK referencing the same relation.',
    ],
  },
  sql: {
    teachingDialect: 'ANSI SQL (Oracle / MySQL flavored, as in Jukic ch. 5)',
    dialectNotes: [
      'Queries run in SQLite. Everything covered in chapters 5-6 works: CREATE TABLE with PRIMARY KEY / FOREIGN KEY / NOT NULL / UNIQUE, INSERT, SELECT, joins, GROUP BY, HAVING, subqueries, UNION / INTERSECT / EXCEPT, views.',
      'Data types: INT, DECIMAL(p,s), VARCHAR(n), CHAR(n), DATE are all accepted (SQLite does not enforce lengths).',
      "Dates are written as 'YYYY-MM-DD' strings. Use strftime('%Y', col) for the year, strftime('%m', col) for the month.",
      'MINUS (Oracle) is spelled EXCEPT. String concatenation is ||. There is no TO_DATE.',
      'Foreign keys are enforced (PRAGMA foreign_keys is ON).',
    ],
    style: ['Uppercase keywords', 'One clause per line', 'Alias tables when joining three or more tables'],
  },
  viz: {
    principles: [
      { id: 'pie-slices', text: 'A pie or donut with more than 6 slices is unreadable; use a bar chart.', check: { kind: 'maxPieSlices', max: 6 } },
      { id: 'title', text: 'Every visual needs a title that states what it shows.', check: { kind: 'requireTitle' } },
      { id: 'line-time', text: 'A line chart implies an ordered (usually time) axis; use bars for categories.', check: { kind: 'lineNeedsOrderedAxis' } },
      { id: 'series', text: 'More than 6 series in one visual is clutter; filter or split into small multiples.', check: { kind: 'maxSeries', max: 6 } },
      { id: 'bar-time', text: 'Long time series read better as a line than as many bars.', check: { kind: 'barNotForTime' } },
      { id: 'agg', text: 'Choose the aggregation deliberately: a sum answers "how much", an average answers "how typical".', check: { kind: 'advisory' } },
    ],
  },
}
