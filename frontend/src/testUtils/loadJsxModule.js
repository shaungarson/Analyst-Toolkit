import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { transform } from 'esbuild'

// `node --test` (this project's test runner - see package.json's "test" script) has no JSX
// transform, unlike the app's own Vite/Rolldown build. This loads one .jsx component for a
// test by transforming it with esbuild and importing the result from a real temp file next
// to the source (so its bare `import 'react'` still resolves via the normal node_modules
// walk-up), rather than changing the npm test script or adding a project-wide loader.
export async function loadJsxModule(absolutePath) {
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
  const tmpPath = path.join(dir, `.${base}.test-transformed.${Date.now()}.mjs`)
  writeFileSync(tmpPath, code, 'utf8')
  try {
    return await import(pathToFileURL(tmpPath).href)
  } finally {
    rmSync(tmpPath, { force: true })
  }
}
