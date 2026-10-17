import type { CatalogProductSummaryDto } from '@packvio/shared';

/**
 * Choosing and arranging the products the hero drift shows.
 *
 * PURE — no fetching, no DOM, no React. The hero passes in what the home page
 * already fetched (`featured` + `newest`), so the drift costs zero extra network
 * requests on the page whose LCP we are protecting.
 */

/** Upper bound on tiles. Beyond this the columns repeat before they loop. */
export const MAX_DRIFT_PRODUCTS = 18;

/** Below this there is not enough material to fill three looping columns. */
export const MIN_DRIFT_PRODUCTS = 6;

/**
 * Dedupes, caps, and orders so that no two neighbours share a category.
 *
 * The ordering is the point. With no product photography, a tile's only visual
 * identity is its category icon — so two adjacent tiles from the same category
 * read as a duplicate rather than as two products, and a column of six spoons
 * looks like a rendering bug.
 *
 * It takes the category with the MOST PRODUCTS LEFT that is not the one just
 * placed, rather than simply the next product that differs. The difference only
 * shows up at the end of the list, which is exactly where it matters. Given
 * four cups, four lids and four straws, "next one that differs" alternates cups
 * and lids until both run out and then emits four straws in a row — it spends
 * its variety early and has nothing left to interleave with. Taking the largest
 * remaining group first keeps every category in play to the end and yields
 * cups, lids, straws, cups, lids, straws…
 *
 * Ties go to whichever category appears earliest in the pool, so the API's own
 * ordering — featured before newest, sortOrder within each — breaks them.
 *
 * When only one category remains it stops trying and takes what is left, rather
 * than dropping products to preserve the rule: a shorter loop is a worse
 * outcome than two similar neighbours.
 */
export function selectDriftProducts(
  ...sources: ReadonlyArray<readonly CatalogProductSummaryDto[]>
): CatalogProductSummaryDto[] {
  const seen = new Set<string>();
  const pool: CatalogProductSummaryDto[] = [];

  for (const source of sources) {
    for (const product of source) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      pool.push(product);
    }
  }

  const remainingByCategory = new Map<string, number>();
  for (const product of pool) {
    const key = categoryKey(product);
    remainingByCategory.set(key, (remainingByCategory.get(key) ?? 0) + 1);
  }

  const ordered: CatalogProductSummaryDto[] = [];
  const remaining = [...pool];
  let previousCategory: string | null = null;

  while (remaining.length > 0 && ordered.length < MAX_DRIFT_PRODUCTS) {
    let bestIndex = -1;
    let bestRemaining = -1;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (!candidate) continue;

      const key = categoryKey(candidate);
      if (key === previousCategory) continue;

      const count = remainingByCategory.get(key) ?? 0;
      // Strictly greater, so the earliest index wins a tie.
      if (count > bestRemaining) {
        bestRemaining = count;
        bestIndex = index;
      }
    }

    // -1 means everything left shares the last-placed category; take the head.
    const [product] = remaining.splice(bestIndex === -1 ? 0 : bestIndex, 1);
    if (!product) break;

    const key = categoryKey(product);
    remainingByCategory.set(key, (remainingByCategory.get(key) ?? 1) - 1);
    ordered.push(product);
    previousCategory = key;
  }

  return ordered;
}

/**
 * Deals the ordered list round-robin into `count` columns, and will reach past
 * the next product to avoid stacking two of a category in the same column.
 *
 * Round-robin rather than slicing into contiguous blocks: the input is already
 * category-interleaved, so dealing preserves that variety DOWN each column,
 * whereas slicing would hand one column products 1–6 and undo the interleave in
 * the only axis the reader actually scans.
 *
 * THE ADJACENCY THAT MATTERS IS VERTICAL, and a plain deal does not protect it.
 * A tile's neighbours on screen are the tile above and the tile below it in its
 * own column — the columns move independently and at different speeds, so
 * nothing is reliably beside anything. In the flat list those neighbours are
 * `count` apart, not one apart, so an order with no two adjacent repeats can
 * still deal three same-category tiles into one column. The pathological case
 * is a perfect interleave over exactly three categories: A B C A B C dealt into
 * three columns gives one column of A, one of B and one of C, which is the
 * worst possible outcome produced from the best possible input.
 *
 * So each column takes the first remaining product that differs from the tile
 * already at its foot, rather than whatever is next in line. When nothing
 * differs it takes the head anyway, for the same reason the ordering pass does:
 * dropping a product to keep the rule would shorten the loop.
 *
 * Columns come back within one tile of each other in length, which matters for
 * the loop: wildly uneven columns would finish their cycles at obviously
 * different moments and read as three separate animations.
 *
 * Not handled: the seam, where a column's last tile meets its first again on
 * the next cycle. Repairing it would mean re-picking a tile already placed, and
 * the payoff is one same-category pair, drifting past inside the mask's fade,
 * once every 44 to 68 seconds.
 */
export function dealIntoColumns(
  products: readonly CatalogProductSummaryDto[],
  count: number,
): CatalogProductSummaryDto[][] {
  const columns: CatalogProductSummaryDto[][] = Array.from({ length: count }, () => []);
  const remaining = [...products];

  for (let placed = 0; remaining.length > 0; placed += 1) {
    const column = columns[placed % count];
    if (!column) break;

    const above = column[column.length - 1];
    const aboveCategory = above ? categoryKey(above) : null;
    const index = remaining.findIndex((product) => categoryKey(product) !== aboveCategory);

    const [product] = remaining.splice(index === -1 ? 0 : index, 1);
    if (!product) break;
    column.push(product);
  }

  return columns.filter((column) => column.length > 0);
}

/** Whether there is enough material to render the drift at all. */
export function hasEnoughForDrift(products: readonly CatalogProductSummaryDto[]): boolean {
  return products.length >= MIN_DRIFT_PRODUCTS;
}

function categoryKey(product: CatalogProductSummaryDto): string {
  return product.primaryCategory?.slug ?? '(uncategorised)';
}
