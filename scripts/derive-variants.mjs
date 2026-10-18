#!/usr/bin/env node
/**
 * Derive variant families in docs/catalog.json.
 *
 *   node scripts/derive-variants.mjs            # report only
 *   node scripts/derive-variants.mjs --write    # write the keys back
 *
 * WHY THIS IS STRUCTURAL, NOT A WORD LIST
 * ---------------------------------------
 * The obvious approach — keep a vocabulary of colour words, strip them from the
 * name, group by what is left — breaks on this catalogue immediately. "Clear"
 * is a colour in most catalogues and a product type in this one ("PET Clear
 * Cup"); "Kraft" is a colour in "Carry Bag Kraft 19 cm" and a material
 * everywhere else. A word list cannot tell those apart, and the failure mode is
 * silent: two unrelated products merge into one card.
 *
 * So grouping is decided by SHAPE instead. Two products are variants of each
 * other when their names, tokenised, differ in exactly ONE contiguous span and
 * agree everywhere else:
 *
 *   Leaf Spoon 11.5 cm [Pearl]        vs  Leaf Spoon 11.5 cm [Candy Green]
 *   Carry Bag [White] 19 cm           vs  Carry Bag [Kraft] 19 cm
 *   Shaker [12] OZ Kraft              vs  Shaker [16] OZ Kraft
 *
 * The vocabulary is then used only to CLASSIFY the differing span — is this a
 * colour, a size, or something we do not recognise — and an unrecognised span
 * does NOT group. That inverts the risk: a word list that is too small leaves
 * products ungrouped (visible, harmless), where a word list that is too eager
 * merges products that are not the same thing (invisible, wrong).
 *
 * Groups are then built by union-find, so a family varying on two axes at once
 * (Shaker: 3 sizes x 3 colours = 9 SKUs) collapses into one group rather than
 * three.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'docs', 'catalog.json');
const WRITE = process.argv.includes('--write');

// --- vocabularies, used ONLY to classify a differing span ------------------

/**
 * Colour names, lower-cased, longest first so "candy green" wins over "green".
 * A span qualifies as a colour only if EVERY token in it is in this set.
 */
const COLOURS = new Map([
  ['pearl', '#F2EFE6'],
  ['candy green', '#8CC63F'],
  ['blueberry', '#4A5FA5'],
  ['sunflower', '#F5C518'],
  ['lemon grass', '#C6D94A'],
  ['bubblegum', '#F49AC2'],
  ['lavender', '#B49BD4'],
  ['rose pink', '#E8A0B4'],
  ['apple green', '#9ACD32'],
  ['peach', '#F5C2A0'],
  ['mint', '#A8D8C8'],
  ['white', '#FFFFFF'],
  ['black', '#1B1B1F'],
  ['kraft', '#C19A6B'],
  ['brown kraft', '#A47449'],
  // Deliberately NOT here: "clear" (a product type in "PET Clear Cup"),
  // "mixed" (a pack composition, not a colour), and the bare "green"/"pink"/
  // "blue" which only ever appear as part of a two-word colour above.
]);

/** A span is a size when every token matches one of these. */
const SIZE_UNIT = /^(oz|cm|mm|ml|cc|g|ply|layers)$/i;
const SIZE_NUMBER = /^\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?$/;
const SIZE_WORD = /^(xxs|xs|s|m|l|xl|xxl|tall|short|single|double)$/i;

/** Materials. Recognised so they can be EXCLUDED — see the note at the bottom. */
const MATERIALS = new Set(['pet', 'pp', 'ps', 'ops', 'pulp', 'paper', 'plastic', 'wooden', 'aluminium']);

// --- helpers ---------------------------------------------------------------

const tokens = (s) => s.trim().split(/\s+/).filter(Boolean);

/**
 * If `a` and `b` differ in exactly one contiguous span, return that span from
 * each side. Otherwise null.
 */
function singleDiff(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  let head = 0;
  while (head < A.length && head < B.length && A[head].toLowerCase() === B[head].toLowerCase()) head++;
  let tail = 0;
  while (
    tail < A.length - head &&
    tail < B.length - head &&
    A[A.length - 1 - tail].toLowerCase() === B[B.length - 1 - tail].toLowerCase()
  ) tail++;

  const spanA = A.slice(head, A.length - tail);
  const spanB = B.slice(head, B.length - tail);
  // Both empty means the names are identical; that is not a variant pair.
  if (spanA.length === 0 && spanB.length === 0) return null;
  return { head, tail, spanA, spanB };
}

function classify(span) {
  if (span.length === 0) return 'empty';
  const lower = span.map((t) => t.toLowerCase());
  const joined = lower.join(' ');
  if (COLOURS.has(joined)) return 'color';
  if (lower.every((t) => COLOURS.has(t))) return 'color';
  if (lower.every((t) => SIZE_UNIT.test(t) || SIZE_NUMBER.test(t) || SIZE_WORD.test(t))) return 'size';
  if (lower.every((t) => MATERIALS.has(t))) return 'material';
  return 'other';
}

