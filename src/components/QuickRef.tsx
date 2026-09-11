import type { Notation } from '../types/content'

/**
 * Quick-reference cards for the bottom panel (shown instead of a timer on
 * untimed jobs). Small SVG glyphs mirror what the ER canvas draws.
 */

function Glyph({ children, w = 64, h = 36 }: { children: React.ReactNode; w?: number; h?: number }) {
  return (
    <svg className="qr-glyph" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      {children}
    </svg>
  )
}

function Card({ x, y, angle, max, min, n }: { x: number; y: number; angle: number; max: '1' | 'M'; min: 'mandatory' | 'optional'; n: Notation }) {
  // same geometry as ERCanvas.CardSymbols, drawn at a fixed size
  const draw = (sym: string, dist: number) => {
    const cx = x + Math.cos(angle) * dist
    const cy = y + Math.sin(angle) * dist
    const px = -Math.sin(angle)
    const py = Math.cos(angle)
    if (sym === 'bar') return <line x1={cx + px * 7} y1={cy + py * 7} x2={cx - px * 7} y2={cy - py * 7} />
    if (sym === 'circle') return <circle cx={cx} cy={cy} r={4} fill="#fff" />
    if (sym === 'crowfoot') {
      const tipX = x + Math.cos(angle) * (dist - 9)
      const tipY = y + Math.sin(angle) * (dist - 9)
      return (
        <g fill="none">
          <line x1={cx} y1={cy} x2={tipX + px * 8} y2={tipY + py * 8} />
          <line x1={cx} y1={cy} x2={tipX - px * 8} y2={tipY - py * 8} />
          <line x1={cx} y1={cy} x2={tipX} y2={tipY} />
        </g>
      )
    }
    if (sym === 'arrow') {
      const tipX = x + Math.cos(angle) * (dist - 9)
      const tipY = y + Math.sin(angle) * (dist - 9)
      return (
        <g fill="none">
          <line x1={tipX + px * 5} y1={tipY + py * 5} x2={cx} y2={cy} />
          <line x1={tipX - px * 5} y1={tipY - py * 5} x2={cx} y2={cy} />
        </g>
      )
    }
    if (sym === 'letterM')
      return (
        <text x={cx + px * 9} y={cy + py * 9 + 4} textAnchor="middle" fontWeight={700} fontSize={11} stroke="none" fill="#1a1d23">
          M
        </text>
      )
    return null
  }
  const symFor = (which: 'max' | 'min', v: string) => {
    if (which === 'max') return v === '1' ? (n.er.maxOne === 'none' ? null : 'bar') : n.er.maxMany
    return v === 'optional' ? (n.er.minZero === 'none' ? null : 'circle') : 'bar'
  }
  const outer = n.er.symbolOrder === 'min-inner' ? symFor('max', max) : symFor('min', min)
  const inner = n.er.symbolOrder === 'min-inner' ? symFor('min', min) : symFor('max', max)
  return (
    <g stroke="#1a1d23" strokeWidth={1.5}>
      <line x1={x} y1={y} x2={x + Math.cos(angle) * 40} y2={y + Math.sin(angle) * 40} />
      {outer && draw(outer, 10)}
      {inner && draw(inner, 22)}
    </g>
  )
}

