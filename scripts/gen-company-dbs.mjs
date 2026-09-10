#!/usr/bin/env node
/**
 * Generates the three employer databases (deterministic seed data):
 *   public/packs/dave-db.json     Dave's gig log (easy)
 *   public/packs/utt-db.json      Ulysses Tech Tips (medium)
 *   public/packs/mega-db.json     Mega EpicGames (hard)
 * Re-run with `npm run gen:db`.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let seed = 424242
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = (a) => a[Math.floor(rnd() * a.length)]
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const money = (x) => Math.round(x * 100) / 100
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : q(v))
const ins = (table, row) => `INSERT INTO ${table} VALUES (${row.map(lit).join(', ')})`
const pad = (n) => String(n).padStart(2, '0')
const date = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'packs')
const write = (file, pack) => {
  writeFileSync(join(outDir, file), JSON.stringify(pack, null, 1))
  console.log(`wrote ${file}: ${pack.databases[0].seed.length} rows`)
}

// =============================================================================
// DAVE (easy)
// =============================================================================
{
  const ddl = [
    `CREATE TABLE Vehicle (
  VehicleID INT PRIMARY KEY,
  Nickname VARCHAR(30) NOT NULL,
  VehicleType VARCHAR(10) NOT NULL,
  ModelYear INT NOT NULL,
  CostPerMile DECIMAL(5,2) NOT NULL
)`,
    `CREATE TABLE Platform (
  PlatformID INT PRIMARY KEY,
  PlatformName VARCHAR(30) NOT NULL,
  ServiceType VARCHAR(20) NOT NULL,
  CommissionPct DECIMAL(4,1) NOT NULL
)`,
    `CREATE TABLE Gig (
  GigID INT PRIMARY KEY,
  GigDate DATE NOT NULL,
  GigMonth CHAR(7) NOT NULL,
  PlatformID INT NOT NULL,
  VehicleID INT NOT NULL,
  Hours DECIMAL(4,2) NOT NULL,
  Miles DECIMAL(6,1) NOT NULL,
  Earnings DECIMAL(7,2) NOT NULL,
  Tips DECIMAL(6,2) NOT NULL,
  FOREIGN KEY (PlatformID) REFERENCES Platform (PlatformID),
  FOREIGN KEY (VehicleID) REFERENCES Vehicle (VehicleID)
)`,
    `CREATE TABLE ExpenseCategory (
  CategoryID INT PRIMARY KEY,
  CategoryName VARCHAR(20) NOT NULL
)`,
    `CREATE TABLE Expense (
  ExpenseID INT PRIMARY KEY,
  ExpenseDate DATE NOT NULL,
  ExpenseMonth CHAR(7) NOT NULL,
  VehicleID INT,
  CategoryID INT NOT NULL,
  Amount DECIMAL(7,2) NOT NULL,
  Note VARCHAR(60),
  FOREIGN KEY (VehicleID) REFERENCES Vehicle (VehicleID),
  FOREIGN KEY (CategoryID) REFERENCES ExpenseCategory (CategoryID)
)`,
  ]
  const vehicles = [
    [1, 'The Corolla', 'Car', 2016, 0.32],
    [2, 'Vespa', 'Scooter', 2020, 0.11],
    [3, 'Old Faithful', 'Bicycle', 2018, 0.02],
  ]
  const platforms = [
    [1, 'DashRush', 'Food delivery', 20.0],
    [2, 'Rydr', 'Rideshare', 25.0],
    [3, 'PackagePal', 'Package delivery', 15.0],
    [4, 'GrubGo', 'Food delivery', 18.0],
  ]
  const categories = [
    [1, 'Fuel'],
    [2, 'Maintenance'],
    [3, 'Insurance'],
    [4, 'Phone'],
    [5, 'Gear'],
    [6, 'Parking'],
  ]
  const seedRows = []
  vehicles.forEach((v) => seedRows.push(ins('Vehicle', v)))
  platforms.forEach((p) => seedRows.push(ins('Platform', p)))
  categories.forEach((c) => seedRows.push(ins('ExpenseCategory', c)))
  // gigs: 2025, ~35 per month; summer has more bike gigs
  let gid = 0
  for (let m = 1; m <= 12; m++) {
    const n = int(28, 42)
    for (let k = 0; k < n; k++) {
      gid++
      const d = int(1, 28)
      const plat = pick(platforms)
      let veh
      if (plat[2] === 'Rideshare') veh = vehicles[0]
      else if (plat[2] === 'Package delivery') veh = pick([vehicles[0], vehicles[1]])
      else veh = m >= 5 && m <= 9 ? pick([vehicles[1], vehicles[2], vehicles[2]]) : pick([vehicles[0], vehicles[1]])
      const hours = money(int(2, 7) + rnd())
      const mph = veh[2] === 'Car' ? 14 : veh[2] === 'Scooter' ? 9 : 6
      const miles = Math.round(hours * mph * (0.7 + rnd() * 0.6) * 10) / 10
      const rate = plat[2] === 'Rideshare' ? 21 : plat[2] === 'Package delivery' ? 17 : 15
      const earnings = money(hours * rate * (0.8 + rnd() * 0.5))
      const tips = money(plat[2] === 'Package delivery' ? rnd() * 5 : earnings * (0.08 + rnd() * 0.2))
      seedRows.push(ins('Gig', [gid, date(2025, m, d), `2025-${pad(m)}`, plat[0], veh[0], hours, miles, earnings, tips]))
    }
  }
  // expenses
  let eid = 0
  for (let m = 1; m <= 12; m++) {
    eid++
    seedRows.push(ins('Expense', [eid, date(2025, m, 1), `2025-${pad(m)}`, null, 4, 45.0, 'Phone plan']))
    eid++
    seedRows.push(ins('Expense', [eid, date(2025, m, 3), `2025-${pad(m)}`, 1, 3, 112.5, 'Car insurance']))
    for (let w = 0; w < 4; w++) {
      eid++
      seedRows.push(ins('Expense', [eid, date(2025, m, 4 + w * 7), `2025-${pad(m)}`, 1, 1, money(38 + rnd() * 30), 'Gas']))
    }
    if (rnd() < 0.4) {
      eid++
      seedRows.push(ins('Expense', [eid, date(2025, m, int(5, 27)), `2025-${pad(m)}`, 2, 1, money(6 + rnd() * 6), 'Scooter fuel']))
    }
    if (rnd() < 0.35) {
      eid++
      const v = pick(vehicles)
      seedRows.push(ins('Expense', [eid, date(2025, m, int(5, 27)), `2025-${pad(m)}`, v[0], 2, money(v[2] === 'Car' ? 80 + rnd() * 320 : v[2] === 'Scooter' ? 30 + rnd() * 90 : 10 + rnd() * 40), pick(['Oil change', 'Tires', 'Brake pads', 'Tune-up', 'Chain', 'Battery'])]))
    }
    if (rnd() < 0.3) {
      eid++
      seedRows.push(ins('Expense', [eid, date(2025, m, int(5, 27)), `2025-${pad(m)}`, pick([2, 3]), 5, money(15 + rnd() * 60), pick(['Helmet', 'Rain jacket', 'Phone mount', 'Insulated bag', 'Lights'])]))
    }
    for (let k = 0; k < int(1, 4); k++) {
      eid++
      seedRows.push(ins('Expense', [eid, date(2025, m, int(2, 28)), `2025-${pad(m)}`, 1, 6, money(3 + rnd() * 12), 'Parking']))
    }
  }
  write('dave-db.json', {
    format: 'db-analyst-simulator/pack@1',
    id: 'dave-db',
    title: "Dave's gig log (database)",
    companies: [
      {
        id: 'dave',
        name: "Dave's Gig Log",
        tier: 'easy',
        logo: '🛵',
        contact: 'Dave',
        tagline: 'Our friend Dave drives, scoots and pedals for four gig apps and wants to know if any of it is worth it.',
        description:
          "Dave is one person with a car, a motor scooter and a bicycle. He picks up shifts on food-delivery, rideshare and package apps, and keeps every receipt in a shoebox. He'd like the shoebox turned into a small database and some honest numbers: what he earns per hour, what each vehicle really costs, and which app is best.",
      },
    ],
    databases: [
      {
        id: 'dave',
        name: "Dave's Gig Log",
        description: `${gid} gigs and ${eid} expenses across 2025, 3 vehicles, 4 platforms.`,
        ddl,
        seed: seedRows,
        tableNotes: {
          Gig: 'One row per shift. Earnings is before platform commission; Tips are separate.',
          Expense: 'VehicleID is NULL for expenses that are not tied to a vehicle (phone plan).',
        },
      },
    ],
  })
}

// =============================================================================
// ULYSSES TECH TIPS (medium)
// =============================================================================
{
  const ddl = [
    `CREATE TABLE Department (
  DeptID INT PRIMARY KEY,
  DeptName VARCHAR(30) NOT NULL
)`,
    `CREATE TABLE Employee (
  EmpID INT PRIMARY KEY,
  EmpName VARCHAR(40) NOT NULL,
  Title VARCHAR(40) NOT NULL,
  DeptID INT NOT NULL,
  HireDate DATE NOT NULL,
  AnnualSalary INT NOT NULL,
  ManagerID INT,
  FOREIGN KEY (DeptID) REFERENCES Department (DeptID),
  FOREIGN KEY (ManagerID) REFERENCES Employee (EmpID)
)`,
    `CREATE TABLE Channel (
  ChannelID INT PRIMARY KEY,
  ChannelName VARCHAR(40) NOT NULL,
  Subscribers INT NOT NULL,
  LaunchYear INT NOT NULL
)`,
    `CREATE TABLE Sponsor (
  SponsorID INT PRIMARY KEY,
  SponsorName VARCHAR(40) NOT NULL,
  Industry VARCHAR(30) NOT NULL
)`,
    `CREATE TABLE Manufacturer (
  ManufacturerID INT PRIMARY KEY,
  ManufacturerName VARCHAR(40) NOT NULL,
  Country VARCHAR(30) NOT NULL
)`,
    `CREATE TABLE Product (
  ProductID INT PRIMARY KEY,
  ProductName VARCHAR(60) NOT NULL,
  ManufacturerID INT NOT NULL,
  Category VARCHAR(30) NOT NULL,
  MSRP DECIMAL(8,2) NOT NULL,
  FOREIGN KEY (ManufacturerID) REFERENCES Manufacturer (ManufacturerID)
)`,
    `CREATE TABLE Video (
  VideoID INT PRIMARY KEY,
  Title VARCHAR(100) NOT NULL,
  PublishDate DATE NOT NULL,
  PublishMonth CHAR(7) NOT NULL,
  ChannelID INT NOT NULL,
  HostEmpID INT NOT NULL,
  VideoType VARCHAR(20) NOT NULL,
  DurationMin INT NOT NULL,
  Views INT NOT NULL,
  FOREIGN KEY (ChannelID) REFERENCES Channel (ChannelID),
  FOREIGN KEY (HostEmpID) REFERENCES Employee (EmpID)
)`,
    `CREATE TABLE VideoProduct (
  VideoID INT NOT NULL,
  ProductID INT NOT NULL,
  Verdict VARCHAR(15) NOT NULL,
  PRIMARY KEY (VideoID, ProductID),
  FOREIGN KEY (VideoID) REFERENCES Video (VideoID),
  FOREIGN KEY (ProductID) REFERENCES Product (ProductID)
)`,
    `CREATE TABLE Sponsorship (
  SponsorshipID INT PRIMARY KEY,
  VideoID INT NOT NULL,
  SponsorID INT NOT NULL,
  Fee DECIMAL(9,2) NOT NULL,
  Placement VARCHAR(10) NOT NULL,
  FOREIGN KEY (VideoID) REFERENCES Video (VideoID),
  FOREIGN KEY (SponsorID) REFERENCES Sponsor (SponsorID)
)`,
  ]
  const departments = [
    [1, 'Admin'],
    [2, 'Writing'],
    [3, 'Camera'],
    [4, 'Editing'],
    [5, 'Lab'],
    [6, 'Sponsorships'],
  ]
  // [id, name, title, dept, hire, salary, manager]
  const employees = [
    [1, 'Ulysses Sebastian', 'Founder & Host', 1, '2008-11-24', 210000, null],
    [2, 'Yvonne Ho', 'Chief Operating Officer', 1, '2013-03-04', 165000, 1],
    [3, 'Luke Lafreniere', 'Head of Writing', 2, '2011-06-13', 118000, 2],
    [4, 'Priya Anand', 'Writer & Host', 2, '2018-02-19', 82000, 3],
    [5, 'Marcus Bell', 'Writer', 2, '2020-09-07', 71000, 3],
    [6, 'Dana Sorensen', 'Head of Camera', 3, '2014-05-26', 104000, 2],
    [7, 'Kwame Mensah', 'Camera Operator', 3, '2019-08-12', 68000, 6],
    [8, 'Ren Takahashi', 'Camera Operator', 3, '2021-04-05', 64000, 6],
    [9, 'Sofia Petrov', 'Head of Editing', 4, '2015-10-19', 99000, 2],
    [10, 'Jonah Whitfield', 'Editor', 4, '2019-01-14', 72000, 9],
    [11, 'Amara Okoye', 'Editor', 4, '2022-06-27', 66000, 9],
    [12, 'Theo Brandt', 'Editor', 4, '2023-03-13', 61000, 9],
    [13, 'Nadia Rahman', 'Head of Lab', 5, '2016-07-11', 121000, 2],
    [14, 'Elliot Park', 'Lab Technician & Host', 5, '2019-11-04', 86000, 13],
    [15, 'Zoe Castellano', 'Lab Technician', 5, '2022-01-31', 74000, 13],
    [16, 'Gareth Owens', 'Head of Sponsorships', 6, '2017-04-17', 112000, 2],
    [17, 'Mei Lin', 'Sponsorship Coordinator', 6, '2021-08-23', 69000, 16],
    [18, 'Colin Hart', 'Host', 2, '2017-09-18', 91000, 3],
  ]
  const channels = [
    [1, 'Ulysses Tech Tips', 15800000, 2008],
    [2, 'TechSnackie', 4300000, 2012],
    [3, 'BriefCircuit', 2100000, 2019],
    [4, 'Mac Adjacent', 900000, 2021],
  ]
  const sponsors = [
    [1, 'NordVault VPN', 'Software'],
    [2, 'SquareSpice', 'Software'],
    [3, 'RazorRidge', 'Peripherals'],
    [4, 'Cloud Nine Hosting', 'Software'],
    [5, 'Glasswing Monitors', 'Displays'],
    [6, 'PrimeCable', 'Accessories'],
    [7, 'Spearmint Mobile', 'Telecom'],
    [8, 'Radiant Learning', 'Education'],
    [9, 'Ridge Wallet Co.', 'Accessories'],
  ]
  const manufacturers = [
    [1, 'Envida', 'USA'],
    [2, 'DMA', 'USA'],
    [3, 'Outtel', 'USA'],
    [4, 'Privateer', 'USA'],
    [5, 'Logitrek', 'Switzerland'],
    [6, 'Pear', 'USA'],
    [7, 'Samsong', 'South Korea'],
    [8, 'ASUX', 'Taiwan'],
    [9, 'Noctuna', 'Austria'],
    [10, 'Frameworks', 'USA'],
  ]
  const products = [
    [1, 'Envida RTX 5090 Founders', 1, 'GPU', 1999],
    [2, 'Envida RTX 5070', 1, 'GPU', 549],
    [3, 'DMA Radeon RX 9070 XT', 2, 'GPU', 599],
    [4, 'DMA Ryzen 9 9950X3D', 2, 'CPU', 699],
    [5, 'DMA Ryzen 5 9600X', 2, 'CPU', 279],
    [6, 'Outtel Core Ultra 9 285K', 3, 'CPU', 589],
    [7, 'Outtel Core Ultra 5 245K', 3, 'CPU', 309],
    [8, 'Privateer K100 Keyboard', 4, 'Peripheral', 229],
    [9, 'Privateer 6500D Case', 4, 'Case', 199],
    [10, 'Privateer HX1200i PSU', 4, 'PSU', 299],
    [11, 'Logitrek MX Master 4', 5, 'Peripheral', 119],
    [12, 'Logitrek G Pro X Superlight 2', 5, 'Peripheral', 159],
    [13, 'Pear MacBook Pro M5', 6, 'Laptop', 2499],
    [14, 'Pear Mac Mini M4', 6, 'Desktop', 599],
    [15, 'Pear Studio Display', 6, 'Monitor', 1599],
    [16, 'Samsong Odyssey OLED G9', 7, 'Monitor', 1299],
    [17, 'Samsong 990 Pro 4TB SSD', 7, 'Storage', 349],
    [18, 'ASUX ROG Strix X870E', 8, 'Motherboard', 499],
    [19, 'ASUX ProArt PA32UCXR', 8, 'Monitor', 2999],
    [20, 'ASUX ROG Ally X', 8, 'Handheld', 799],
    [21, 'Noctuna NH-D15 G2', 9, 'Cooler', 149],
    [22, 'Noctuna NF-A12x25 Fan', 9, 'Cooler', 35],
    [23, 'Frameworks Laptop 16', 10, 'Laptop', 1699],
    [24, 'Frameworks Desktop', 10, 'Desktop', 1099],
    [25, 'Envida Shield TV Pro', 1, 'Streaming', 199],
    [26, 'Samsong Galaxy S25 Ultra', 7, 'Phone', 1299],
    [27, 'Pear iPhone 17 Pro', 6, 'Phone', 1199],
    [28, 'Logitrek Brio 4K Webcam', 5, 'Peripheral', 199],
  ]
  const seedRows = []
  departments.forEach((d) => seedRows.push(ins('Department', d)))
  employees.forEach((e) => seedRows.push(ins('Employee', e)))
  channels.forEach((c) => seedRows.push(ins('Channel', c)))
  sponsors.forEach((s) => seedRows.push(ins('Sponsor', s)))
  manufacturers.forEach((m) => seedRows.push(ins('Manufacturer', m)))
  products.forEach((p) => seedRows.push(ins('Product', p)))

  const hosts = [1, 4, 14, 18, 3]
  const titleTemplates = {
    Review: ['{p} Review - Worth It?', 'I tested the {p} for 30 days', '{p}: The Honest Review', 'Is the {p} a scam?'],
    Build: ['We built a PC around the {p}', '$1000 vs $3000 PC ft. {p}', 'Ultimate {c} build with the {p}'],
    Explainer: ['Why {c}s are getting so expensive', 'How does a {c} actually work?', 'The {c} market explained in 12 minutes'],
    Vlog: ['A day at the Ulysses Lab', 'We moved the entire studio', 'Answering your questions about the {p}'],
  }
  let vid = 0
  const videoProducts = []
  const sponsorships = []
  let sid = 0
  const usedTitles = new Set()
  for (let y = 2024; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      const n = int(6, 9)
      for (let k = 0; k < n; k++) {
        vid++
        const ch = rnd() < 0.55 ? channels[0] : pick(channels.slice(1))
        const type = pick(['Review', 'Review', 'Build', 'Explainer', 'Vlog'])
        const prods = []
        const nProd = type === 'Vlog' ? (rnd() < 0.3 ? 1 : 0) : type === 'Build' ? int(2, 4) : type === 'Explainer' ? int(0, 1) : 1
        while (prods.length < nProd) {
          const p = pick(products.slice(0, 26)) // last two products are never featured
          if (!prods.includes(p)) prods.push(p)
        }
        const main = prods[0] ?? pick(products)
        let title = pick(titleTemplates[type]).replace('{p}', main[1]).replace('{c}', main[3])
        if (usedTitles.has(title)) title += ` (Part ${int(2, 4)})`
        usedTitles.add(title)
        const views = Math.round((ch[2] / 25) * (0.3 + rnd() * 1.4) * (type === 'Review' ? 1.2 : 1))
        const dur = type === 'Vlog' ? int(10, 25) : type === 'Build' ? int(18, 40) : int(9, 22)
        seedRows.push(ins('Video', [vid, title, date(y, m, int(1, 28)), `${y}-${pad(m)}`, ch[0], pick(hosts), type, dur, views]))
        for (const p of prods) videoProducts.push([vid, p[0], pick(['Recommended', 'Recommended', 'Mixed', 'Not recommended'])])
        const nSponsors = ch[0] === 1 ? int(1, 2) : rnd() < 0.7 ? 1 : 0
        const used = new Set()
        for (let s = 0; s < nSponsors; s++) {
          const sp = pick(sponsors)
          if (used.has(sp[0])) continue
          used.add(sp[0])
          sid++
          const fee = money((ch[2] / 1000000) * (2500 + rnd() * 2500) * (s === 0 ? 1 : 0.6))
          sponsorships.push([sid, vid, sp[0], fee, s === 0 ? 'Pre-roll' : 'Mid-roll'])
        }
      }
    }
  }
  videoProducts.forEach((v) => seedRows.push(ins('VideoProduct', v)))
  sponsorships.forEach((s) => seedRows.push(ins('Sponsorship', s)))
  write('utt-db.json', {
    format: 'db-analyst-simulator/pack@1',
    id: 'utt-db',
    title: 'Ulysses Tech Tips (database)',
    companies: [
      {
        id: 'utt',
        name: 'Ulysses Tech Tips',
        tier: 'medium',
        logo: '🎬',
        contact: 'Yvonne (COO)',
        tagline: 'A tech YouTube studio with four channels, a hardware lab, a sponsorship desk, and a founder who drops things.',
        description:
          'Ulysses Tech Tips is a mid-sized media company: eighteen employees in six departments produce videos for four channels, review products from a dozen manufacturers, and sell sponsorship slots. The COO wants clean data on who hosts what, which sponsors pay, and which products the lab actually recommends.',
      },
    ],
    databases: [
      {
        id: 'utt',
        name: 'Ulysses Tech Tips',
        description: `${vid} videos (2024–2025) across 4 channels, ${products.length} products, ${sponsorships.length} sponsorship deals, ${employees.length} employees.`,
        ddl,
        seed: seedRows,
        tableNotes: {
          Employee: 'ManagerID references another employee (NULL for the founder).',
          VideoProduct: 'Which products appear in which video, with the verdict given.',
          Sponsorship: 'One row per sponsor slot sold in a video (Pre-roll or Mid-roll).',
        },
      },
    ],
  })
}

// =============================================================================
// MEGA EPICGAMES (hard)
// =============================================================================
{
  const ddl = [
    `CREATE TABLE Studio (
  StudioID INT PRIMARY KEY,
  StudioName VARCHAR(40) NOT NULL,
  Country VARCHAR(30) NOT NULL,
  IsInternal INT NOT NULL
)`,
    `CREATE TABLE Genre (
  GenreID INT PRIMARY KEY,
  GenreName VARCHAR(20) NOT NULL
)`,
    `CREATE TABLE Platform (
  PlatformID INT PRIMARY KEY,
  PlatformName VARCHAR(20) NOT NULL
)`,
    `CREATE TABLE Game (
  GameID INT PRIMARY KEY,
  Title VARCHAR(60) NOT NULL,
  StudioID INT NOT NULL,
  GenreID INT NOT NULL,
  ReleaseDate DATE NOT NULL,
  ListPrice DECIMAL(6,2) NOT NULL,
  PublishedByMega INT NOT NULL,
  StoreCutPct INT NOT NULL,
  FOREIGN KEY (StudioID) REFERENCES Studio (StudioID),
  FOREIGN KEY (GenreID) REFERENCES Genre (GenreID)
)`,
    `CREATE TABLE GamePlatform (
  GameID INT NOT NULL,
  PlatformID INT NOT NULL,
  PRIMARY KEY (GameID, PlatformID),
  FOREIGN KEY (GameID) REFERENCES Game (GameID),
  FOREIGN KEY (PlatformID) REFERENCES Platform (PlatformID)
)`,
    `CREATE TABLE Customer (
  CustomerID INT PRIMARY KEY,
  Username VARCHAR(30) NOT NULL,
  Country VARCHAR(30) NOT NULL,
  JoinDate DATE NOT NULL,
  Tier VARCHAR(10) NOT NULL
)`,
    `CREATE TABLE StoreSale (
  SaleID INT PRIMARY KEY,
  GameID INT NOT NULL,
  CustomerID INT NOT NULL,
  SaleDate DATE NOT NULL,
  SaleMonth CHAR(7) NOT NULL,
  PricePaid DECIMAL(6,2) NOT NULL,
  MegaRevenue DECIMAL(6,2) NOT NULL,
  FOREIGN KEY (GameID) REFERENCES Game (GameID),
  FOREIGN KEY (CustomerID) REFERENCES Customer (CustomerID)
)`,
    `CREATE TABLE Review (
  GameID INT NOT NULL,
  CustomerID INT NOT NULL,
  Rating INT NOT NULL,
  ReviewDate DATE NOT NULL,
  PRIMARY KEY (GameID, CustomerID),
  FOREIGN KEY (GameID) REFERENCES Game (GameID),
  FOREIGN KEY (CustomerID) REFERENCES Customer (CustomerID)
)`,
    `CREATE TABLE HardwareProduct (
  HardwareID INT PRIMARY KEY,
  ProductName VARCHAR(50) NOT NULL,
  HardwareType VARCHAR(20) NOT NULL,
  UnitCost DECIMAL(7,2) NOT NULL,
  UnitPrice DECIMAL(7,2) NOT NULL
)`,
    `CREATE TABLE CreditAccount (
  AccountID INT PRIMARY KEY,
  CustomerID INT NOT NULL UNIQUE,
  CreditLimit DECIMAL(8,2) NOT NULL,
  OpenDate DATE NOT NULL,
  Status VARCHAR(10) NOT NULL,
  FOREIGN KEY (CustomerID) REFERENCES Customer (CustomerID)
)`,
    `CREATE TABLE HardwareOrder (
  OrderID INT PRIMARY KEY,
  CustomerID INT NOT NULL,
  OrderDate DATE NOT NULL,
  OrderMonth CHAR(7) NOT NULL,
  PaymentMethod VARCHAR(10) NOT NULL,
  ShipCountry VARCHAR(30) NOT NULL,
  FOREIGN KEY (CustomerID) REFERENCES Customer (CustomerID)
)`,
    `CREATE TABLE HardwareOrderLine (
  OrderID INT NOT NULL,
  HardwareID INT NOT NULL,
  Quantity INT NOT NULL,
  UnitPricePaid DECIMAL(7,2) NOT NULL,
  PRIMARY KEY (OrderID, HardwareID),
  FOREIGN KEY (OrderID) REFERENCES HardwareOrder (OrderID),
  FOREIGN KEY (HardwareID) REFERENCES HardwareProduct (HardwareID)
)`,
    `CREATE TABLE CreditTransaction (
  AccountID INT NOT NULL,
  TxnNo INT NOT NULL,
  TxnDate DATE NOT NULL,
  TxnType VARCHAR(10) NOT NULL,
  Amount DECIMAL(8,2) NOT NULL,
  OrderID INT,
  PRIMARY KEY (AccountID, TxnNo),
  FOREIGN KEY (AccountID) REFERENCES CreditAccount (AccountID),
  FOREIGN KEY (OrderID) REFERENCES HardwareOrder (OrderID)
)`,
  ]
  const studios = [
    [1, 'Mega Studios Cary', 'USA', 1],
    [2, 'Mega Studios Montréal', 'Canada', 1],
    [3, 'Mega Studios Seoul', 'South Korea', 1],
    [4, 'Pixel Foundry', 'USA', 0],
    [5, 'Northwind Interactive', 'Sweden', 0],
    [6, 'Kōri Games', 'Japan', 0],
    [7, 'Bastion Works', 'United Kingdom', 0],
    [8, 'Lantern Lane', 'Australia', 0],
    [9, 'Redshift Labs', 'Germany', 0],
    [10, 'Halcyon Point', 'Poland', 0],
  ]
  const genres = [
    [1, 'Shooter'],
    [2, 'RPG'],
    [3, 'Strategy'],
    [4, 'Puzzle'],
    [5, 'Racing'],
    [6, 'Sandbox'],
    [7, 'Sports'],
  ]
  const platforms = [
    [1, 'PC'],
    [2, 'PlayBox'],
    [3, 'Switchable'],
    [4, 'MobiOS'],
  ]
  // [id, title, studio, genre, release, price, publishedByMega]
  const games = [
    [1, 'Fortnight Royale', 1, 1, '2017-09-26', 0, 1],
    [2, 'Rocket Sphere', 4, 7, '2015-07-07', 19.99, 1],
    [3, 'Gears of Battle 6', 1, 1, '2024-11-12', 69.99, 1],
    [4, 'Infinity Sword', 3, 2, '2022-03-08', 39.99, 1],
    [5, 'Unreal Contest', 1, 1, '2019-05-14', 29.99, 1],
    [6, 'Fall Beans', 8, 7, '2020-08-04', 0, 1],
    [7, 'Hollow Night', 5, 2, '2021-02-24', 14.99, 0],
    [8, 'Stardew Vale', 6, 6, '2016-02-26', 14.99, 0],
    [9, 'Civilization Ultimate', 7, 3, '2023-10-19', 59.99, 0],
    [10, 'Cyberpunk 2088', 10, 2, '2020-12-10', 59.99, 0],
    [11, 'Forza Corridor 6', 7, 5, '2024-05-21', 69.99, 0],
    [12, 'Tetrix Effect', 6, 4, '2018-11-09', 29.99, 0],
    [13, 'Alan Awake II', 5, 1, '2023-10-27', 49.99, 0],
    [14, 'Portal Chambers', 9, 4, '2022-06-14', 9.99, 0],
    [15, 'Satisfactory Factory', 9, 6, '2024-09-10', 39.99, 0],
    [16, 'Balatro Cards', 8, 4, '2024-02-20', 14.99, 0],
    [17, 'Control Room', 5, 1, '2019-08-27', 29.99, 0],
    [18, 'Mega Kart Racers', 2, 5, '2025-04-15', 49.99, 1],
    [19, 'Hades Underworld', 4, 2, '2020-09-17', 24.99, 0],
    [20, 'Frostpunk Frontier', 10, 3, '2024-09-20', 44.99, 0],
    [21, 'Lego Fortnight', 2, 6, '2023-12-07', 0, 1],
    [22, 'Sea of Pirates', 7, 6, '2018-03-20', 39.99, 0],
    [23, 'Slay the Tower', 4, 4, '2019-01-23', 24.99, 0],
    [24, 'Manor Estates', 9, 3, '2024-04-26', 39.99, 0],
  ].map((g) => [...g, g[6] ? 100 : 12])
  const gamePlatforms = []
  for (const g of games) {
    gamePlatforms.push([g[0], 1])
    if (rnd() < 0.7) gamePlatforms.push([g[0], 2])
    if (rnd() < 0.5) gamePlatforms.push([g[0], 3])
    if (g[5] === 0 && rnd() < 0.8) gamePlatforms.push([g[0], 4])
  }
  const countries = ['USA', 'USA', 'USA', 'Canada', 'United Kingdom', 'Germany', 'France', 'Brazil', 'Japan', 'South Korea', 'Australia', 'Mexico', 'India', 'Poland']
  const adjectives = ['Shadow', 'Neon', 'Turbo', 'Quiet', 'Crimson', 'Pixel', 'Frost', 'Solar', 'Lucky', 'Iron', 'Velvet', 'Cosmic', 'Rapid', 'Sleepy', 'Golden']
  const nouns = ['Fox', 'Wolf', 'Raven', 'Otter', 'Knight', 'Ghost', 'Panda', 'Comet', 'Viper', 'Falcon', 'Badger', 'Lynx', 'Rogue', 'Sprout', 'Nomad']
  const customers = []
  const usedNames = new Set()
  for (let i = 1; i <= 160; i++) {
    let name
    do name = `${pick(adjectives)}${pick(nouns)}${int(1, 99)}`
    while (usedNames.has(name))
    usedNames.add(name)
    const y = int(2019, 2025)
    customers.push([i, name, pick(countries), date(y, int(1, 12), int(1, 28)), rnd() < 0.3 ? 'Plus' : 'Free'])
  }
  const hardware = [
    [1, 'MegaPad Controller', 'Controller', 28, 59.99],
    [2, 'MegaPad Pro Controller', 'Controller', 61, 129.99],
    [3, 'Mega Deck Handheld', 'Console', 310, 549.99],
    [4, 'Mega Deck OLED', 'Console', 380, 699.99],
    [5, 'Vortex Headset', 'Headset', 35, 89.99],
    [6, 'Vortex Headset Wireless', 'Headset', 70, 179.99],
    [7, 'USB-C Charge Cable 2m', 'Accessory', 2.5, 14.99],
    [8, 'Mega Deck Dock', 'Accessory', 22, 79.99],
    [9, 'Mega Deck Carry Case', 'Accessory', 9, 34.99],
    [10, 'Vortex VR Kit', 'Console', 240, 449.99],
  ]
  const seedRows = []
  studios.forEach((s) => seedRows.push(ins('Studio', s)))
  genres.forEach((g) => seedRows.push(ins('Genre', g)))
  platforms.forEach((p) => seedRows.push(ins('Platform', p)))
  games.forEach((g) => seedRows.push(ins('Game', g)))
  gamePlatforms.forEach((gp) => seedRows.push(ins('GamePlatform', gp)))
  customers.forEach((c) => seedRows.push(ins('Customer', c)))
  hardware.forEach((h) => seedRows.push(ins('HardwareProduct', h)))

  // store sales 2024-2025
  let saleId = 0
  const bought = new Set()
  const paidGames = games.filter((g) => g[5] > 0)
  for (let y = 2024; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      const n = int(30, 48) + (m === 11 || m === 12 ? 15 : 0)
      for (let k = 0; k < n; k++) {
        const g = pick(paidGames)
        const c = pick(customers.slice(0, 145)) // a few customers never buy games
        const key = `${g[0]}-${c[0]}`
        if (bought.has(key)) continue
        bought.add(key)
        saleId++
        const disc = rnd() < 0.35 ? pick([0.5, 0.67, 0.75, 0.8]) : 1
        const paid = money(g[5] * disc)
        const mega = money((paid * g[7]) / 100)
        seedRows.push(ins('StoreSale', [saleId, g[0], c[0], date(y, m, int(1, 28)), `${y}-${pad(m)}`, paid, mega]))
      }
    }
  }
  // reviews: subset of purchases + free games
  const reviewed = new Set()
  const reviews = []
  for (const key of bought) {
    if (rnd() < 0.3) {
      const [g, c] = key.split('-').map(Number)
      reviewed.add(key)
      reviews.push([g, c, int(1, 5), date(2025, int(1, 12), int(1, 28))])
    }
  }
  for (const g of games.filter((x) => x[5] === 0)) {
    for (let k = 0; k < 25; k++) {
      const c = pick(customers)
      const key = `${g[0]}-${c[0]}`
      if (reviewed.has(key)) continue
      reviewed.add(key)
      reviews.push([g[0], c[0], int(2, 5), date(pick([2024, 2025]), int(1, 12), int(1, 28))])
    }
  }
  reviews.forEach((r) => seedRows.push(ins('Review', r)))

  // credit accounts: 40 customers
  const creditCustomers = [...customers].sort(() => rnd() - 0.5).slice(0, 40)
  const accounts = creditCustomers.map((c, i) => [i + 1, c[0], pick([500, 1000, 1500, 2500]), date(2024, int(1, 12), int(1, 28)), rnd() < 0.1 ? 'Frozen' : rnd() < 0.05 ? 'Closed' : 'Open'])
  accounts.forEach((a) => seedRows.push(ins('CreditAccount', a)))
  const accountByCustomer = new Map(accounts.map((a) => [a[1], a]))

  // hardware orders
  let orderId = 0
  const orders = []
  const lines = []
  const txns = []
  const txnNo = new Map()
  const addTxn = (acc, dt, type, amount, orderRef) => {
    const n = (txnNo.get(acc) ?? 0) + 1
    txnNo.set(acc, n)
    txns.push([acc, n, dt, type, amount, orderRef])
  }
  for (let y = 2024; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      const n = int(7, 12) + (m === 12 ? 6 : 0)
      for (let k = 0; k < n; k++) {
        orderId++
        const c = pick(customers)
        const acc = accountByCustomer.get(c[0])
        const useCredit = acc && acc[4] === 'Open' && rnd() < 0.6
        const dt = date(y, m, int(1, 28))
        orders.push([orderId, c[0], dt, `${y}-${pad(m)}`, useCredit ? 'Credit' : 'Card', c[2]])
        const nLines = int(1, 3)
        const used = new Set()
        let total = 0
        for (let j = 0; j < nLines; j++) {
          const h = pick(hardware)
          if (used.has(h[0])) continue
          used.add(h[0])
          const qty = h[1].includes('Cable') ? int(1, 3) : 1
          const price = money(h[4] * (rnd() < 0.2 ? 0.85 : 1))
          lines.push([orderId, h[0], qty, price])
          total += qty * price
        }
        if (useCredit) addTxn(acc[0], dt, 'Charge', money(total), orderId)
      }
    }
  }
  // payments and fees
  for (const a of accounts) {
    const charges = txns.filter((t) => t[0] === a[0] && t[3] === 'Charge')
    let owed = charges.reduce((s, t) => s + t[4], 0)
    for (const ch of charges) {
      if (rnd() < 0.8) {
        const pay = money(rnd() < 0.6 ? ch[4] : ch[4] * 0.5)
        const [y, m] = ch[2].split('-').map(Number)
        const ny = m === 12 ? y + 1 : y
        const nm = m === 12 ? 1 : m + 1
        addTxn(a[0], date(Math.min(ny, 2025), nm, int(1, 28)), 'Payment', pay, null)
        owed -= pay
      } else {
        addTxn(a[0], ch[2].slice(0, 8) + '28', 'Fee', 15, null)
      }
    }
  }
  txns.sort((x, y) => x[0] - y[0] || x[1] - y[1])
  orders.forEach((o) => seedRows.push(ins('HardwareOrder', o)))
  lines.forEach((l) => seedRows.push(ins('HardwareOrderLine', l)))
  txns.forEach((t) => seedRows.push(ins('CreditTransaction', t)))

  write('mega-db.json', {
    format: 'db-analyst-simulator/pack@1',
    id: 'mega-db',
    title: 'Mega EpicGames (database)',
    companies: [
      {
        id: 'mega',
        name: 'Mega EpicGames',
        tier: 'hard',
        logo: '🎮',
        contact: 'the VP of Analytics',
        tagline: 'Developer, publisher, storefront, hardware maker, and (unwisely) a lender. Thirteen tables and counting.',
        description:
          'Mega EpicGames develops games in its own studios, publishes them, and runs a digital store that also sells third-party games for a 12% cut. It sells its own hardware, extends lines of credit to customers for hardware purchases, and collects reviews. Finance, publishing, store, hardware and credit all want different answers from the same data.',
      },
    ],
    databases: [
      {
        id: 'mega',
        name: 'Mega EpicGames',
        description: `${games.length} games from ${studios.length} studios, ${customers.length} customers, ${saleId} store sales, ${orders.length} hardware orders, ${accounts.length} credit accounts (2024–2025).`,
        ddl,
        seed: seedRows,
        tableNotes: {
          Game: 'PublishedByMega = 1 for games Mega publishes. StoreCutPct is the share of each sale Mega keeps (100 for its own, 12 for third-party).',
          StoreSale: 'MegaRevenue = PricePaid × StoreCutPct / 100.',
          Review: 'One review per customer per game.',
          CreditAccount: 'At most one account per customer (1:1).',
          CreditTransaction: 'Numbered per account (weak entity). Charge / Payment / Fee. OrderID links a charge to the hardware order it paid for.',
          HardwareOrderLine: 'One row per product per order.',
        },
      },
    ],
  })
}
