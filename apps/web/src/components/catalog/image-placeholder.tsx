import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { ProductPanel, type ProductPanelRatio } from '@/components/ui';
import { categoryIcon } from '@/components/icons/categories';

export type ImagePlaceholderProps = {
  /** Product SKU, e.g. "PCS/08". Rendered as the panel's subject. */
  code: string;
  /**
   * Slug of the product's primary category, and of that category's parent.
   *
   * Drives which icon is drawn. `CatalogProductSummaryDto.primaryCategory`
   * exists precisely for this — see its docblock in packages/shared.
   */
  categorySlug?: string | null;
  parentCategorySlug?: string | null;
  ratio?: ProductPanelRatio;
  className?: string;
};

/**
 * What a product shows when it has no photograph.
 *
 * 53 of 213 products are in this state: the printed catalogue cards cover most
 * of the range, but the forks and knives, most of the spoons, the straws, the
 * HMR containers and a handful of others were never shot. So this is not an
 * error state bolted on late — it is the permanent presentation of a quarter of
 * the catalogue until a supplier sends more photography, and it has to look
 * like a decision.
 *
 * The category icon is what does the work. Before it, every placeholder in a
 * grid was identical apart from six characters of mono type, so a page of
 * cutlery and a page of lids were indistinguishable at a glance and the eye had
 * nothing to navigate by. With it, a fork tile reads as cutlery, a straw tile
 * as a straw, and the grid regains the shape-level scanning that product
 * photography normally provides. `categoryIcon` already falls back to the
 * PARENT's icon before the generic one, so an undrawn subcategory shows its
 * family rather than a box.
 *
 * The code is bidi-isolated because it is Latin text that will sit inside an
 * Arabic page; without isolation "PCS/08" reorders to "08/PCS".
 */
export function ImagePlaceholder({
  code,
  categorySlug,
  parentCategorySlug,
  ratio = 'square',
  className,
}: ImagePlaceholderProps) {
  const t = useTranslations('product');
  const CategoryIcon = categoryIcon(categorySlug ?? '', { parentSlug: parentCategorySlug });

  return (
    <ProductPanel ratio={ratio} watermarkOpacity={0.05} className={className}>
      <div className="flex flex-col items-center justify-center gap-3 px-4 text-center">
        {/* Decorative: the code below names the product, and the category is
            already in the breadcrumb and the card's own copy. Announcing the
            icon too would just be a third reading of the same fact. */}
        <CategoryIcon
          size={64}
          className="text-brand-purple/35"
          aria-hidden="true"
          focusable="false"
        />
        <span
          className={cx(
            'bidi-latin font-mono text-body font-normal tracking-wide text-brand-purple/80',
          )}
        >
          {code}
        </span>
        <span className="text-caption text-ink-muted/70">{t('imageComingSoon')}</span>
      </div>
    </ProductPanel>
  );
}
