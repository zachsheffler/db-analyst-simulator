#!/usr/bin/env node
/**
 * Generates public/packs/riverbend-db.json: a content pack containing only the
 * "Riverbend Cycles" retail database (DDL + deterministic seed data).
 * Re-run with `node scripts/gen-riverbend-db.mjs` if you change the schema.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Deterministic PRNG so the dataset is stable across runs.
let seed = 20240917
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = (a) => a[Math.floor(rnd() * a.length)]
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

const ddl = [
  `CREATE TABLE Region (
  RegionID CHAR(1) PRIMARY KEY,
  RegionName VARCHAR(25) NOT NULL
)`,
  `CREATE TABLE Store (
  StoreID VARCHAR(3) PRIMARY KEY,
  StoreName VARCHAR(30) NOT NULL,
  City VARCHAR(30) NOT NULL,
  State CHAR(2) NOT NULL,
  RegionID CHAR(1) NOT NULL,
  FOREIGN KEY (RegionID) REFERENCES Region (RegionID)
)`,
  `CREATE TABLE Category (
  CategoryID CHAR(2) PRIMARY KEY,
  CategoryName VARCHAR(25) NOT NULL
)`,
  `CREATE TABLE Vendor (
  VendorID CHAR(2) PRIMARY KEY,
  VendorName VARCHAR(30) NOT NULL,
  Country VARCHAR(25) NOT NULL
)`,
  `CREATE TABLE Product (
  ProductID VARCHAR(4) PRIMARY KEY,
  ProductName VARCHAR(40) NOT NULL,
  Price DECIMAL(8,2) NOT NULL,
  CategoryID CHAR(2) NOT NULL,
  VendorID CHAR(2) NOT NULL,
  FOREIGN KEY (CategoryID) REFERENCES Category (CategoryID),
  FOREIGN KEY (VendorID) REFERENCES Vendor (VendorID)
)`,
  `CREATE TABLE Customer (
  CustomerID VARCHAR(5) PRIMARY KEY,
  FirstName VARCHAR(25) NOT NULL,
  LastName VARCHAR(25) NOT NULL,
  City VARCHAR(30) NOT NULL,
  State CHAR(2) NOT NULL,
  Zip CHAR(5),
  JoinDate DATE NOT NULL
)`,
  `CREATE TABLE SalesTransaction (
  TID VARCHAR(6) PRIMARY KEY,
  CustomerID VARCHAR(5) NOT NULL,
  StoreID VARCHAR(3) NOT NULL,
  TDate DATE NOT NULL,
  TYear INT NOT NULL,
  TMonth CHAR(7) NOT NULL,
  FOREIGN KEY (CustomerID) REFERENCES Customer (CustomerID),
  FOREIGN KEY (StoreID) REFERENCES Store (StoreID)
)`,
  `CREATE TABLE SoldVia (
  ProductID VARCHAR(4) NOT NULL,
  TID VARCHAR(6) NOT NULL,
  Quantity INT NOT NULL,
  LineTotal DECIMAL(9,2) NOT NULL,
  PRIMARY KEY (ProductID, TID),
  FOREIGN KEY (ProductID) REFERENCES Product (ProductID),
  FOREIGN KEY (TID) REFERENCES SalesTransaction (TID)
)`,
]

const regions = [
  ['W', 'West'],
  ['C', 'Central'],
  ['E', 'East'],
]
const stores = [
  ['S1', 'Riverbend Downtown', 'Portland', 'OR', 'W'],
  ['S2', 'Riverbend Eastside', 'Boise', 'ID', 'W'],
  ['S3', 'Riverbend Lakeshore', 'Madison', 'WI', 'C'],
  ['S4', 'Riverbend Capitol', 'Columbus', 'OH', 'E'],
  ['S5', 'Riverbend Harbor', 'Burlington', 'VT', 'E'], // opened recently: no transactions yet
]
const categories = [
  ['BK', 'Bikes'],
  ['AP', 'Apparel'],
  ['AC', 'Accessories'],
  ['PT', 'Parts'],
  ['NU', 'Nutrition'],
]
const vendors = [
  ['V1', 'Cascade Cycleworks', 'USA'],
  ['V2', 'Nordlys Gear', 'Norway'],
  ['V3', 'Kyoto Components', 'Japan'],
  ['V4', 'Alpen Textil', 'Germany'],
  ['V5', 'Trailhead Foods', 'USA'],
  ['V6', 'Velo Lumière', 'France'],
]
const products = [
  ['P001', 'Ridgeline Trail Bike', 1299.0, 'BK', 'V1'],
  ['P002', 'Cascade Road Bike', 1899.0, 'BK', 'V1'],
  ['P003', 'Fjord Commuter Bike', 849.0, 'BK', 'V2'],
  ['P004', 'Nordlys Gravel Bike', 2199.0, 'BK', 'V2'],
  ['P005', 'Kids Sparrow Bike', 329.0, 'BK', 'V1'],
  ['P006', 'Summit Helmet', 89.0, 'AC', 'V2'],
  ['P007', 'Commuter Helmet', 59.0, 'AC', 'V2'],
  ['P008', 'Beam Front Light', 45.0, 'AC', 'V6'],
  ['P009', 'Beam Rear Light', 29.0, 'AC', 'V6'],
  ['P010', 'Titan U-Lock', 65.0, 'AC', 'V3'],
  ['P011', 'Cable Lock', 24.0, 'AC', 'V3'],
  ['P012', 'Frame Pump', 32.0, 'AC', 'V3'],
  ['P013', 'Saddle Bag', 27.0, 'AC', 'V4'],
  ['P014', 'Water Bottle', 12.0, 'AC', 'V5'],
  ['P015', 'Alpen Jersey', 79.0, 'AP', 'V4'],
  ['P016', 'Alpen Bib Shorts', 119.0, 'AP', 'V4'],
  ['P017', 'Rain Jacket', 149.0, 'AP', 'V4'],
  ['P018', 'Thermal Gloves', 39.0, 'AP', 'V2'],
  ['P019', 'Cycling Socks', 15.0, 'AP', 'V4'],
  ['P020', 'Riverbend Cap', 22.0, 'AP', 'V4'],
  ['P021', 'Kyoto Chain', 34.0, 'PT', 'V3'],
  ['P022', 'Kyoto Cassette', 89.0, 'PT', 'V3'],
  ['P023', 'Brake Pads', 18.0, 'PT', 'V3'],
  ['P024', 'Road Tire', 52.0, 'PT', 'V3'],
  ['P025', 'Trail Tire', 68.0, 'PT', 'V1'],
  ['P026', 'Inner Tube', 9.0, 'PT', 'V3'],
  ['P027', 'Energy Gel Box', 28.0, 'NU', 'V5'],
  ['P028', 'Electrolyte Mix', 21.0, 'NU', 'V5'],
  ['P029', 'Trail Bars 12-pack', 24.0, 'NU', 'V5'],
  ['P030', 'Recovery Powder', 44.0, 'NU', 'V5'],
  ['P031', 'Carbon Seatpost', 189.0, 'PT', 'V3'], // never sold
  ['P032', 'Winter Balaclava', 26.0, 'AP', 'V2'], // never sold
]
const firstNames = ['Ava', 'Liam', 'Noah', 'Mia', 'Ethan', 'Zoe', 'Lucas', 'Emma', 'Mason', 'Chloe', 'Owen', 'Lily', 'Caleb', 'Nora', 'Isaac', 'Ruby', 'Jonah', 'Ivy', 'Miles', 'Hazel', 'Eli', 'Sadie', 'Leo', 'Maya', 'Finn', 'Tessa', 'Jude', 'Elena', 'Rowan', 'Priya', 'Amir', 'Sofia', 'Dev', 'Nina', 'Theo', 'Grace', 'Kai', 'Iris', 'Omar', 'June']
const lastNames = ['Nguyen', 'Patel', 'Garcia', 'Kim', 'Okafor', 'Brennan', 'Silva', 'Haddad', 'Lindqvist', 'Moreau', 'Tanaka', 'Rossi', 'Cohen', 'Dubois', 'Schmidt', 'Novak', 'Osei', 'Reyes', 'Iyer', 'Walsh']
const cities = [
  ['Portland', 'OR', '97209'],
  ['Portland', 'OR', '97214'],
  ['Eugene', 'OR', '97401'],
  ['Boise', 'ID', '83702'],
  ['Meridian', 'ID', '83642'],
  ['Madison', 'WI', '53703'],
  ['Milwaukee', 'WI', '53202'],
  ['Columbus', 'OH', '43215'],
  ['Dayton', 'OH', '45402'],
  ['Burlington', 'VT', '05401'],
  ['Seattle', 'WA', '98101'],
  ['Spokane', 'WA', '99201'],
  ['Chicago', 'IL', '60614'],
]

const customers = []
for (let i = 0; i < 40; i++) {
  const c = pick(cities)
  const y = 2022 + Math.floor(rnd() * 3)
  const m = 1 + Math.floor(rnd() * 12)
  const d = 1 + Math.floor(rnd() * 28)
  const zip = rnd() < 0.12 ? null : c[2]
  customers.push([`C${String(i + 1).padStart(3, '0')}`, firstNames[i], pick(lastNames), c[0], c[1], zip, `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`])
}

// Customers tend to shop at the store in their state / region.
const storeFor = (state) => {
  const local = stores.find((s) => s[3] === state)
  if (local && local[0] !== 'S5' && rnd() < 0.7) return local[0]
  return pick(['S1', 'S2', 'S3', 'S4'])
}

const transactions = []
const lines = []
let tn = 0
// Seasonality: more sales in spring/summer, growth in 2025.
for (let year = 2024; year <= 2025; year++) {
  for (let month = 1; month <= 12; month++) {
    const season = [6, 6, 9, 12, 15, 17, 18, 16, 13, 10, 8, 9][month - 1]
    const n = Math.round(season * (year === 2025 ? 1.25 : 1) * (0.8 + rnd() * 0.4))
    for (let k = 0; k < n; k++) {
      tn++
      const tid = `T${String(tn).padStart(5, '0')}`
      const c = pick(customers)
      const d = 1 + Math.floor(rnd() * 28)
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      transactions.push([tid, c[0], storeFor(c[4]), date, year, date.slice(0, 7)])
      const nLines = 1 + Math.floor(rnd() * 3) + (rnd() < 0.15 ? 1 : 0)
      const used = new Set()
      for (let j = 0; j < nLines; j++) {
        // bikes are rare, small items common
        let p
        do {
          p = pick(products.slice(0, 30))
          if (p[3] === 'BK' && rnd() < 0.75) p = null
        } while (!p || used.has(p[0]))
        used.add(p[0])
        const qty = p[3] === 'BK' ? 1 : p[2] < 30 ? 1 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 2)
        lines.push([p[0], tid, qty, Math.round(qty * p[2] * 100) / 100])
      }
    }
  }
}

const seed_ = []
for (const r of regions) seed_.push(`INSERT INTO Region VALUES (${q(r[0])}, ${q(r[1])})`)
for (const s of stores) seed_.push(`INSERT INTO Store VALUES (${s.map(q).join(', ')})`)
for (const c of categories) seed_.push(`INSERT INTO Category VALUES (${q(c[0])}, ${q(c[1])})`)
for (const v of vendors) seed_.push(`INSERT INTO Vendor VALUES (${v.map(q).join(', ')})`)
for (const p of products) seed_.push(`INSERT INTO Product VALUES (${q(p[0])}, ${q(p[1])}, ${p[2]}, ${q(p[3])}, ${q(p[4])})`)
for (const c of customers) seed_.push(`INSERT INTO Customer VALUES (${c.map((v) => (v === null ? 'NULL' : q(v))).join(', ')})`)
for (const t of transactions) seed_.push(`INSERT INTO SalesTransaction VALUES (${q(t[0])}, ${q(t[1])}, ${q(t[2])}, ${q(t[3])}, ${t[4]}, ${q(t[5])})`)
for (const l of lines) seed_.push(`INSERT INTO SoldVia VALUES (${q(l[0])}, ${q(l[1])}, ${l[2]}, ${l[3]})`)

const pack = {
  format: 'db-analyst-simulator/pack@1',
  id: 'riverbend-db',
  title: 'Riverbend Cycles database',
  description: 'A small bike-shop retail database used by the Query and Present modules.',
  databases: [
    {
      id: 'riverbend',
      name: 'Riverbend Cycles',
      description: `Retail sales for a small chain of bike shops: ${stores.length} stores, ${products.length} products, ${customers.length} customers, ${transactions.length} transactions (2024–2025).`,
      ddl,
      seed: seed_,
      tableNotes: {
        SoldVia: 'One row per product per transaction. LineTotal = Quantity × Price at time of sale.',
        SalesTransaction: 'TYear and TMonth (YYYY-MM) are stored for easy grouping.',
      },
    },
  ],
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'packs', 'riverbend-db.json')
writeFileSync(out, JSON.stringify(pack, null, 1))
console.log(`wrote ${out}: ${transactions.length} transactions, ${lines.length} lines`)