/**
 * The swatch for a label, if one can be read out of it with confidence.
 *
 * Scans for a known colour ANYWHERE in the label rather than requiring the
 * whole label to be one: a two-axis family labels its members "12 OZ Black",
 * and the card should still be able to show the colour. Longest match first so
 * "Candy Green" is not read as "Green" (which is not in the map anyway, but the
 * ordering is what makes adding it later safe).
 *
 * Returns null when nothing matches. A missing swatch is fine — the UI falls
 * back to the text label — where a WRONG swatch is a buyer ordering the wrong
 * colour, so this never guesses.
 */
function swatchFor(label) {
  if (!label) return null;
  const lower = ` ${label.toLowerCase()} `;
  const names = [...COLOURS.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (lower.includes(` ${name} `)) return COLOURS.get(name);
  }
  return null;
}

/** Union-find. */
class DSU {
  constructor() { this.parent = new Map(); }
  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r);
    while (this.parent.get(x) !== r) { const n = this.parent.get(x); this.parent.set(x, r); x = n; }
    return r;
  }
  union(a, b) { const ra = this.find(a); const rb = this.find(b); if (ra !== rb) this.parent.set(ra, rb); }
}

const slugify = (s) =>
  s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

/** Token-wise longest common prefix/suffix across every member of a group. */
function commonAffixes(names) {
  const lists = names.map(tokens);
  const shortest = Math.min(...lists.map((l) => l.length));
  let head = 0;
  while (head < shortest && lists.every((l) => l[head].toLowerCase() === lists[0][head].toLowerCase())) head++;
  let tail = 0;
  while (
    tail < shortest - head &&
    lists.every((l) => l[l.length - 1 - tail].toLowerCase() === lists[0][lists[0].length - 1 - tail].toLowerCase())
  ) tail++;
  return { head, tail, lists };
}

/**
 * Units that belong to the NUMBER in front of them, not to the product name.
 * Arabic included, because the same split is computed independently per locale.
 */
const TRAILING_UNIT = new Set([
  'oz', 'cm', 'mm', 'ml', 'cc', 'g', 'ply', 'layers', 'cup', 'cups', 'pcs',
  'سم', 'مل', 'أونصة', 'سم³', 'مم', 'جم', 'غم', 'لتر', 'كوب', 'أكواب', 'طبقات',
]);

/**
 * Split a family's names into a shared stem and a per-member variant label.
 *
 * The plain longest-common-affix answer strands the unit. "Food Tray Kraft 17
 * cm" and "Food Tray White 17 cm" share the prefix "Food Tray" and the suffix
 * "cm", which leaves the stem reading "Food Tray cm" and the labels reading
 * "Kraft 17" — a size with no unit, next to a product name with a dangling one.
 *
 * So any unit tokens at the FRONT of the shared suffix are handed back to each
 * label, but only when every label ends in a digit — i.e. only when that unit
 * genuinely measures the thing that varies. "Sushi Tray with Lid" keeps its
 * suffix because the labels there are already whole.
 */
function splitFamily(names) {
  const { head, tail, lists } = commonAffixes(names);
  const first = lists[0];
  const prefix = first.slice(0, head);
  let suffix = tail > 0 ? first.slice(first.length - tail) : [];
  let labels = lists.map((l) => l.slice(head, l.length - tail));

  while (
    suffix.length > 0 &&
    TRAILING_UNIT.has(suffix[0].toLowerCase()) &&
    labels.every((m) => m.length > 0 && /\d$/.test(m[m.length - 1]))
  ) {
    const unit = suffix.shift();
    labels = labels.map((m) => [...m, unit]);
  }

  return {
    stem: [...prefix, ...suffix].join(' ').trim(),
    labels: labels.map((m) => m.join(' ').trim()),
  };
}

// --- run -------------------------------------------------------------------

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const products = catalog.products;
const byCode = new Map(products.map((p) => [p.code, p]));

// 1. Pair up products that differ in exactly one colour- or size-shaped span.
const dsu = new DSU();
const axisSeen = new Map(); // root -> Set of axes
const rejected = [];

for (let i = 0; i < products.length; i++) {
  for (let j = i + 1; j < products.length; j++) {
    const a = products[i];
    const b = products[j];
    if (a.category !== b.category) continue;

    const diff = singleDiff(a.nameEn, b.nameEn);
    if (!diff) continue;

    const ka = classify(diff.spanA);
    const kb = classify(diff.spanB);
    // Both sides must be the SAME recognised kind. "Lid 8 oz" vs "Lid White"
    // differs in one span but compares a size to a colour — not a variant pair.
    if (ka !== kb) continue;
    if (ka !== 'color' && ka !== 'size') {
      if (ka === 'material' || ka === 'other') {
        rejected.push({ a: a.code, b: b.code, kind: ka, span: `${diff.spanA.join(' ')} | ${diff.spanB.join(' ')}` });
      }
      continue;
    }

    dsu.union(a.code, b.code);
    const root = dsu.find(a.code);
    if (!axisSeen.has(root)) axisSeen.set(root, new Set());
    axisSeen.get(root).add(ka);
  }
}

