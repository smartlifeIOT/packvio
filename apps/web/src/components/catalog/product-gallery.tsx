'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CatalogImageDto, Locale } from '@packvio/shared';
import { cx } from '@/lib/cx';
import { ProductMedia } from './product-media';

export type ProductGalleryProps = {
  images: CatalogImageDto[];
  code: string;
  name: string;
  /** Primary category slug — the placeholder branch draws its icon. */
  categorySlug?: string | null;
  locale: Locale;
  className?: string;
};

/**
 * The product's media column: one large panel, plus a thumbnail strip when
 * there is more than one image.
 *
 * With zero images — which is every product today — it renders exactly the same
 * `ProductMedia` the cards use, which falls through to the SKU placeholder. So
 * the page has no separate "no images" branch to maintain, and the day
 * photography lands the gallery starts working without a code change.
 *
 * A client component ONLY because selecting a thumbnail is state. When there is
 * one image or none there is nothing to select, and it renders a single panel
 * with no interactivity attached.
 */
export function ProductGallery({
  images,
  code,
  name,
  categorySlug,
  locale,
  className,
}: ProductGalleryProps) {
  const t = useTranslations('product');
  const [activeIndex, setActiveIndex] = useState(0);

  const active = images[activeIndex] ?? images[0] ?? null;

  return (
    <div className={className}>
      <ProductMedia
        image={active}
        code={code}
        categorySlug={categorySlug}
        ratio="square"
        sizes="(min-width: 1024px) 50vw, 100vw"
        priority
      />

      {images.length > 1 && (
        <ul
          aria-label={t('gallery', { name })}
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          lang={locale}
        >
          {images.map((image, index) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={t('viewImage', { number: index + 1 })}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={cx(
                  'block w-20 overflow-hidden rounded-sm border-2 transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple',
                  index === activeIndex
                    ? 'border-brand-purple'
                    : 'border-transparent hover:border-border',
                )}
              >
                <ProductMedia
                  image={image}
                  code={code}
                  categorySlug={categorySlug}
                  ratio="square"
                  sizes="80px"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
