#!/usr/bin/env node
/**
 * lint:rtl — fails the build if a component reaches for a PHYSICAL direction.
 *
 * Packvio is Arabic-first. Every layout property must be logical
 * (ms-/me-/ps-/pe-/start-/end-/text-start/text-end, margin-inline-*,
 * padding-inline-*, inset-inline-*, border-inline-*) so a single stylesheet
 * serves both directions. A stray `ml-4` or `left: 0` silently breaks the
 * Arabic layout without breaking anything a type checker or a test can see,
 * which is exactly why this runs on every `npm run typecheck`.
 *
 * Escape hatch: put `rtl-ok: <reason>` in a comment on the SAME line, e.g.
 *
 *     transform: translateX(-50%); left: 50%; /* rtl-ok: centring a symmetric mark *\/
 *
 * A reason is mandatory — a bare `rtl-ok` is rejected.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_ROOT = join(WEB_ROOT, 'src');
const EXTENSIONS = ['.tsx', '.css'];

/**
 * Each rule is deliberately narrow. `(?<![\w-])` stops `text-left` from also
 * tripping the inset rule, and stops `border-radius` from tripping `border-r`.
 */
const RULES = [
  {
    id: 'physical-margin-class',
    hint: 'use ms-* / me-*',
    re: /(?<![\w-])(ml|mr)-[\w[\].%/+-]+/g,
  },
  {
    id: 'physical-padding-class',
    hint: 'use ps-* / pe-*',
    re: /(?<![\w-])(pl|pr)-[\w[\].%/+-]+/g,
  },
  {
    id: 'physical-inset-class',
    hint: 'use start-* / end-*',
    re: /(?<![\w-])(left|right)-[\w[\].%/+-]+/g,
  },
  {
    id: 'physical-text-align-class',
    hint: 'use text-start / text-end',
    re: /(?<![\w-])text-(left|right)(?![\w-])/g,
  },
  {
    id: 'physical-border-side-class',
    hint: 'use border-s / border-e',
    re: /(?<![\w-])border-(l|r)(?![\w-])/g,
  },
  {
    id: 'physical-css-property',
    hint: 'use margin-inline-* / padding-inline-* / border-inline-*',
    re: /(?<![\w-])(margin|padding|border)-(left|right)/g,
  },
  {
    id: 'physical-css-inset',
    hint: 'use inset-inline-start / inset-inline-end',
    re: /(?<![\w-])(left|right)\s*:/g,
  },
];

/** `rtl-ok:` plus at least one non-space character of justification. */
const ESCAPE_HATCH = /rtl-ok:\s*\S/;

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

const violations = [];
let filesScanned = 0;
let waived = 0;

for (const file of walk(SCAN_ROOT)) {
  filesScanned += 1;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    const exempt = ESCAPE_HATCH.test(line);

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(line)) !== null) {
        if (exempt) {
          waived += 1;
          continue;
        }
        violations.push({
          file: relative(WEB_ROOT, file).split(sep).join('/'),
          line: index + 1,
          column: match.index + 1,
          text: match[0],
          rule: rule.id,
          hint: rule.hint,
        });
      }
    }
  });
}

const scope = relative(WEB_ROOT, SCAN_ROOT).split(sep).join('/');

if (violations.length === 0) {
  console.log(
    `lint:rtl  PASS  ${filesScanned} files scanned in ${scope}/ ` +
      `(${EXTENSIONS.join(', ')})${waived ? `, ${waived} occurrence(s) waived via rtl-ok` : ''}`,
  );
  process.exit(0);
}

console.error(`lint:rtl  FAIL  ${violations.length} physical-direction violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}:${v.column}  "${v.text}"  [${v.rule}] -> ${v.hint}`);
}
console.error(
  '\nPackvio is Arabic-first: layout must use logical properties only.' +
    '\nIf a case is genuinely direction-independent, add a same-line comment: rtl-ok: <reason>',
);
process.exit(1);