// 2. Collect members per root.
const groups = new Map();
for (const p of products) {
  const root = dsu.find(p.code);
  if (!groups.has(root)) groups.set(root, []);
  groups.get(root).push(p);
}

// 3. Keep only real families, and describe each one.
const families = [];
for (const [root, members] of groups) {
  if (members.length < 2) continue;

  // Axes have to be recomputed over the whole merged set, not per pair.
  const axes = new Set();
  for (const r of [...axisSeen.keys()]) {
    if (dsu.find(r) === dsu.find(root)) for (const a of axisSeen.get(r)) axes.add(a);
  }
  const axis = axes.size > 1 ? 'both' : [...axes][0];

  members.sort((a, b) => a.code.localeCompare(b.code));
  const namesEn = members.map((m) => m.nameEn);
  const namesAr = members.map((m) => m.nameAr);

  const en = splitFamily(namesEn);
  const ar = splitFamily(namesAr);
  const stemEn = en.stem;
  const stemAr = ar.stem;
  const labelsEn = en.labels;
  const labelsAr = ar.labels;

  families.push({ key: slugify(`${members[0].category} ${stemEn}`), axis, stemEn, stemAr, members, labelsEn, labelsAr });
}

families.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));

// --- report ----------------------------------------------------------------

const grouped = families.reduce((n, f) => n + f.members.length, 0);
console.log(`products:           ${products.length}`);
console.log(`variant families:   ${families.length}`);
console.log(`products in a family: ${grouped}`);
console.log(`standalone products:  ${products.length - grouped}`);
console.log(`cards after grouping: ${families.length + (products.length - grouped)}`);
console.log();

const byAxis = families.reduce((m, f) => { m[f.axis] = (m[f.axis] ?? 0) + 1; return m; }, {});
console.log('families by axis:', JSON.stringify(byAxis));
console.log();

console.log('--- every family ---');
for (const f of families) {
  console.log(`${f.key}  [${f.axis}]  (${f.members.length})   stem: "${f.stemEn}" / "${f.stemAr}"`);
  f.members.forEach((m, i) => {
    const sw = swatchFor(f.labelsEn[i]);
    console.log(`     ${m.code.padEnd(20)} ${(f.labelsEn[i] || '(none)').padEnd(16)} ${(f.labelsAr[i] || '(none)').padEnd(14)} ${sw ?? ''}`);
  });
}

if (rejected.length) {
  console.log();
  console.log(`--- NOT grouped (${rejected.length} candidate pairs) ---`);
  const byKind = {};
  for (const r of rejected) (byKind[r.kind] ??= []).push(r);
  for (const [kind, rs] of Object.entries(byKind)) {
    console.log(`  ${kind}: ${rs.length}`);
    for (const r of rs.slice(0, 8)) console.log(`     ${r.a} / ${r.b}   span: ${r.span}`);
    if (rs.length > 8) console.log(`     ... and ${rs.length - 8} more`);
  }
}

// --- write -----------------------------------------------------------------

if (WRITE) {
  for (const f of families) {
    f.members.forEach((m, i) => {
      const target = byCode.get(m.code);
      target.variantGroup = f.key;
      target.variantAxis = f.axis;
      target.variantLabelEn = f.labelsEn[i] || null;
      target.variantLabelAr = f.labelsAr[i] || null;
      target.variantGroupNameEn = f.stemEn;
      target.variantGroupNameAr = f.stemAr;
      const swatch = swatchFor(f.labelsEn[i]);
      if (swatch) target.variantSwatch = swatch;
      else delete target.variantSwatch;
    });
  }
  writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log();
  console.log(`WROTE ${CATALOG}`);
}

// --- validation ------------------------------------------------------------
// Run always, because every one of these is a defect you would otherwise find
// on the live site rather than here.
let problems = 0;
const warn = (msg) => { problems++; console.log(`  ! ${msg}`); };
console.log();
console.log('--- validation ---');
for (const f of families) {
  const labels = f.labelsEn.map((l) => (l || '').toLowerCase());
  const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dupes.length) warn(`${f.key}: duplicate labels ${[...new Set(dupes)].join(', ')}`);
  if (labels.some((l) => l === '')) warn(`${f.key}: a member has an empty label`);
  if (!f.stemEn) warn(`${f.key}: empty English stem`);
  if (!f.stemAr) warn(`${f.key}: empty Arabic stem`);
  if (f.labelsAr.some((l) => !l)) warn(`${f.key}: a member has an empty Arabic label`);
  const cats = new Set(f.members.map((m) => m.category));
  if (cats.size > 1) warn(`${f.key}: spans ${cats.size} categories (${[...cats].join(', ')})`);
}
const keys = families.map((f) => f.key);
const dupeKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dupeKeys.length) warn(`duplicate family keys: ${[...new Set(dupeKeys)].join(', ')}`);
const seen = new Set();
for (const f of families) for (const m of f.members) {
  if (seen.has(m.code)) warn(`${m.code} is in more than one family`);
  seen.add(m.code);
}
console.log(problems === 0 ? '  all checks passed' : `  ${problems} problem(s)`);
