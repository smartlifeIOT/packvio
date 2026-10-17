import type { CatalogCategoryDto } from '@packvio/shared';

/** A category with its children resolved. */
export type CategoryNode = CatalogCategoryDto & { children: CatalogCategoryDto[] };

/**
 * Nests a flat category list by `parentId`.
 *
 * The layout fetches the flat list ONCE and hands it to the mega-menu, the
 * mobile drawer and the footer. Nesting here rather than asking the API for
 * `?tree=true` avoids a second request for the same rows, and keeps the flat
 * list available to the consumers that want it flat (the footer's top-8, the
 * listing sidebar's checkboxes).
 *
 * A child whose parent is missing from the list — deactivated, or filtered out
 * upstream — is promoted to the top level rather than dropped. Silently hiding
 * a category that still has products is worse than showing it one level too
 * high, because the products underneath become unreachable from the navigation.
 */
export function buildCategoryTree(categories: CatalogCategoryDto[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );

  const roots: CategoryNode[] = [];

  for (const category of categories) {
    const node = nodes.get(category.id);
    if (!node) continue;

    const parent = category.parentId === null ? undefined : nodes.get(category.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

/** Top-level categories only, in sort order. */
export function topLevelCategories(categories: CatalogCategoryDto[]): CatalogCategoryDto[] {
  return categories.filter((category) => category.parentId === null);
}
