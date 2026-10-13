# assets

## Purpose

Every binary and vector artifact this repository shows to a human: logo, hero banner, architecture diagrams, the rendered terminal capture, and the social-preview image. This folder exists so the repo can be understood at a glance before anyone reads prose.

Nothing in here is consumed by the runtime. `src/` never imports from `assets/`, and `package.json` `files` does not ship it to npm.

## Ownership

- `assets/AGENTS.md` (this file) owns the visual identity system: palette, type, geometry, naming, and the theme strategy. Any new asset must derive from it rather than invent its own colors or fonts.
- `assets/logo.svg`, `assets/logo-192.png` and `assets/banner.svg` own brand identity. They carry the mark, the wordmark, and the tagline, and are the only assets allowed to state a tool count or version.
- `assets/diagrams/` owns the technical showcase artwork embedded in `GITHUB-README.md`. These are hand-authored, deliberately composed pieces meant to be looked at.
- `assets/terminal/` owns the rendered capture of a real server session.
- `assets/social-preview.png` owns the GitHub Open Graph card. It is not referenced from any markdown; it is uploaded to repo Settings → General → Social preview.
- `scripts/` owns the generators that reproduce the raster artifacts and the terminal capture.
- Deeper reference diagrams (state machines, sequences, decision flows) live in `docs/` as fenced `mermaid` blocks, **not** here. See "Work Guidance" for the split.

## Local Contracts

**Theme strategy: self-contained dark cards.** Every SVG paints its own opaque dark background inside a rounded card. No asset uses `#gh-dark-mode-only` / `#gh-light-mode-only` swapping, and none relies on `prefers-color-scheme`. A dark card reads as an intentional hero panel on GitHub's light theme and disappears into the dark theme, so one file works in both and there is no second copy to drift. This is the single decision that keeps the asset count at one file per diagram.

**No external references.** SVG is embedded from markdown as `<img src>` / `![]()`, never inline — GitHub's sanitizer strips inline `<svg>`. An SVG loaded through `<img>` cannot fetch anything: no webfonts, no external CSS, no `<image href="http...">`, no scripts. Every gradient, pattern, filter and glyph must be declared inside the file.

**System font stacks only**, in this exact form:
- Sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- Mono: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`

**Palette.** Named tokens below; hardcode the hex in each SVG since CSS custom properties do not cross the `<img>` boundary.

| Token | Hex | Use |
|---|---|---|
| `bg-0` | `#0A0A14` | card base, top of gradient |
| `bg-1` | `#151027` | card base, bottom of gradient |
| `panel` | `#1B1630` | raised surfaces inside a card |
| `hairline` | `#2E2748` | 1px borders, grid rules |
| `ink` | `#F5F3FB` | primary text |
| `ink-dim` | `#A79FC0` | secondary text, labels |
| `ink-faint` | `#6E678A` | tertiary text, units, footnotes |
| `accent` | `#8B5CF6` | brand violet — primary strokes, logo, headings underline |
| `accent-2` | `#22D3EE` | brand cyan — data flow, live values, second gradient stop |
| `pos` | `#34D399` | healthy, cache hit, gains, CLOSED circuit |
| `warn` | `#FBBF24` | degraded, stale data, HALF_OPEN |
| `neg` | `#FB7185` | failure, OPEN circuit, non-retryable |

The brand gradient is `#8B5CF6` → `#22D3EE` at 135°. It is reserved for the logo mark, the wordmark underline, and at most one emphasis stroke per diagram. Everything else uses flat tokens.

**Geometry.** Card radius 24. Padding 56 on all sides. Stroke widths 1 for hairlines, 1.5 for connectors, 2 for emphasis. Arrowheads are small filled triangles, not marker strokes. Connector routing is orthogonal (horizontal/vertical with 6px corner radii) for architecture and pipeline diagrams — never diagonal, never curved splines.

**Sizes and budgets.**

| Asset | viewBox | Notes |
|---|---|---|
| `logo.svg` | `0 0 64 64` | must stay legible at 16px |
| `banner.svg` | `0 0 1280 420` | referenced at `width="100%"` |
| `diagrams/*.svg` | `0 0 1280 H`, H ≤ 900 | referenced at `width="100%"` |
| `terminal/*.svg` | `0 0 1200 H` | referenced at `width="100%"` |
| `social-preview.png` | 1280×640 raster | must be < 1 MB (GitHub rejects larger) |

No single SVG may exceed 120 KB. No PNG may exceed 1 MB. The whole folder must stay under 3 MB, because it is committed to git and cloned by every contributor.

**Accuracy.** A diagram is a claim about the code. Every node, label, threshold, TTL and arrow must be traceable to a `file:line` in `src/`. When behavior and prose disagree, the diagram draws the behavior. Numbers in the banner (tool count, prompt count, resource count, test count, coverage gate) must match what the built server actually reports — regenerate them after any change to `src/index.ts` registration.

## Work Guidance

- **SVG here, mermaid in `docs/`.** Hand-authored SVG is for the small set of showcase pieces that carry the repo's visual identity and must look deliberate. Fenced `mermaid` in `docs/` is for everything a maintainer will need to edit alongside the code, because it diffs as text and follows the viewer's theme. Never produce both forms of the same diagram — that guarantees drift. If a diagram needs frequent updating, it belongs in `docs/` as mermaid.
- Raster artifacts are generated, never hand-edited. Change the generator in `scripts/`, re-run it, commit both.
- The terminal capture must contain real output from a real run against the live Yahoo Finance API. Do not retype, reorder, truncate numbers, or invent values to make it look better. If a run returns an error or degraded data, either capture a successful run or show the error — the graceful-degradation path is a feature, not an embarrassment. State in the surrounding prose what the capture shows and when it was taken.
- Prefer `<title>` and `<desc>` in every SVG root for accessibility; they become the tooltip and the screen-reader name.
- Test an asset in both GitHub themes before considering it done, and at the width the README actually renders it (≈ 896 px on desktop). A diagram that is legible at 1280 but mushy at 896 is not finished.

## Verification

- `node scripts/check-assets.mjs` — asserts every expected asset exists, is within its size budget, parses as XML, and declares no external references.
- Visual check: open each SVG in a browser at 896 px and 1280 px, in light and dark theme.
- `npm run readme:github` then confirm every `assets/...` path referenced from `README.md` resolves on disk.
- `node scripts/render-svg.mjs <svg> <png> <cssWidth> [cssHeight] [scale]` rasterizes any SVG through headless Chrome for inspection; it writes its scratch profile under the gitignored `tmp/`.

## Provenance

The constraints this system is built around are platform limits, not taste: GitHub truncates READMEs over 500 KiB and strips inline `<svg>`; SVG loaded through `<img>` cannot fetch fonts or stylesheets; the social-preview image must be under 1 MiB with a 640×320 minimum and 1280×640 recommended; fenced `mermaid` renders natively and follows the viewer's theme, which is why it is preferred inside `docs/`. Section order and heading style follow the repo's existing Google-developer-style convention of sentence-case headings and alt text on every image.

## Child DOX Index

None. This folder is a leaf; `scripts/` is documented here rather than getting its own contract.
