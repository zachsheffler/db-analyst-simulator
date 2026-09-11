import type { ReactNode } from 'react'
import type { Workbench } from '../workbench'

export type Platform = 'pbi' | 'tab' | 'gg'

export const PLATFORMS: { id: Platform; name: string; product: string; blurb: string; icon: string }[] = [
  { id: 'pbi', name: 'Power BI-style', product: 'Power Byte Desktop', blurb: 'Fields · Visualizations · Filters panes, drag fields into wells, DAX-ish measures.', icon: '📊' },
  { id: 'tab', name: 'Tableau-style', product: 'Tablow Desktop', blurb: 'Blue dimension / green measure pills, Columns & Rows shelves, Marks card, Show Me.', icon: '🟦' },
  { id: 'gg', name: 'ggplot2-style', product: 'ArrStudio', blurb: 'A tidyverse recipe: filter() → mutate() → group_by() → summarise() → ggplot(aes()) + geom_*().', icon: '📈' },
]

export interface SkinProps {
  wb: Workbench
  /** Title shown in the skin's window chrome. */
  docTitle: string
  onCheck: () => void
  checkLabel: string
  /** Rendered above the workbench (sprint question / feedback). */
  banner?: ReactNode
}
