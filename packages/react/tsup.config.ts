import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { entry: 'src/index.ts' },
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom', '@everscribe/components-core'],
  target: 'es2020',
  treeshake: true,
})
