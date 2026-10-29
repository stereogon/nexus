/**
 * Vite's ambient types.
 *
 * Needed for the side-effect `import "./ui/styles/index.css"` in `main.tsx`: without it
 * TypeScript has no declaration for a stylesheet module and rejects the import. Kept as a
 * reference rather than `compilerOptions.types`, so that adding it does not silently
 * replace the default type resolution for everything else.
 */
/// <reference types="vite/client" />
