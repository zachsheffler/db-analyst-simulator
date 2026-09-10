/** Name normalization for lenient matching of student vs. reference names. */

const STOP = new Set(['the', 'of', 'a', 'an'])

export function singular(w: string): string {
  if (w.length <= 3) return w
  if (/(ss|us|is)$/.test(w)) return w
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y'
  if (/(ches|shes|xes|ses|zes)$/.test(w)) return w.slice(0, -2)
  if (/s$/.test(w)) return w.slice(0, -1)
  return w
}

/** Common abbreviations students use. */
const SYNONYMS: Record<string, string> = {
  identifier: 'id',
  num: 'number',
  no: 'number',
  nbr: 'number',
  qty: 'quantity',
  amt: 'amount',
  desc: 'description',
  descr: 'description',
  dept: 'department',
  emp: 'employee',
  cust: 'customer',
  addr: 'address',
  tel: 'phone',
  telephone: 'phone',
  dob: 'birthdate',
  dateofbirth: 'birthdate',
  birthday: 'birthdate',
  fname: 'firstname',
  lname: 'lastname',
  surname: 'lastname',
  cat: 'category',
  prod: 'product',
  trans: 'transaction',
  txn: 'transaction',
}

export function canonical(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map((w) => SYNONYMS[w] ?? singular(w))
    .join('')
}

/** Does `student` refer to the same thing as `ref` (or one of its aliases)? */
export function sameName(student: string, ref: string, aliases: string[] = []): boolean {
  const s = canonical(student)
  if (!s) return false
  return [ref, ...aliases].map(canonical).includes(s)
}

/** Fuzzy: student "cust_id" matches reference "ID" inside table "Customer", and vice versa. */
export function sameColumn(student: string, ref: string, aliases: string[] = [], scope?: string): boolean {
  if (sameName(student, ref, aliases)) return true
  if (!scope) return false
  const sc = canonical(scope)
  const strip = (x: string) =>
    x.startsWith(sc) && x.length > sc.length
      ? x.slice(sc.length)
      : x.endsWith(sc) && x.length > sc.length
        ? x.slice(0, -sc.length)
        : x
  const s = strip(canonical(student))
  return [ref, ...aliases].map((r) => strip(canonical(r))).some((r) => r.length > 0 && r === s)
}

/** Best match in a list; returns index or -1. */
export function findMatch<T>(
  student: string,
  refs: T[],
  get: (r: T) => { name: string; aliases?: string[] },
  used: Set<number> = new Set(),
): number {
  for (let i = 0; i < refs.length; i++) {
    if (used.has(i)) continue
    const r = get(refs[i])
    if (sameName(student, r.name, r.aliases)) return i
  }
  return -1
}

export function checkNamingCase(name: string, style: 'snake' | 'pascal' | 'camel' | 'upper' | 'free'): boolean {
  switch (style) {
    case 'snake':
      return /^[a-z][a-z0-9_]*$/.test(name)
    case 'pascal':
      return /^[A-Z][A-Za-z0-9]*$/.test(name)
    case 'camel':
      return /^[a-z][A-Za-z0-9]*$/.test(name)
    case 'upper':
      return /^[A-Z][A-Z0-9_]*$/.test(name)
    default:
      return true
  }
}
