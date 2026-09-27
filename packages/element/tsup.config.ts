import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: { entry: 'src/index.ts' },
    clean: true,
    sourcemap: true,
    external: ['@everscribe/components-core'],
    target: 'es2020',
    treeshake: true,
  },
  // Self-contained bundle for a <script type="module"> tag. core is inlined
  // rather than external, so the output has no bare specifiers and needs no
  // import map. clean is false so this does not wipe the build above.
  {
    entry: { browser: 'src/index.ts' },
    format: ['esm'],
    noExternal: ['@everscribe/components-core'],
    dts: false,
    clean: false,
    sourcemap: true,
    target: 'es2020',
    treeshake: true,
  },
])
