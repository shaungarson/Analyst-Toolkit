import { register } from 'node:module'

// Activates jsxLoaderHooks.mjs for the current process. Import this (for its side effect)
// before dynamically importing any .jsx file - never before a STATIC import of one in the
// same module, since Node resolves a file's static imports before running that file's own
// top-level code, which would try to load the untransformed JSX before this has registered.
register('./jsxLoaderHooks.mjs', import.meta.url)
