import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { entry: 'src/index.ts' },
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom', '@everscribe/components-core'],
  target: 'es2020',
  // React App Router needs this in the shipped bundle, not just in source.
  // Do not add `treeshake`: it re-emits through rollup and drops this.
  banner: { js: "'use client'" },
})
