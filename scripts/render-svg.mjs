#!/usr/bin/env node
// Renders an SVG asset to PNG through headless Chrome so the artwork can be
// inspected at the exact pixel size GitHub will display it.
//
//   node scripts/render-svg.mjs <input.svg> <output.png> <cssWidth> [cssHeight] [scale]
//
// Chrome is autodetected; override with CHROME_PATH. No npm dependencies.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'No Chromium-family browser found. Set CHROME_PATH to chrome.exe or msedge.exe.'
  );
}

function main() {
  const [input, output, widthArg, heightArg, scaleArg] = process.argv.slice(2);
  if (!input || !output || !widthArg) {
    console.error('usage: render-svg.mjs <input.svg> <output.png> <cssWidth> [cssHeight] [scale]');
    process.exit(2);
  }

  const width = Number(widthArg);
  const svgText = readFileSync(resolve(repoRoot, input), 'utf8');
  const viewBox = /viewBox\s*=\s*"([^"]+)"/.exec(svgText);
  if (!viewBox) throw new Error(`${input}: no viewBox found, cannot infer aspect ratio`);
  const [, , vbH, vbW] = viewBox[1].trim().split(/\s+/).map(Number);

  const height = heightArg ? Number(heightArg) : Math.round((width * vbH) / vbW);
  const scale = Number(scaleArg ?? 2);

  // Scratch profile lives under the repo's gitignored tmp/ so it never lands on C:.
  const scratch = join(repoRoot, 'tmp', 'render');
  mkdirSync(scratch, { recursive: true });
  const htmlPath = join(scratch, 'render.html');
  const profileDir = join(scratch, 'profile');

  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `html,body{margin:0;padding:0;background:transparent;overflow:hidden}` +
      `svg{display:block;width:${width}px;height:${height}px}` +
      `</style></head><body>${svgText}</body></html>`,
    'utf8'
  );

  mkdirSync(dirname(resolve(repoRoot, output)), { recursive: true });
  const outPath = resolve(repoRoot, output);

  const chrome = findChrome();
  const result = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      `--force-device-scale-factor=${scale}`,
      `--window-size=${width},${height}`,
      '--default-background-color=00000000',
      `--user-data-dir=${profileDir}`,
      `--screenshot=${outPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
  );

  rmSync(profileDir, { recursive: true, force: true });
  rmSync(htmlPath, { force: true });

  if (result.status !== 0) {
    console.error((result.stderr || '').trim());
    throw new Error(`Chrome exited ${result.status}`);
  }
  if (!existsSync(outPath)) throw new Error(`Chrome reported success but wrote no file: ${outPath}`);

  const bytes = readFileSync(outPath).length;
  console.log(`${output}  ${width * scale}x${height * scale}  ${(bytes / 1024).toFixed(1)} KiB`);
}

main();
