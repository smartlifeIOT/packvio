import { getPathname } from '@/i18n/navigation';
import { getCategories } from '@/lib/api';
import { CONTACT, LOCATION, SOCIAL_LINKS } from '@/components/layout/nav-links';
import { absoluteUrl } from '@/lib/seo';

/**
 * /llms.txt — a plain-language brief for AI assistants (the llmstxt.org
 * convention). ChatGPT, Perplexity, Gemini and Claude increasingly fetch it
 * when asked about a business; a short, factual page in both languages is what
 * gets quoted correctly instead of guessed.
 */
export const revalidate = 3600;

function url(path: string): string {
  try {
    return absoluteUrl(encodeURI(decodeURI(path)));
  } catch {
    return absoluteUrl(path);
  }
}

export async function GET(): Promise<Response> {
  let categoryLines = '';
  try {
    const [ar, en] = await Promise.all([getCategories('ar'), getCategories('en')]);
    const enById = new Map(en.map((category) => [category.id, category]));
    categoryLines = ar
      .filter((category) => category.parentId === null)
      .map((category) => {
        const english = enById.get(category.id);
        const href = getPathname({
          locale: 'en',
          href: { pathname: '/categories/[slug]', params: { slug: category.alternateSlug } },
        });
        return `- [${english?.name ?? category.name} / ${category.name}](${url(href)})`;
      })
      .join('\n');
  } catch {
    categoryLines = `- [Full catalogue](${url('/en/products')})`;
  }

  const body = `# Packvio (باك فيو)

> Packvio is a wholesale supplier of food and beverage packaging in Riyadh, Saudi Arabia — paper and plastic cups, soup cups and lids, kraft bowls and boxes, lunch boxes, food trays, bags, cutlery and straws — sold by the carton to restaurants, cafés, bakeries and caterers, with custom logo printing. Packvio is a trading name of Smavio Limited Trading Co.

باك فيو مورد لتغليف المواد الغذائية والمشروبات بالجملة في الرياض، المملكة العربية السعودية: أكواب ورقية وبلاستيكية، علب وزبديات الشوربة وأغطيتها، زبديات وعلب كرافت، علب وجبات، صواني طعام، أكياس، أدوات مائدة ومصاصات — تُباع بالكرتون للمطاعم والمقاهي والمخابز وشركات التموين، مع طباعة الشعار حسب الطلب.

## Key facts
- Location: ${LOCATION.city.en}, Saudi Arabia (map: ${LOCATION.mapsUrl})
- Serves: businesses across Saudi Arabia (B2B wholesale, sold by the carton)
- How to buy: request a quote on the website, or order on WhatsApp
- Phone / WhatsApp: ${CONTACT.phoneDisplay}
- Email: ${CONTACT.email}
- Languages: Arabic and English
- Custom printing: logo printing available on selected products

## Product categories
${categoryLines}

## Pages
- [Home (English)](${url('/en')}) · [الرئيسية (العربية)](${url('/ar')})
- [All products](${url(getPathname({ locale: 'en', href: '/products' }))})
- [Custom printing](${url(getPathname({ locale: 'en', href: '/custom-printing' }))})
- [Request a quote](${url(getPathname({ locale: 'en', href: '/quote' }))})
- [About Packvio](${url(getPathname({ locale: 'en', href: '/about' }))})
- [Contact](${url(getPathname({ locale: 'en', href: '/contact' }))})
- [FAQ](${url(getPathname({ locale: 'en', href: '/faq' }))})

## Social
${SOCIAL_LINKS.map((link) => `- ${link.label}: ${link.href}`).join('\n')}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
