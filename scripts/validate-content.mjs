#!/usr/bin/env node
// Bundles scripts/validate-content.ts with rolldown (so it can import the app's TypeScript graders) and runs it.
import { build } from 'rolldown'
import { mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', 'node_modules', '.cache', 'dbsim')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, 'validate.mjs')
await build({
  input: resolve(here, 'validate-content.ts'),
  external: ['sql.js', 'react', /^node:/, /\.wasm\?url$/],
  platform: 'node',
  output: { file: out, format: 'esm' },
  logLevel: 'silent',
})
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, DBSIM_ROOT: resolve(here, '..') } })
process.exit(r.status ?? 1)
