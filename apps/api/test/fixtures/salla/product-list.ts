import type { SallaListResponse } from '../../../src/modules/sync/client/dto/salla-api.dto';

/**
 * A paginated `GET /products` response over THREE pages — what the reconcile
 * job walks.
 *
 * Deliberately mixed: page 1 uses the rich object shapes, page 2 the lean bare
 * shapes, and page 3 is a SHORT final page (2 items where perPage is 3) so the
 * pagination loop's terminating condition is exercised for real rather than
 * only via `totalPages`.
 *
 * The SKUs on pages 1 and 2 exist in the seed; the one on page 3 does not, so a
 * reconcile over this catalog produces both updates and a create.
 */

// The client's types are intentionally loose about Salla's alternative shapes,
// so the fixtures are typed as the response envelope with a permissive item —
// pinning them to SallaProduct would reject the very variants they exist to
// cover. The mapper is what asserts the shapes are understood.
type LooseProduct = Record<string, unknown> & { id: number };

const PER_PAGE = 3;
const TOTAL = 8;
const TOTAL_PAGES = 3;

function page(currentPage: number, items: LooseProduct[]): SallaListResponse<LooseProduct> {
  return {
    status: 200,
    success: true,
    data: items,
    pagination: {
      count: items.length,
      total: TOTAL,
      perPage: PER_PAGE,
      currentPage,
      totalPages: TOTAL_PAGES,
    },
  };
}

/** Page 1 — rich shapes: money objects, image objects, category objects. */
export const PRODUCT_LIST_PAGE_1 = page(1, [
  {
    id: 445566778,
    sku: 'PCS/08',
    name: 'Single Wall Coffee Cup 8 oz',
    description: 'Single-wall paper cup for hot drinks.',
    price: { amount: 42.5, currency: 'SAR' },
    sale_price: { amount: 0, currency: 'SAR' },
    quantity: 120,
    unlimited_quantity: false,
    status: 'sale',
    urls: { customer: 'https://packvio.salla.sa/p445566778' },
    main_image: { id: 70001, url: 'https://cdn.salla.sa/packvio/pcs08-main.jpg', main: true },
    images: [
      { id: 70001, url: 'https://cdn.salla.sa/packvio/pcs08-main.jpg', sort: 0, main: true },
      { id: 70002, url: 'https://cdn.salla.sa/packvio/pcs08-stack.jpg', sort: 1, main: false },
    ],
    categories: [{ id: 301001, name: 'Coffee Paper Cups' }],
    updated_at: { date: '2026-08-19 08:00:00.000000', timezone_type: 3, timezone: 'Asia/Riyadh' },
  },
  {
    id: 445566780,
    sku: 'PCS/12',
    name: 'Single Wall Coffee Cup 12 oz',
    price: { amount: 48, currency: 'SAR' },
    quantity: 0,
    unlimited_quantity: false,
    status: 'out',
    urls: { customer: 'https://packvio.salla.sa/p445566780' },
    images: [],
    categories: [{ id: 301001, name: 'Coffee Paper Cups' }],
    updated_at: '2026-08-19T08:05:00+03:00',
  },
  {
    id: 445566781,
    sku: 'DCL/08B',
    name: 'Dome Lid 8 oz Black',
    price: { amount: 12, currency: 'SAR' },
    quantity: 500,
    status: 'hidden',
    urls: { customer: 'https://packvio.salla.sa/p445566781' },
    categories: [{ id: 301002, name: 'Coffee Cup Lids' }],
    updated_at: '2026-08-19T08:10:00+03:00',
  },
]);

/** Page 2 — lean shapes: bare numbers, string main_image, bare category ids. */
export const PRODUCT_LIST_PAGE_2 = page(2, [
  {
    id: 445566782,
    sku: 'WT-KS508',
    name: 'Cup Sleeve Smooth Ripple',
    price: 9.5,
    currency: 'SAR',
    quantity: 300,
    status: 'sale',
    main_image: 'https://cdn.salla.sa/packvio/ks508.jpg',
    images: [{ id: 70020, url: 'https://cdn.salla.sa/packvio/ks508.jpg', sort: 0, main: true }],
    categories: [301003],
    updated_at: '2026-08-19T08:15:00+03:00',
  },
  {
    id: 445566783,
    sku: 'PSC/16W',
    name: 'Soup Cup 16 oz White',
    price: 31,
    currency: 'SAR',
    unlimited_quantity: true,
    status: 'sale',
    categories: [301004],
    updated_at: '2026-08-19T08:20:00+03:00',
  },
  {
    id: 445566784,
    sku: 'SB/1000KR',
    name: 'Kraft Salad Bowl 1000 ml',
    // No price at all — must stay null, never 0.
    price: null,
    status: 'sale',
    categories: [301006],
    updated_at: '2026-08-19T08:25:00+03:00',
  },
]);

