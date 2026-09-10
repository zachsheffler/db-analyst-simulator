import type { MaxCard, Participation } from '../../types/content'

/** Student-authored ER diagram. Flat node list; attributes point at their owner. */
export interface ERSide {
  entity: string // node id
  max: MaxCard
  min: Participation
  role?: string
}

export interface ERNode {
  id: string
  kind: 'entity' | 'relationship' | 'attribute'
  name: string
  x: number
  y: number
  // entity
  weak?: boolean
  // attribute
  owner?: string
  key?: boolean
  partialKey?: boolean
  multivalued?: boolean
  derived?: boolean
  composite?: string[]
  optional?: boolean
  // relationship
  sides?: [ERSide, ERSide]
  identifying?: boolean
}

export interface ERDiagram {
  nodes: ERNode[]
}

export const emptyDiagram = (): ERDiagram => ({ nodes: [] })

let counter = 0
export function nid(prefix = 'n'): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`
}

/** Student-authored relational schema. */
export interface SchemaColumn {
  id: string
  name: string
  type: string
  pk: boolean
  nullable: boolean
  unique?: boolean
  fk?: { table: string; column: string } | null
}

export interface SchemaTable {
  id: string
  name: string
  columns: SchemaColumn[]
}

export interface Schema {
  tables: SchemaTable[]
}

export const emptySchema = (): Schema => ({ tables: [] })
