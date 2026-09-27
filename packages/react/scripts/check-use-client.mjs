// Fails the build unless 'use client' is the first line of both bundles.
//
// React App Router treats every module as a server component by default, so
// without this directive a consumer importing AuditTrail from a page gets the
// "you're importing a component that needs useState" error. It reaches the
// bundle via tsup's `banner`, which is an esbuild-level option and is silently
// dropped if `treeshake` is ever re-enabled: tsup then re-emits through rollup
// and the banner does not survive. That failure is invisible, hence this check.
import { readFile } from 'node:fs/promises'

const bundles = ['dist/index.js', 'dist/index.cjs']
const failures = []

for (const path of bundles) {
  const first = (await readFile(path, 'utf8')).split('\n', 1)[0].trim()
  if (first !== `'use client'` && first !== `"use client"`) {
    failures.push(`  ${path}: first line is ${first.slice(0, 60) || '(empty)'}`)
  }
}

if (failures.length > 0) {
  console.error(
    `\n'use client' is missing from the published bundle:\n${failures.join('\n')}\n\n` +
      `Check that tsup.config.ts still sets banner and does NOT set treeshake.\n`,
  )
  process.exit(1)
}

console.log(`'use client' verified on ${bundles.length} bundles`)
