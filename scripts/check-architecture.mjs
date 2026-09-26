#!/usr/bin/env node
// Architecture guard. Enforces the layer rules in ARCHITECTURE.md:
//   layer-direction  a layer imports only from layers below it
//   cross-slice      entities/features slices never import each other
//   public-api       another slice is imported through its index.js only
//   runtime-import   src imports only node: built-ins and relative paths
//   name-clash       no file named like a sibling directory (lib.js + lib/)
//   runtime-deps     package.json has no runtime dependencies
// File and function size limits live in eslint.config.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYERS = ['shared', 'entities', 'features', 'app'];
const ISOLATED = new Set(['entities', 'features']);
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export function importsOf(source) {
  return [...source.matchAll(IMPORT_RE)].map((m) => m[1] || m[2]);
}

// { layer, slice, rel } for a file under src/, or null.
export function locate(file, srcRoot) {
  const rel = path.relative(srcRoot, file).split(path.sep).join('/');
  const [layer, slice] = rel.split('/');
  return LAYERS.includes(layer) ? { layer, slice, rel } : null;
}

function isSliceIndex(to) {
  return to.rel === `${to.layer}/${to.slice}/index.js`;
}

// The rule an import from `fromFile` of `spec` breaks, or null.
export function checkImport(fromFile, spec, srcRoot) {
  if (spec.startsWith('node:')) return null;
  if (!spec.startsWith('.')) return { rule: 'runtime-import', detail: `package "${spec}"` };
  const from = locate(fromFile, srcRoot);
  const to = locate(path.resolve(path.dirname(fromFile), spec), srcRoot);
  if (!from || !to) return null;
  const detail = `${from.rel} -> ${to.rel}`;
  if (LAYERS.indexOf(from.layer) < LAYERS.indexOf(to.layer)) return { rule: 'layer-direction', detail };
  const sameSlice = from.layer === to.layer && from.slice === to.slice;
  if (sameSlice) return null;
  if (from.layer === to.layer && ISOLATED.has(from.layer)) return { rule: 'cross-slice', detail };
  if (to.layer !== 'app' && !isSliceIndex(to)) return { rule: 'public-api', detail };
  return null;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function nameClashes(dir, root, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const dirs = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  for (const e of entries) {
    const base = e.name.replace(/\.m?js$/, '');
    if (e.isFile() && base !== e.name && dirs.has(base)) {
      out.push({ rule: 'name-clash', detail: path.relative(root, path.join(dir, e.name)) });
    }
    if (e.isDirectory()) nameClashes(path.join(dir, e.name), root, out);
  }
  return out;
}

export function checkRepo(root) {
  const srcRoot = path.join(root, 'src');
  const violations = [];
  for (const file of walk(srcRoot)) {
    for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
      const v = checkImport(file, spec, srcRoot);
      if (v) violations.push({ ...v, file: path.relative(root, file) });
    }
  }
  violations.push(...nameClashes(srcRoot, root));
  const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies || {});
  if (deps.length) violations.push({ rule: 'runtime-deps', detail: deps.join(', ') });
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const violations = checkRepo(root);
  for (const v of violations) console.error(`✗ ${v.rule}: ${v.detail}${v.file ? ` (${v.file})` : ''}`);
  console.log(violations.length ? `${violations.length} architecture violation(s)` : '✓ architecture ok');
  process.exitCode = violations.length ? 1 : 0;
}
