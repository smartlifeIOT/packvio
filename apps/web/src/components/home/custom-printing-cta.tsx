import { getTranslations } from 'next-intl/server';
import { ArrowRight, Check } from 'lucide-react';
import type { Locale } from '@packvio/shared';
import { Button, Icon, Section, Watermark } from '@/components/ui';

const BULLET_KEYS = ['one', 'two', 'three'] as const;

/**
 * Split section for custom logo printing — the highest-margin thing Packvio
 * sells and the reason most buyers pick a supplier over a cash-and-carry.
 *
 * The "visual" half is a composed brand panel rather than a photograph, for the
 * same reason as the hero: there is no real print sample photography yet, and a
 * stock mockup of someone else's cup would undercut the exact claim the section
 * is making.
 */
export async function CustomPrintingCta({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'home.customPrinting' });

  return (
    <Section tone="alt" spacing="lg" aria-labelledby="home-printing">
      <div className="grid items-center gap-xl lg:grid-cols-2">
        <div>
          <p className="text-body-sm font-medium tracking-wide text-brand-purple uppercase">
            {t('eyebrow')}
          </p>

          <h2 id="home-printing" className="mt-3 text-h1 font-semibold text-brand-purple">
            {t('heading')}
          </h2>

          <p className="mt-4 text-body text-ink-muted">{t('body')}</p>

          <ul className="mt-lg flex flex-col gap-3">
            {BULLET_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-brand-cyan">
                  <Icon icon={Check} size={14} className="text-ink" />
                </span>
                <span className="text-body-sm text-ink">{t(`bullets.${key}`)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-lg">
            <Button
              as="a"
              href="/custom-printing"
              variant="secondary"
              iconEnd={<Icon icon={ArrowRight} size={18} />}
            >
              {t('cta')}
            </Button>
          </div>
        </div>

        {/* Brand-material panel: the checkerboard device and the P mark, not a photo. */}
        <div className="relative isolate aspect-[4/3] overflow-hidden rounded-lg bg-brand-purple panel-inset">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(100%_100%_at_20%_0%,rgba(79,192,223,0.4)_0%,transparent_60%)]"
          />
          <Watermark opacity={0.1} size={360} position="center" />

          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 p-lg text-center">
            <span className="text-display-3 font-semibold text-surface">{t('panelTitle')}</span>
            <span className="font-mono text-spec text-brand-cyan">{t('panelSubtitle')}</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