export function ERQuickRef({ notation: n }: { notation: Notation }) {
  const t = n.er.terms
  const S = { fill: '#fff', stroke: '#1a1d23', strokeWidth: 1.5 }
  return (
    <div className="qr">
      <div className="qr-title">{t.attribute} types &amp; symbols</div>
      <div className="qr-grid">
        <div className="qr-item">
          <Glyph>
            <ellipse cx={32} cy={18} rx={28} ry={13} {...S} />
            <text x={32} y={22} textAnchor="middle">
              name
            </text>
          </Glyph>
          <span>plain {t.attribute}</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <ellipse cx={32} cy={18} rx={28} ry={13} {...S} />
            <text x={32} y={22} textAnchor="middle" textDecoration="underline">
              id
            </text>
          </Glyph>
          <span>{t.uniqueAttribute} (underlined)</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <ellipse cx={32} cy={18} rx={28} ry={13} {...S} />
            <text x={32} y={22} textAnchor="middle">
              no
            </text>
            <line x1={24} x2={40} y1={25} y2={25} stroke="#1a1d23" strokeDasharray="3 2" />
          </Glyph>
          <span>partial key (dashed underline)</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <ellipse cx={32} cy={18} rx={30} ry={15} fill="none" stroke="#1a1d23" strokeWidth={1.5} />
            <ellipse cx={32} cy={18} rx={26} ry={11} {...S} />
            <text x={32} y={22} textAnchor="middle">
              phone
            </text>
          </Glyph>
          <span>{t.multivalued} (double oval)</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <ellipse cx={32} cy={18} rx={28} ry={13} {...S} strokeDasharray="4 3" />
            <text x={32} y={22} textAnchor="middle">
              age
            </text>
          </Glyph>
          <span>{t.derived} (dashed oval)</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <ellipse cx={32} cy={14} rx={28} ry={11} {...S} />
            <text x={32} y={18} textAnchor="middle">
              address
            </text>
            <text x={32} y={33} textAnchor="middle" fontSize={8} fill="#5d6572">
              (street, city, zip)
            </text>
          </Glyph>
          <span>{t.composite} (components listed)</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <ellipse cx={32} cy={18} rx={28} ry={13} {...S} />
            <text x={32} y={22} textAnchor="middle" fontStyle="italic">
              nickname
            </text>
          </Glyph>
          <span>{t.optional} (italic)</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <rect x={6} y={6} width={52} height={24} {...S} />
            <text x={32} y={22} textAnchor="middle" fontWeight={700}>
              ENTITY
            </text>
          </Glyph>
          <span>{t.entity}</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <rect x={3} y={3} width={58} height={30} fill="none" stroke="#1a1d23" strokeWidth={1.5} />
            <rect x={7} y={7} width={50} height={22} {...S} />
            <text x={32} y={22} textAnchor="middle" fontWeight={700} fontSize={9}>
              WEAK
            </text>
          </Glyph>
          <span>{t.weakEntity} (needs a partial key + identifying {t.relationship})</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <path d="M32,4 L60,18 L32,32 L4,18 Z" {...S} />
          </Glyph>
          <span>{t.relationship}</span>
        </div>
        <div className="qr-item">
          <Glyph>
            <path d="M32,1 L63,18 L32,35 L1,18 Z" fill="none" stroke="#1a1d23" strokeWidth={1.5} />
            <path d="M32,6 L56,18 L32,30 L8,18 Z" {...S} />
          </Glyph>
          <span>identifying {t.relationship}</span>
        </div>
        <div className="qr-item">
          <Glyph w={64} h={36}>
            <rect x={2} y={10} width={16} height={16} {...S} />
            <Card x={18} y={18} angle={0} max="1" min="mandatory" n={n} />
          </Glyph>
          <span>exactly one (max 1, {t.mandatory})</span>
        </div>
        <div className="qr-item">
          <Glyph w={64} h={36}>
            <rect x={2} y={10} width={16} height={16} {...S} />
            <Card x={18} y={18} angle={0} max="1" min="optional" n={n} />
          </Glyph>
          <span>zero or one (max 1, {t.optional})</span>
        </div>
        <div className="qr-item">
          <Glyph w={64} h={36}>
            <rect x={2} y={10} width={16} height={16} {...S} />
            <Card x={18} y={18} angle={0} max="M" min="mandatory" n={n} />
          </Glyph>
          <span>one or many (max M, {t.mandatory})</span>
        </div>
        <div className="qr-item">
          <Glyph w={64} h={36}>
            <rect x={2} y={10} width={16} height={16} {...S} />
            <Card x={18} y={18} angle={0} max="M" min="optional" n={n} />
          </Glyph>
          <span>zero or many (max M, {t.optional})</span>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {n.er.symbolOrder === 'min-inner' ? 'Outer symbol = maximum, inner symbol = minimum (participation).' : 'Outer symbol = minimum (participation), inner symbol = maximum.'} Symbols sit at the{' '}
        {t.entity} end of the line and describe how many of THAT {t.entity} relate to one of the other.
      </div>
    </div>
  )
}

