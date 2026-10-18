import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The variant-grouping UI needs five message keys, and this suite fails until
 * both locales have all five.
 *
 * It exists because of HOW those keys arrive. They were authored into
 * docs/variant-i18n-keys.json rather than straight into messages/{en,ar}.json,
 * since those two files were being edited concurrently, and a merge that
 * someone has to remember is a merge that eventually does not happen.
 *
 * The failure mode without this check is quiet rather than loud: next-intl
 * does not throw on a missing message, it renders the key path. So a forgotten
 * merge ships a product grid with "product.variants.count" printed under every
 * card — visible to a buyer, invisible to CI, and exactly the kind of thing a
 * typecheck cannot see because message keys are strings.
 *
 * Delete this file once the keys are merged, or keep it — it costs
 * milliseconds and it also catches the two locales drifting apart later.
 */

const REQUIRED = ['chooseColour', 'chooseSize', 'chooseOption', 'count', 'more'] as const;

type Messages = { product?: { variants?: Record<string, unknown> } };

function load(locale: 'en' | 'ar'): Messages {
  return JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'messages', `${locale}.json`), 'utf8'),
  ) as Messages;
}

describe('variant message keys', () => {
  it.each(['en', 'ar'] as const)('%s has every product.variants key the UI renders', (locale) => {
    const variants = load(locale).product?.variants;

    expect(variants).toBeDefined();
    for (const key of REQUIRED) {
      expect(Object.keys(variants ?? {})).toContain(key);
      expect(typeof variants?.[key]).toBe('string');
      expect((variants?.[key] as string).trim()).not.toBe('');
    }
  });

  it('keeps the two locales in step', () => {
    // A key present in one locale and missing in the other is the same bug as
    // missing it everywhere, just harder to notice — the site only breaks for
    // half its readers.
    expect(Object.keys(load('ar').product?.variants ?? {}).sort()).toEqual(
      Object.keys(load('en').product?.variants ?? {}).sort(),
    );
  });
});
