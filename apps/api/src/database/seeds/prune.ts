import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { Product } from '../../modules/catalog/entities/product.entity';
import dataSource from '../data-source';
import { CATALOG_JSON_PATH, loadCatalogSource } from './catalog-source';
import { planProductSlugs, slugSuffixFromCode, type SluggableProduct } from './slugify';

/**
 * Reconciles the catalog TABLE against docs/catalog.json, in the one direction
 * the seed deliberately refuses to go: removal.
 *
 * WHY THIS IS NEEDED
 * The seed matches products on `code` and never deletes. That is the right
 * default — a catalog extraction that drops a product by accident must not wipe
 * it from the live site. But it has a consequence that only shows up when a
 * product's CODE changes between two generations of catalog.json (a renumbering,
 * a re-extraction, variant grouping): the old row is now an orphan nothing
 * refers to, and it is still holding the clean slug. The seed then creates the
 * new product, finds `carry-bag-19-cm` taken, and files it under
 * `carry-bag-19-cm-cb19` — reporting it honestly as
 *
 *     slug already held by another product in the database — code suffix appended
 *
 * The result is two of every affected product on the site, with the STALE one on
 * the clean URL and sorting first. It looks exactly like a deploy that did not
 * take effect, which is the expensive part: the symptom points at the wrong
 * system entirely.
 *
 * WHAT IT DOES
 *   1. Finds products whose `code` is absent from docs/catalog.json.
 *   2. Soft-deletes them AND renames their slugs out of the way. The rename is
 *      not optional: uq_products_slug_en is a plain unique index, not a partial
 *      one, so a soft-deleted row goes on holding its slug forever — which is
 *      why the seed reads `withDeleted: true` when it works out what is taken.
 *   3. Reclaims the clean slug for any surviving product whose current slug is
 *      exactly its PLANNED slug plus its own code suffix, once step 2 has
 *      freed it.
 *
 * Step 3 is narrow on purpose. Slugs are otherwise frozen for life, because
 * they are public URLs and a reworded name must not 404 an old link. The only
 * slugs it will touch are ones the seed itself demonstrably created as a
 * collision fallback — `<planned>-<own code suffix>` — and only when `<planned>`
 * has just become free. A slug that merely looks similar, or whose base is
 * still held by a live product, is left alone.
 *
 * DRY RUN BY DEFAULT. It prints the full plan and writes nothing unless given
 * `--apply` (or PRUNE_APPLY=1). Same convention as the Salla reconcile: a
 * destructive data operation should have to be asked for twice.
 *
 *   node dist/database/seeds/prune.js            # report only
 *   node dist/database/seeds/prune.js --apply    # do it
 *   node dist/database/seeds/prune.js --apply --force   # past the blast-radius guard
 *
 * THE BLAST-RADIUS GUARD IS NOT OPTIONAL CEREMONY. This tool's input is
 * whatever docs/catalog.json happens to be inside the running API image. Point
 * it at a stale, truncated or half-extracted catalogue and every product
 * missing from that file is an orphan — so `--apply` would archive the lot and
 * report it as a tidy-up. That is not a hypothetical: it is what happened the
 * first time the test suite ran this against a seeded database with a
 * single-product source, and all 213 products were archived in one transaction.
 * So an unexpectedly large prune stops and asks.
 */

const APPLY = process.argv.includes('--apply') || process.env.PRUNE_APPLY === '1';
const FORCE = process.argv.includes('--force') || process.env.PRUNE_FORCE === '1';

/** varchar(200) on both slug columns. The archive prefix has to fit inside it. */
const SLUG_MAX = 200;

/**
 * How much of the catalogue a single prune may remove before it refuses.
 *
 * A code renumbering touches a handful of products. Anything approaching a
 * quarter of the catalogue is not a renumbering, it is the wrong input file.
 * The absolute floor keeps the proportion from being meaningless on a small or
 * freshly-created catalogue, where 25% of twelve products is three.
 */
const MAX_PRUNE_FRACTION = 0.25;
const MAX_PRUNE_FLOOR = 10;

export function pruneExceedsBlastRadius(orphans: number, live: number): boolean {
  if (orphans <= MAX_PRUNE_FLOOR) return false;
  return orphans > Math.floor(live * MAX_PRUNE_FRACTION);
}

