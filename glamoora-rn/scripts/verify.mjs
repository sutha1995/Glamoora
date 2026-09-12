/**
 * `npm run verify` — dependency-free check of the marketplace rules and the
 * AI parser, as required by PRD §21 ("after each phase: run tests/build checks").
 *
 * Compiles the storage-agnostic parts of src/ with the project's own tsc, drops
 * in minimal shims for the two React Native modules the DB touches, then runs
 * the assertions in src/__tests__ on plain Node. No jest, no extra installs.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const out = join(project, '.verify');

rmSync(out, { recursive: true, force: true });

console.log('› typecheck + compile src/ (domain, db, ai, data, tests)');
execFileSync(process.execPath, [join(project, 'node_modules/typescript/bin/tsc'), '-p', join(here, 'tsconfig.verify.json')], {
  cwd: project,
  stdio: 'inherit',
});

/* ---- minimal React Native shims so db/storage.ts runs headless ---- */
function shim(pkg, body, extra = {}) {
  const dir = join(out, 'node_modules', ...pkg.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: pkg, version: '0.0.0-test', main: 'index.js', ...extra }, null, 2));
  writeFileSync(join(dir, 'index.js'), body);
}

shim('react-native', `
exports.Platform = { OS: 'web', select: (o) => (o.web !== undefined ? o.web : o.default) };
exports.StyleSheet = { create: (s) => s, absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } };
`);

shim('@react-native-async-storage/async-storage', `
const mem = new Map();
module.exports = {
  __esModule: true,
  default: {
    getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: async (k, v) => { mem.set(k, String(v)); },
    removeItem: async (k) => { mem.delete(k); },
  },
};
`);

const entry = join(out, '__tests__', 'index.js');
if (!existsSync(entry)) {
  console.error('✗ compiled test entry not found at', entry);
  process.exit(1);
}

console.log('› run src/__tests__');
execFileSync(process.execPath, [entry], { cwd: project, stdio: 'inherit' });
