import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { transform } from 'esbuild'

// Node module customization hooks (see registerJsxLoader.mjs) that let `node --test` mount a
// whole React component tree, not just one file (loadJsxModule.js's single-file transform is
// enough for a component with no local JSX dependencies, but DcfValuation.jsx pulls in a
// couple dozen sibling .jsx files). Two things Vite's own dev/build pipeline does that plain
// Node's ESM loader does not:
//
//   1. Resolve an extensionless relative specifier (`import Foo from './Foo'`) against this
//      project's own .jsx/.js files - Node requires the extension.
//   2. Transform JSX syntax at all.
//
// CSS side-effect imports (`import '../../styles/x.css'`) are also intercepted, since they're
// not valid JS and Node has no CSS loader - real styling has no bearing on a jsdom test with
// no visual assertions, so they resolve to an empty module rather than being stripped from
// the source (stripping would risk silently changing what's actually being tested).
const RESOLVABLE_EXTENSIONS = ['.jsx', '.js']

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL) {
    const dir = path.dirname(fileURLToPath(context.parentURL))
    for (const ext of RESOLVABLE_EXTENSIONS) {
      if (existsSync(path.join(dir, specifier + ext))) {
        return nextResolve(specifier + ext, context)
      }
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  // Scoped to this project's own source, real files only - node_modules (react, react-dom,
  // esbuild's own runtime, etc.) already ships plain, valid Node-loadable JS/ESM and needs
  // none of this, and a non-file:// URL (Node/test-runner internals) isn't a path at all.
  if (!url.startsWith('file://') || url.includes('/node_modules/')) return nextLoad(url, context)
  if (url.endsWith('.css')) {
    return { format: 'module', source: 'export default undefined;', shortCircuit: true }
  }
  if (url.endsWith('.jsx') || url.endsWith('.js')) {
    const filePath = fileURLToPath(url)
    const source = await readFile(filePath, 'utf8')
    // `apiBase.js` reads `import.meta.env.VITE_API_BASE_URL`, a Vite-injected value plain
    // Node has no equivalent for - defined away to an empty object so its own `|| ''`
    // fallback resolves exactly as it would for an unset env var in a real deployment,
    // rather than crashing on `undefined.VITE_API_BASE_URL`. Every .js file gets the same
    // esbuild pass as .jsx (not just the one that needs it) so this loader has one rule, not
    // a per-file exception list.
    const { code } = await transform(source, {
      loader: url.endsWith('.jsx') ? 'jsx' : 'js',
      jsx: 'automatic',
      jsxImportSource: 'react',
      format: 'esm',
      sourcefile: filePath,
      define: { 'import.meta.env': '{}' },
    })
    return { format: 'module', source: code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