type Orphan = {
  id: string;
  code: string;
  nameEn: string;
  slugEn: string;
  slugAr: string;
  archivedEn: string;
  archivedAr: string;
};

type Reclaim = {
  id: string;
  code: string;
  nameEn: string;
  fromEn: string;
  toEn: string;
  fromAr: string;
  toAr: string;
};

/**
 * Where an orphan's slug goes so the clean one is released.
 *
 * Prefixed rather than suffixed so every archived row sorts together in the
 * table, and keyed on the product code, which is unique — so two archived rows
 * can never collide with each other. Truncated from the TAIL of the original
 * slug if the result would overflow varchar(200); the prefix and the code are
 * what make it identifiable, the rest is readability.
 */
function archivedSlug(slug: string, code: string): string {
  const prefix = `archived-${slugSuffixFromCode(code)}-`;
  return `${prefix}${slug}`.slice(0, SLUG_MAX);
}

/**
 * Works out what to do. Takes the source products as an argument rather than
 * reading the file itself, so the suite can hand it a deliberate mess —
 * reproducing an orphan squatting a slug is the whole point of testing this,
 * and that cannot be set up by editing the real catalogue.
 */
async function plan(
  manager: EntityManager,
  sourceProducts: readonly SluggableProduct[],
): Promise<{ orphans: Orphan[]; reclaims: Reclaim[] }> {
  const repository = manager.getRepository(Product);

  const sourceCodes = new Set(sourceProducts.map((product) => product.code));
  const { plan: slugPlan } = planProductSlugs(sourceProducts);

  // Live rows only. A row already soft-deleted in an earlier run is left
  // exactly as it is: re-archiving it would churn its slug for no reason, and
  // if it is still squatting a slug this run needs, step 3 simply will not find
  // that slug free and will leave the suffixed one alone. Correct, and quiet.
  const live = await repository.find({
    where: { deletedAt: IsNull() },
    select: ['id', 'code', 'nameEn', 'slugEn', 'slugAr'],
  });

  const orphans: Orphan[] = live
    .filter((product) => !sourceCodes.has(product.code))
    .map((product) => ({
      id: product.id,
      code: product.code,
      nameEn: product.nameEn,
      slugEn: product.slugEn,
      slugAr: product.slugAr,
      archivedEn: archivedSlug(product.slugEn, product.code),
      archivedAr: archivedSlug(product.slugAr, product.code),
    }));

  // Every slug that will be free once the orphans above have been renamed.
  const freed = new Set<string>();
  for (const orphan of orphans) {
    freed.add(orphan.slugEn);
    freed.add(orphan.slugAr);
  }

  // Everything still held afterwards, INCLUDING soft-deleted rows, because the
  // unique index does not care that a row is soft-deleted.
  const held = new Set<string>();
  for (const product of await repository.find({
    withDeleted: true,
    select: ['slugEn', 'slugAr'],
  })) {
    held.add(product.slugEn);
    held.add(product.slugAr);
  }
  for (const slug of freed) held.delete(slug);

  const reclaims: Reclaim[] = [];
  for (const product of live) {
    const planned = slugPlan.get(product.code);
    if (!planned) continue;

    const suffix = slugSuffixFromCode(product.code);

    // The ONLY shape this will move: the planned slug with this product's own
    // code suffix appended. That is precisely what the seed writes when it
    // loses a collision, and nothing else produces it.
    const enIsFallback = product.slugEn === `${planned.en}-${suffix}`;
    const arIsFallback = product.slugAr === `${planned.ar}-${suffix}`;

    const toEn = enIsFallback && !held.has(planned.en) ? planned.en : product.slugEn;
    const toAr = arIsFallback && !held.has(planned.ar) ? planned.ar : product.slugAr;

    if (toEn === product.slugEn && toAr === product.slugAr) continue;

    // Claim them, so two products planned onto the same base slug cannot both
    // be told they may have it.
    if (toEn !== product.slugEn) held.add(toEn);
    if (toAr !== product.slugAr) held.add(toAr);

    reclaims.push({
      id: product.id,
      code: product.code,
      nameEn: product.nameEn,
      fromEn: product.slugEn,
      toEn,
      fromAr: product.slugAr,
      toAr,
    });
  }

  return { orphans, reclaims };
}