/**
 * Page 3 — SHORT (2 of 3). Contains one seeded SKU and one product the seed has
 * never heard of, so a reconcile over this catalog yields a create.
 */
export const PRODUCT_LIST_PAGE_3 = page(3, [
  {
    id: 445566785,
    sku: 'SKR/16KR',
    name: 'Kraft Shaker 16 oz',
    price: { amount: 27, currency: 'SAR' },
    quantity: 80,
    status: 'sale',
    categories: [{ id: 301007, name: 'Shakers' }],
    updated_at: '2026-08-19T08:30:00+03:00',
  },
  {
    id: 445566999,
    sku: 'NEW/SALLA/001',
    name: 'Bamboo Cutlery Set',
    description: 'Disposable bamboo cutlery, boxed.',
    price: { amount: 18, currency: 'SAR' },
    unlimited_quantity: true,
    status: 'sale',
    urls: { customer: 'https://packvio.salla.sa/p445566999' },
    main_image: { id: 70010, url: 'https://cdn.salla.sa/packvio/bamboo.jpg', main: true },
    images: [{ id: 70010, url: 'https://cdn.salla.sa/packvio/bamboo.jpg', sort: 0, main: true }],
    categories: [{ id: 301013, name: 'Cutlery' }],
    updated_at: '2026-08-19T08:35:00+03:00',
  },
]);

export const PRODUCT_LIST_PAGES = [
  PRODUCT_LIST_PAGE_1,
  PRODUCT_LIST_PAGE_2,
  PRODUCT_LIST_PAGE_3,
] as const;

/** Every product across all three pages, flattened. */
export const ALL_LIST_PRODUCTS = PRODUCT_LIST_PAGES.flatMap((entry) => entry.data);

/**
 * A `fetchPage`-compatible stub for `SallaApiService.paginate`, so a reconcile
 * test can walk the three pages without touching the network.
 */
export function listProductsStub(page: number): Promise<SallaListResponse<LooseProduct>> {
  const found = PRODUCT_LIST_PAGES[page - 1];
  // A page past the end returns an empty list, which is what stops paginate().
  return Promise.resolve(found ?? { status: 200, success: true, data: [] });
}

/** An upstream catalog with NOTHING in it — the reconcile safety test. */
export function emptyCatalogStub(): Promise<SallaListResponse<LooseProduct>> {
  return Promise.resolve({
    status: 200,
    success: true,
    data: [],
    pagination: { count: 0, total: 0, perPage: PER_PAGE, currentPage: 1, totalPages: 0 },
  });
}

/** Categories, as `GET /categories` returns them. One page is enough. */
export const CATEGORY_LIST_PAGE_1: SallaListResponse<Record<string, unknown> & { id: number }> = {
  status: 200,
  success: true,
  data: [
    {
      id: 301001,
      name: 'Coffee Paper Cups',
      parent_id: null,
      status: 'active',
      sort_order: 1,
      image: { url: 'https://cdn.salla.sa/packvio/cat-coffee-cups.jpg' },
      updated_at: '2026-08-19T08:00:00+03:00',
    },
    {
      id: 301002,
      name: 'Coffee Cup Lids',
      parent_id: null,
      status: 'active',
      sort_order: 2,
      image: null,
      updated_at: '2026-08-19T08:01:00+03:00',
    },
    {
      id: 301099,
      name: 'Seasonal Packaging',
      parent_id: 301001,
      status: 'active',
      sort_order: 40,
      image: null,
      updated_at: '2026-08-19T08:02:00+03:00',
    },
  ],
  pagination: { count: 3, total: 3, perPage: 50, currentPage: 1, totalPages: 1 },
};
