import { getTranslations } from 'next-intl/server';
import { PackageCheck, Palette, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Icon, Section } from '@/components/ui';

const PILLARS: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: 'foodSafe', icon: PackageCheck },
  { key: 'printing', icon: Palette },
  { key: 'wholesale', icon: Truck },
];

/**
 * The three-pillar value band, on purple.
 *
 * These are the three questions a Saudi food-business buyer actually asks before
 * anything else: is it compliant, can you put my logo on it, and how fast can I
 * get a case. Answering them above the product rails is what turns a catalog
 * into a supplier pitch.
 */
export async function ValueBand({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'home.values' });

  return (
    // `wide` to match the hero: these two purple bands are the page's
    // full-bleed moments and must share a measure, or the band reads as inset
    // from the hero directly above it.
    <Section tone="purple" spacing="lg" width="wide" aria-labelledby="home-values">
      <h2 id="home-values" className="sr-only">
        {t('heading')}
      </h2>

      <ul className="grid gap-xl g3:grid-cols-3">
        {PILLARS.map((pillar) => (
          <li key={pillar.key} className="flex flex-col gap-3">
            <span className="inline-flex size-14 items-center justify-center rounded-md bg-brand-cyan/20">
              <Icon icon={pillar.icon} size={28} className="text-brand-cyan" />
            </span>

            <h3 className="text-h3 font-semibold">{t(`${pillar.key}.title`)}</h3>
            <p className="text-body leading-relaxed text-surface/80">
              {t(`${pillar.key}.body`)}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
