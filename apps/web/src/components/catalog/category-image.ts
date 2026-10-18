/**
 * Which top-level categories have a tile photograph, and where it lives.
 *
 * WHY A STATIC LIST AND NOT A DATABASE COLUMN
 * Choosing which product best represents "Carry bags" is an editorial decision
 * about presentation, not a fact about the category, and it changes when the
 * photography changes rather than when the catalogue does. Putting it in the
 * API would mean a column, a migration and a sync rule for something the web
 * app can answer on its own — and `categoryIcon()` already establishes the
 * pattern of a slug-keyed presentation registry living here.
 *
 * WHERE THE FILES COME FROM — two sources, and the better one came later.
 *
 * EIGHT are the printed catalogue's own SECTION BANNERS: full lifestyle
 * photographs that open each chapter of the brochure. They are what this grid
 * always wanted, and they are why `hmr-containers` finally has a tile at all —
 * no product shot of an HMR container exists anywhere in the image export, but
 * the brochure opens that chapter with one. Their English titles sit on a white
 * swoosh across the bottom and are cropped away rather than shown on an Arabic
 * page. `lunch-boxes` and `food-trays` share ONE banner and take different
 * crops of it — the white box of chicken and wedges, and the kraft trays
 * holding the hot dog and burger — because the same picture on two adjacent
 * tiles reads as a bug.
 *
 * TEN are product shots from the catalogue cards, with the card's title band
 * and spec table trimmed off and the result squared on the card's own tint.
 * Five of those were picked by eye rather than by the scoring pass, because
 * their title band was too pale for a full-width ink test to see.
 *
 * The two sets do not match in style — lifestyle photography beside product-
 * on-tint — and that is the honest state of the available imagery rather than
 * a decision. If more banners turn up, prefer them.
 *
 * `docs/category-images.json` records the source of every tile.
 *
 * Every tile is square (640x640) so the grid has ONE aspect ratio and no image
 * can contribute layout shift.
 */
import { canonicalCategorySlug } from '@/components/icons/categories';

const CATEGORY_TILES = new Set([
  'bottles-jars',
  'carry-bags',
  'clear-cup-lids',
  'clear-cups',
  'coffee-accessories',
  'coffee-cup-lids',
  'coffee-cups',
  'cutlery',
  'equipment',
  'food-trays',
  'hmr-containers',
  'kraft-bowls',
  'lunch-boxes',
  'shakers',
  'soup-cup-lids',
  'soup-cups',
  'sushi-trays',
  'wrapping-paper',
]);

/** Natural size of every tile, in px. Square by construction. */
export const CATEGORY_TILE_SIZE = 640;

/**
 * The tile for a category, or null when none exists.
 *
 * Accepts EITHER locale's slug. `CatalogCategoryDto.slug` carries the Arabic
 * one on an Arabic request, and Arabic is the default locale — so keying this
 * map on English alone and passing `category.slug` would have produced a grid
 * with no photographs at all on the page most visitors see, while looking
 * perfect in English. `canonicalCategorySlug` reuses the icon registry's
 * existing Arabic alias map rather than this file keeping a second copy.
 */
export function categoryImage(slug: string): string | null {
  const canonical = canonicalCategorySlug(slug);
  return CATEGORY_TILES.has(canonical) ? `/categories/${canonical}.webp` : null;
}
