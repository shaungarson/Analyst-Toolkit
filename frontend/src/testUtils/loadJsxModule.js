import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { transform } from 'esbuild'

// `node --test` (this project's test runner - see package.json's "test" script) has no JSX
// transform, unlike the app's own Vite/Rolldown build. This loads one .jsx component for a
// test by transforming it with esbuild and importing the result from a real temp file next
// to the source (so its bare `import 'react'` still resolves via the normal node_modules
// walk-up), rather than changing the npm test script or adding a project-wide loader.
//
// A component that imports another component (DriverTornadoChart -> ChartNotes) needs the
// same treatment applied to its dependency: node cannot import a .jsx file itself, so every
// relative .jsx specifier is transformed to its own temp file and the specifier rewritten to
// point at it. Non-.jsx imports are left alone - node loads those directly.
const RELATIVE_JSX_IMPORT = /(?:from|import)\s+['"](\.[^'"]*\.jsx)['"]/g

let counter = 0

async function materialize(absolutePath, created, cache) {
  const cached = cache.get(absolutePath)
  if (cached) return cached

  const source = readFileSync(absolutePath, 'utf8')
  const { code } = await transform(source, {
    loader: 'jsx',
    jsx: 'automatic',
    jsxImportSource: 'react',
    format: 'esm',
    sourcefile: absolutePath,
  })

  const dir = path.dirname(absolutePath)
  const base = path.basename(absolutePath, '.jsx')
  const tmpPath = path.join(dir, `.${base}.test-transformed.${Date.now()}.${counter++}.mjs`)
  // Recorded before recursing, so a cycle resolves to the name already chosen for it rather
  // than transforming forever.
  cache.set(absolutePath, tmpPath)

  let rewritten = code
  const specifiers = new Set([...code.matchAll(RELATIVE_JSX_IMPORT)].map((m) => m[1]))
  for (const specifier of specifiers) {
    const depTmp = await materialize(path.resolve(dir, specifier), created, cache)
    rewritten = rewritten.split(specifier).join(`./${path.basename(depTmp)}`)
  }

  writeFileSync(tmpPath, rewritten, 'utf8')
  created.push(tmpPath)
  return tmpPath
}

export async function loadJsxModule(absolutePath) {
  const created = []
  const entry = await materialize(absolutePath, created, new Map())
  try {
    return await import(pathToFileURL(entry).href)
  } finally {
    for (const tmpPath of created) rmSync(tmpPath, { force: true })
  }
}
