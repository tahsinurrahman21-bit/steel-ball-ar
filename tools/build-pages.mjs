// Prepare a copy of the app for GitHub Pages (https://<user>.github.io/<repo>/).
// Usage:  node tools/build-release.mjs site  &&  node tools/build-pages.mjs dist/site /<repo>/
//
// The source uses root-absolute paths ("/src/...", "/node_modules/...", "/assets/...").
// A project Pages site lives under /<repo>/, so this rewrites those paths in the COPY only.
// The source files are never changed.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const [dir, baseArg = '/'] = process.argv.slice(2);
if (!dir) { console.error('usage: node tools/build-pages.mjs <folder> <base-path>'); process.exit(1); }
const base = ('/' + baseArg + '/').replace(/\/+/g, '/');

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : walk(p)) : [p];
});

let changed = 0;
for (const file of [...walk(dir), join(dir, 'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')]) {
  if (!['.html', '.js', '.mjs'].includes(extname(file))) continue;
  const src = readFileSync(file, 'utf8');
  // a quote/backtick, then /src/, /node_modules/, /assets/ or /prototypes/
  const out = src.replace(/(['"`])\/(src|node_modules|assets|prototypes)\//g, `$1${base}$2/`);
  if (out !== src) { writeFileSync(file, out); changed++; }
}
writeFileSync(join(dir, '.nojekyll'), '');   // serve node_modules/ as-is
console.log(`Pages build: ${changed} files rewritten for base ${base}`);
