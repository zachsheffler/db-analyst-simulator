/** Split a SQL script into statements (handles ; inside quotes and comments). */
export function splitStatements(script: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (let i = 0; i < script.length; i++) {
    const c = script[i]
    const next = script[i + 1]
    if (quote) {
      cur += c
      if (c === quote) quote = null
      continue
    }
    if (c === '-' && next === '-') {
      const end = script.indexOf('\n', i)
      i = end === -1 ? script.length : end
      cur += '\n'
      continue
    }
    if (c === '/' && next === '*') {
      const end = script.indexOf('*/', i + 2)
      i = end === -1 ? script.length : end + 1
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
