import Image from 'next/image';
import type { CatalogImageDto } from '@packvio/shared';
import { ProductPanel, type ProductPanelRatio } from '@/components/ui';
import { ImagePlaceholder } from './image-placeholder';

export type ProductMediaProps = {
  image: CatalogImageDto | null;
  /** Falls back to the SKU placeholder when `image` is null. */
  code: string;
  /**
   * Primary category of the product, and its parent. Only used by the
   * placeholder branch, which draws that category's icon — with no photograph
   * it is the only thing distinguishing one tile from the next.
   */
  categorySlug?: string | null;
  parentCategorySlug?: string | null;
  ratio?: ProductPanelRatio;
  /**
   * The `sizes` attribute. Required whenever this renders in a grid, because
   * `fill` images with no `sizes` make the browser download the largest
   * candidate for every slot.
   */
  sizes?: string;
  /** Set on the first above-the-fold image only. */
  priority?: boolean;
  className?: string;
};

/**
 * A product's visual slot: the real photograph when one exists, the SKU panel
 * when it does not.
 *
 * Both branches render at the SAME aspect ratio inside the same panel, so the
 * grid does not reflow on the day photography lands — and, more immediately, so
 * a page of placeholders and a page with two real photos do not look like two
 * different sites.
 */
export function ProductMedia({
  image,
  code,
  categorySlug,
  parentCategorySlug,
  ratio = 'square',
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw',
  priority = false,
  className,
}: ProductMediaProps) {
  if (!image?.url) {
    return (
      <ImagePlaceholder
        code={code}
        categorySlug={categorySlug}
        parentCategorySlug={parentCategorySlug}
        ratio={ratio}
        className={className}
      />
    );
  }

  return (
    <ProductPanel ratio={ratio} className={className}>
      {/* `fill` + a sized parent, so the intrinsic dimensions are reserved before
          the bytes arrive and the card never shifts as images load. */}
      <div className="relative h-full w-full">
        <Image
          src={image.url}
          alt={image.alt ?? code}
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain"
        />
      </div>
    </ProductPanel>
  );
}
