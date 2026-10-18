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
 * WHERE THE FILES COME FROM
 * `public/categories/<slug>.webp`, generated from the printed-catalogue
 * photography: the cleanest product shot in that category, with the card's
 * title band and spec table trimmed off and the result squared on the card's
 * own tint. `docs/category-images.json` records which source image each tile
 * came from. Five of the seventeen were picked by eye rather than by the
 * scoring pass, because their title band was too pale for a full-width ink
 * test to see — those are marked in the generator.
 *
 * `hmr-containers` is ABSENT, and that is the honest state: there is no
 * photograph of an HMR container anywhere in the supplied export. It falls
 * back to its category icon, which is what every category looked like before.
 * Add the file and the slug here once a real photograph exists; nothing else
 * needs to change.
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
