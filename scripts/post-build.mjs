/**
 * tsc emits two builds into one package that declares "type": "module".
 * Node decides how to read a .js file from the nearest package.json, so each
 * build gets its own one-line marker. Without the CJS marker every require()
 * of this package fails with ERR_REQUIRE_ESM.
 */
import { writeFileSync } from 'node:fs';

writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

console.log('post-build: wrote dist/esm/package.json and dist/cjs/package.json');