async function apply(
  manager: EntityManager,
  orphans: Orphan[],
  reclaims: Reclaim[],
): Promise<void> {
  const repository = manager.getRepository(Product);

  // Order matters: the orphans have to let go of their slugs before anything
  // can take one. Both steps are inside one transaction, so a failure halfway
  // cannot leave the table with a product archived and its slug unclaimed.
  for (const orphan of orphans) {
    await repository.update(orphan.id, {
      slugEn: orphan.archivedEn,
      slugAr: orphan.archivedAr,
      deletedAt: new Date(),
    });
  }

  for (const reclaim of reclaims) {
    await repository.update(reclaim.id, { slugEn: reclaim.toEn, slugAr: reclaim.toAr });
  }
}

function report(orphans: Orphan[], reclaims: Reclaim[], live: number, blocked: boolean): void {
  console.log(`Reconciling against ${CATALOG_JSON_PATH}`);
  console.log(`${live} live product(s) in the database.`);
  console.log('');

  if (orphans.length === 0) {
    console.log('No orphans: every live product has a code in catalog.json.');
  } else {
    console.log(
      `${orphans.length} product(s) in the database are NOT in catalog.json — ` +
        'to be soft-deleted, slug released:',
    );
    for (const orphan of orphans) {
      console.log(`  - ${orphan.code}  ${orphan.nameEn}`);
      console.log(`      ${orphan.slugEn}  ->  ${orphan.archivedEn}`);
    }
  }

  console.log('');

  if (reclaims.length === 0) {
    console.log('No slugs to reclaim.');
  } else {
    console.log(`${reclaims.length} product(s) can move back onto their intended slug:`);
    for (const reclaim of reclaims) {
      console.log(`  - ${reclaim.code}  ${reclaim.nameEn}`);
      if (reclaim.fromEn !== reclaim.toEn) {
        console.log(`      en  ${reclaim.fromEn}  ->  ${reclaim.toEn}`);
      }
      if (reclaim.fromAr !== reclaim.toAr) {
        console.log(`      ar  ${reclaim.fromAr}  ->  ${reclaim.toAr}`);
      }
    }
  }

  console.log('');

  if (orphans.length === 0 && reclaims.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (blocked) {
    console.log(
      `REFUSED: ${orphans.length} of ${live} live products would be removed, which is more ` +
        `than ${Math.round(MAX_PRUNE_FRACTION * 100)}% of the catalogue.`,
    );
    console.log('');
    console.log('That is almost always the wrong input file rather than a real cleanup —');
    console.log('a stale or half-extracted docs/catalog.json inside the API image. Check');
    console.log('that the deployed commit is the one you think it is before going further.');
    console.log('');
    console.log('If you have read the list above and it is genuinely what you want:');
    console.log('  npm run deploy:prune -- --apply --force');
    return;
  }

  if (APPLY) {
    console.log('Applied.');
    console.log('');
    console.log('The site caches catalog pages for 5 minutes (revalidate: 300), so the');
    console.log('change is not visible instantly. Purge it now with:');
    console.log('  npm run deploy:purge');
  } else {
    console.log('DRY RUN — nothing was written. Re-run with --apply to do it.');
  }
}

async function run(): Promise<void> {
  const connection: DataSource = await dataSource.initialize();
  try {
    await connection.transaction(async (manager) => {
      const { orphans, reclaims } = await plan(manager, loadCatalogSource().products);

      const live = await manager.getRepository(Product).count();
      const blocked = !FORCE && pruneExceedsBlastRadius(orphans.length, live);

      if (APPLY && !blocked) await apply(manager, orphans, reclaims);
      report(orphans, reclaims, live, APPLY && blocked);

      // Nothing was written when blocked, but make the exit code say so too —
      // `npm run deploy:prune -- --apply` must not look like it succeeded.
      if (APPLY && blocked) process.exitCode = 1;
    });
  } finally {
    await connection.destroy();
  }
}

export type { Orphan, Reclaim };
export { archivedSlug, plan as planPrune, apply as applyPrune };

// Only when run as a script. The exports above are for the test suite, and
// importing this file must not open a database connection.
if (require.main === module) {
  run().catch((error: unknown) => {
    console.error('Prune failed:', error);
    process.exitCode = 1;
  });
}