const TYPES: [string, string][] = [
  ['INT', 'whole numbers: IDs, counts, years'],
  ['DECIMAL(p,s)', 'exact decimals: money, rates (p digits, s after the point)'],
  ['VARCHAR(n)', 'variable-length text up to n characters: names, notes'],
  ['CHAR(n)', 'fixed-length codes: state "CA", month "2025-03"'],
  ['DATE', 'calendar dates (YYYY-MM-DD)'],
  ['BOOLEAN', 'yes/no flags'],
]

export function SchemaQuickRef({ notation: n }: { notation: Notation }) {
  return (
    <div className="qr">
      <div className="qr-title">Column types &amp; keys</div>
      <table className="qr-table">
        <tbody>
          {TYPES.map(([t, d]) => (
            <tr key={t}>
              <td>
                <code>{t}</code>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="qr-keys">
        <span>
          PK: <b className={n.relational.pkMark === 'underline' ? 'u' : 'b'}>{n.relational.pkMark === 'underline' ? 'underlined' : 'bold'}</b>
        </span>
        <span>
          FK: <i>{n.relational.fkMark === 'italic' ? 'italic' : n.relational.fkMark}</i>
        </span>
        <span>1:M → FK on the M side</span>
        <span>M:N → bridge table, PK = both FKs</span>
        <span>multivalued → own table</span>
        <span>weak → PK = owner PK + partial key</span>
      </div>
    </div>
  )
}

export function DDLQuickRef({ notation: n }: { notation: Notation }) {
  return (
    <div className="qr">
      <div className="qr-title">CREATE TABLE cheat sheet · {n.sql.teachingDialect.split('(')[0].trim()}</div>
      <pre className="qr-pre">{`CREATE TABLE Child (
  ChildID    INT           NOT NULL,
  Name       VARCHAR(50)   NOT NULL,
  Amount     DECIMAL(9,2),
  ParentID   INT           NOT NULL,
  Code       CHAR(3)       UNIQUE,
  PRIMARY KEY (ChildID),
  FOREIGN KEY (ParentID) REFERENCES Parent (ParentID)
);`}</pre>
      <div className="qr-keys">
        <span>Composite PK: PRIMARY KEY (A, B)</span>
        <span>Optional column: omit NOT NULL</span>
        <span>1:1: FK + UNIQUE</span>
        <span>Create parents before children</span>
      </div>
    </div>
  )
}

const CHARTS: [string, string][] = [
  ['Card', 'one number (a total, a count)'],
  ['Column / bar', 'compare categories; bar when labels are long'],
  ['Line', 'trend over an ordered axis (months, years)'],
  ['Stacked column', 'composition within each category'],
  ['Pie / donut', 'share of a whole, at most ~6 slices'],
  ['Table', 'exact values, several columns'],
]
const AGGS: [string, string][] = [
  ['Sum', '"how much in total"'],
  ['Average', '"how typical / per item"'],
  ['Count', '"how many rows"'],
  ['Count distinct', '"how many different"'],
  ['Min / Max', '"smallest / largest"'],
]

export function VizQuickRef() {
  return (
    <div className="qr">
      <div className="qr-title">Which visual? Which aggregation?</div>
      <div className="qr-two">
        <table className="qr-table">
          <tbody>
            {CHARTS.map(([t, d]) => (
              <tr key={t}>
                <td>
                  <b>{t}</b>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="qr-table">
          <tbody>
            {AGGS.map(([t, d]) => (
              <tr key={t}>
                <td>
                  <b>{t}</b>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        Calculated fields: <code>Earnings + Tips</code> (row-level, then aggregated) or <code>SUM(Earnings) / SUM(Hours)</code> (already aggregated). Columns can be written as{' '}
        <code>Table.Column</code>, <code>Table[Column]</code> or <code>[Column]</code>.
      </div>
    </div>
  )
}
