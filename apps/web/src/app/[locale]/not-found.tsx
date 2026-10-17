import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { Button, Icon, Section } from '@/components/ui';

/**
 * 404 inside a locale segment.
 *
 * Unlike error.tsx this one CAN be translated: reaching a not-found page means
 * routing worked and the locale is known — the URL simply pointed at something
 * that does not exist. So it speaks the reader's language and offers the two
 * places they most likely wanted.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <Section spacing="lg">
      <div className="mx-auto flex max-w-[36rem] flex-col items-center gap-lg py-2xl text-center">
        <p className="font-mono text-display-2 font-semibold text-brand-cyan">404</p>

        <div>
          <h1 className="text-h1 font-semibold text-brand-purple">{t('heading')}</h1>
          <p className="mt-3 text-body text-ink-muted">{t('body')}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button as="a" href="/products" iconEnd={<Icon icon={ArrowRight} size={18} />}>
            {t('browseProducts')}
          </Button>
          <Button as="a" href="/" variant="secondary">
            {t('home')}
          </Button>
        </div>
      </div>
    </Section>
  );
}
