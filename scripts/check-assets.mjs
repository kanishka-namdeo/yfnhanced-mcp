#!/usr/bin/env node
// Verifies the assets/ contract from assets/AGENTS.md: every expected file is
// present, inside its size budget, well-formed enough to render, and carries no
// external references that would break when loaded through <img>.
//
//   node scripts/check-assets.mjs

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SVG_MAX = 120 * 1024;
const PNG_MAX = 1024 * 1024;
const FOLDER_MAX = 3 * 1024 * 1024;

const EXPECTED_SVG = [
  'assets/logo.svg',
  'assets/banner.svg',
  'assets/social-preview.svg',
  'assets/diagrams/architecture.svg',
  'assets/terminal/demo.svg'
];

const EXPECTED_PNG = ['assets/logo-192.png', 'assets/social-preview.png'];

const EXTERNAL_PATTERNS = [
  /<script/i,
  /xlink:href\s*=\s*["']https?:/i,
  /href\s*=\s*["']https?:/i,
  /url\(\s*["']?https?:/i,
  /<image[^>]+href\s*=\s*["'](?!data:)/i,
  /@import/i
];

const failures = [];
const notes = [];

function check(label, ok, detail) {
  if (ok) {
    notes.push(`  ok    ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

for (const path of EXPECTED_SVG) {
  if (!existsSync(join(repoRoot, path))) {
    failures.push(`  FAIL  ${path} — missing`);
    continue;
  }
  const text = read(path);
  const bytes = statSync(join(repoRoot, path)).size;

  check(`${path} size`, bytes <= SVG_MAX, `${(bytes / 1024).toFixed(1)} KiB`);
  check(`${path} root element`, /^\s*<svg[\s>]/.test(text) && /<\/svg>\s*$/.test(text));
  check(`${path} declares viewBox`, /viewBox\s*=\s*"[^"]+"/.test(text));
  check(`${path} has accessible title`, /<title[\s>]/.test(text) && /<desc[\s>]/.test(text));

  const open = (text.match(/<(?!\/|!|\?)([a-zA-Z][\w:-]*)/g) ?? []).length;
  const close = (text.match(/<\/[a-zA-Z][\w:-]*>/g) ?? []).length;
  const selfClosed = (text.match(/\/>/g) ?? []).length;
  check(`${path} tag balance`, open - selfClosed <= close + 1, `${open} open / ${selfClosed} self-closed / ${close} closed`);

  const external = EXTERNAL_PATTERNS.filter((re) => re.test(text));
  check(`${path} no external references`, external.length === 0, external.map((re) => re.source).join(', '));

  check(`${path} system fonts only`, !/font-family\s*=\s*["'][^"']*https?:/i.test(text));
}

for (const path of EXPECTED_PNG) {
  if (!existsSync(join(repoRoot, path))) {
    failures.push(`  FAIL  ${path} — missing`);
    continue;
  }
  const bytes = statSync(join(repoRoot, path)).size;
  const header = readFileSync(join(repoRoot, path)).subarray(0, 8);
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  check(`${path} is a PNG`, isPng);
  check(`${path} size`, bytes <= PNG_MAX, `${(bytes / 1024).toFixed(1)} KiB`);
}

if (EXPECTED_PNG.includes('assets/social-preview.png') && existsSync(join(repoRoot, 'assets/social-preview.png'))) {
  const buf = readFileSync(join(repoRoot, 'assets/social-preview.png'));
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  check('social-preview dimensions', width === 1280 && height === 640, `${width}x${height}`);
}

let total = 0;
for (const path of [...EXPECTED_SVG, ...EXPECTED_PNG]) {
  if (existsSync(join(repoRoot, path))) total += statSync(join(repoRoot, path)).size;
}
check('assets folder budget', total <= FOLDER_MAX, `${(total / 1024 / 1024).toFixed(2)} MiB of 3 MiB`);

console.log('assets contract check\n' + notes.join('\n'));
if (failures.length) {
  console.log('\n' + failures.join('\n'));
  console.log(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log('\nAll asset checks passed.');
