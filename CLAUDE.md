# Packvio — Project Brief

## What this is

Bilingual (ar default / en) wholesale food & beverage packaging website. Brand: Packvio, owned by
Smavio Limited Trading Co., Riyadh, KSA. B2B wholesale: case quantities of 200–6000 units, plus
custom logo printing. The primary conversion is a QUOTE REQUEST (RFQ), not the cart. Cart checkout
is secondary and hands off to Salla.

## Architecture

Monorepo, npm workspaces:

- apps/api — NestJS 11 + TypeORM + PostgreSQL. Owns Salla integration and is the site's data source.
- apps/web — Next.js 15 App Router + next-intl + Tailwind v4. Reads from apps/api. No direct Salla calls.
- packages/shared — shared TypeScript types (DTOs) consumed by both.

Salla = merchant back office (products, payments, ZATCA invoicing, shipping).
Nest mirrors Salla's catalog into Postgres via webhooks + a nightly reconcile job.
Next renders from Nest with ISR; Nest triggers on-demand revalidation after writes.

## Non-negotiable rules

- Arabic is the DEFAULT locale. `/` redirects to `/ar`. English lives at `/en`.
- RTL: use ONLY logical CSS properties (ms-/me-/ps-/pe-/start-/end-/text-start/text-end).
  Never left/right physical properties in layout. Test every component in both directions.
- Product codes, dimensions and Latin SKUs inside Arabic text must be wrapped in a bidi-isolating
  span (`unicode-bidi: isolate; direction: ltr`) or they will render scrambled.
- All user-facing strings come from messages/ar.json and messages/en.json. No hardcoded copy in JSX.
- TypeScript strict everywhere. No `any` without a written justification comment.
- Every Nest module: controller + service + DTOs with class-validator. No business logic in controllers.
- Every DB change is a generated TypeORM migration. Never use synchronize:true outside tests.

## Brand tokens

Primary cyan: #4FC0DF
Deep purple: #39255F
Panel tint: #EAF4FB (light-blue product panel background, matches the printed catalog)
Neutral ink: #1B1B1F
Fonts: Poppins (Latin display + headings), IBM Plex Sans Arabic (Arabic body/headings),
a monospace face for product codes/specs.
Visual devices from the printed catalog to reuse:

- a thin checkerboard band as a section divider
- a rotated vertical category tab on the page edge (flips side under RTL)
- the Packvio "P" mark as a 3–5% opacity background watermark on product panels

## Content sources

Company profile, product catalog and brand identity PDFs live in /docs. Product data ultimately
comes from Salla; the PDFs are the reference for categories, product codes, specs and case quantities.

## Reference site (structure only, not visuals)

promopack.sa — pages: shop, catalog, faq, about, contact; home has category tiles, a three-pillar
value band, latest-products rail, and an inline enquiry form. We are building a better version of this.

## Commands

docker compose up --build
— THE WHOLE STACK on your machine, one command. Postgres,
migrations, the catalogue seed, the API and the site.
No .env needed; every value has a dev default.
http://localhost:3000 the site
http://localhost:4000/api/v1 the API (+ /docs for Swagger)
localhost:5433 Postgres
Built images, so a code change needs `up --build` again.
For fast iteration use dev:api / dev:web below against the
same Postgres. Production is docker-compose.prod.yml, a
different shape — see the header of docker-compose.yml.
npm run dev:api — Nest in watch mode (port 4000)
npm run dev:web — Next dev server (port 3000)
npm run build — build both workspaces
npm run typecheck — tsc --noEmit in both workspaces, then lint:rtl
npm test — jest in BOTH workspaces. apps/api: unit tests always run; the
database-backed catalog suite runs when Postgres is reachable and skips
(loudly) when it is not. apps/web: pure logic and server-rendered markup
via react-dom/server — no jsdom, no browser. `tsconfig.jest.json` exists
only because ts-jest needs `jsx: react-jsx` and CommonJS where the app
build wants `preserve` and ESM; do not move those overrides into
tsconfig.json.
NEXT_DIST_DIR=.next-build npm run build
— build apps/web without evicting a running `npm run dev:web`; on Windows
the two fight over .next and the build dies with EPERM.
npm -w apps/api run migration:run — apply pending migrations
npm -w apps/api run migration:revert — undo the last migration
npm -w apps/api run seed — seed the catalog from docs/catalog.json (idempotent)
npm run lint:rtl — fails if any .tsx/.css under apps/web/src uses a physical
direction (ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/
border-l/border-r, margin-left/right, padding-left/right, left:/right:).
Escape hatch: a same-line comment `rtl-ok: <reason>`.

## Copy pending business sign-off

Four claims were written in a stronger form, then weakened because nobody has confirmed them.
The site currently ships the DEFENSIBLE version. **Restore the original verbatim once Packvio
confirms it — do not re-weaken it, and do not invent a third wording.**

| Claim           | Shipping now (ar / en)                                                                | Original, pending sign-off (ar / en)                                                                                                                                                                                   | What must be confirmed                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Food safety     | `مواد صالحة لملامسة الأغذية` / `Food-contact grade materials`                         | `خامات آمنة غذائيًا … مختارة لتتوافق مع اشتراطات الهيئة العامة للغذاء والدواء لملامسة الأغذية` / `Food-safe materials … sourced to comply with SFDA requirements for food contact`                                     | That supplier certificates actually evidence SFDA food-contact compliance. Naming a regulator without documentation is the highest-risk claim on the site. |
| Delivery speed  | `توصيل سريع داخل الرياض` / `Fast delivery in Riyadh`, hero stat value `سريع` / `Fast` | `التوصيل داخل الرياض 24–48 ساعة` / `Delivery inside Riyadh 24–48h`, and `الأصناف المتوفرة في المستودع تخرج من مستودعنا بالرياض خلال 24 إلى 48 ساعة` / `Stocked lines leave our Riyadh warehouse within 24 to 48 hours` | That 24–48h is a commitment operations will stand behind, not a best case. A published numeric SLA is quotable back at you.                                |
| Colour printing | `… وهي متاحة على منتجات مختارة` / `… available on selected products`                  | `على معظم أصناف التشكيلة` / `across most of the range`                                                                                                                                                                 | Which products actually print. See the `customPrinting` per-category flags in docs/catalog.json — that split is the same open question in data form.       |
| Shipping reach  | `الشحن داخل المملكة عند الطلب` / `Shipping across the Kingdom on request`             | `تصل إليك في جميع أنحاء المملكة` / `delivered across the Kingdom`                                                                                                                                                      | Whether nationwide shipping is a standing service or arranged case by case.                                                                                |

Two further items are flagged but NOT weakened, because they are choices rather than claims:

- **Arabic numerals are Latin digits** (`ar-SA-u-nu-latn` in `lib/format.ts`) — `1,000`, not `١٬٠٠٠`.
- **Business hours** in `messages/*.json` `contact.hours` are assumed (Sun–Thu 9–18, Sat 10–16,
  Fri closed). Nothing in /docs states them.

## Deviations

Decisions that depart from the brand guide or the brief, with the reason. Read before
"correcting" any of them.

- **Arabic typeface: IBM Plex Sans Arabic, not Lama Sans.**
  The brand identity guide specifies Lama Sans for Arabic. Lama Sans is not freely
  licensable — it is a commercial face with no open web licence — so it cannot be
  self-hosted or shipped via next/font. IBM Plex Sans Arabic is the substitute: it is
  SIL OFL licensed, available on Google Fonts, has a matching humanist-sans tone, and
  covers the 400/500/600 weights the design needs. If Smavio buys a Lama Sans web
  licence, swap it in `apps/web/src/app/fonts.ts` via `next/font/local` — nothing else
  needs to change, because components only reference the `--font-body` token.

- **Cyan is a fill colour only, never text on light surfaces.**
  #4FC0DF on white measures 2.11:1. That fails the WCAG AA floor for body text (4.5:1)
  _and_ the large-text floor (3:1), so it is not usable for display type either — which
  is a stricter rule than the brief assumed. Links and small text on white use
  brand-purple (#39255F, 13.09:1). Ink on a cyan fill is fine (8.12:1), and cyan as text
  on purple is fine (6.20:1).

- **next/font variables are named `--font-*-src`, not `--font-*`.**
  Tailwind v4's `@theme` writes `--font-display` on `:root`, and next/font writes its
  variable on `<html>` — the same element. Sharing the name makes the winner depend on
  stylesheet order and can silently drop the webfont. So next/font exposes
  `--font-display-src` / `--font-body-src` / `--font-mono-src`, and globals.css composes
  the public tokens (`--font-display`, `--font-body`, `--font-mono`) from them with
  fallbacks. Components still only ever use the public token names.

- **Latin headings use Poppins; Arabic headings stay on IBM Plex Sans Arabic.**
  Poppins has no Arabic coverage, so an Arabic heading set in it would silently fall back
  to a system font. `html[lang='en']` scopes the display face to Latin pages; Arabic
  headings use the body face at weight 600, which is its display weight.

- **Font `<link rel="preload">` tags are missing on WINDOWS builds only (upstream Next bug).**
  The fonts themselves are correct everywhere: self-hosted, `font-display: swap`, and exactly
  10 preloadable `-s.p.woff2` files (Poppins latin ×3, IBM Plex Sans Arabic arabic+latin ×3,
  JetBrains Mono latin ×1). But `next-font-manifest.json` comes out empty on Windows, so no
  preload links are emitted. Cause: `next/dist/build/webpack/plugins/next-font-manifest-plugin.js`
  tests `mod.request.includes('/next-font-loader/index.js?')` with forward slashes, while the
  Windows module request is `...\next-font-loader\index.js?`. Normalising the separator before
  the test (`mod.request.split('\\').join('/')`) makes the manifest populate with all 10 files
  and the preload links appear — verified locally, then reverted, because hand-patching
  node_modules is not durable. Linux/CI builds are unaffected, so a normal deploy ships the
  preloads. Only add patch-package if we ever build production artifacts on Windows.

- **Bilingual content is column-per-locale (`name_ar`, `name_en`), not a translations table.**
  The textbook answer is a `translations` side table keyed by (entity, locale). It is the
  right answer when the locale set is open. Ours is closed: exactly `ar` and `en`, forever —
  the brief fixes it and the routing (`/ar`, `/en`) hard-codes it. Against that, a join table
  costs a join (or a lateral, or an aggregate) on every catalog read for the site's hottest
  queries, makes "order by the Arabic name" awkward, and turns a NOT NULL "both locales must
  exist" rule into application-level validation. Column-per-locale keeps every read a single
  flat row, lets Postgres index `slug_ar` and `slug_en` directly — both are unique URL
  segments — and makes a missing translation a schema error rather than a missing row. The
  cost is that adding a third locale means an ALTER TABLE per text column; that is the trade
  accepted, and it is not a migration anyone will be asked to write.

- **Quote references come from a Postgres sequence, not the application.**
  `quote_requests.reference` defaults to `packvio_next_quote_reference()`, a SQL function over
  the `quote_request_reference_seq` sequence, producing `PV-2026-0001`. Both objects are
  hand-added to the initial migration, because `migration:generate` only diffs entity metadata
  and cannot see a function an entity's default merely references. Allocating in Postgres means
  two concurrent RFQ submissions cannot collide the way `SELECT max()+1` can, and the reference
  stays human-readable for emails and the thank-you page. The counter does not reset each year —
  the year is just a prefix stamped at insert time. Consequence for calling code: the value is
  produced by the database, so an insert must read it back (`RETURNING`, or reload the entity)
  rather than assume the in-memory object has it.

- **The seed freezes a product's slugs at insert; only the printed-catalog columns re-sync.**
  `npm -w apps/api run seed` upserts on `Category.slug_en` and `Product.code`. On a re-run it
  refreshes names, size, material, case quantity, fulfilment mode and sort order, but leaves
  slugs, descriptions, `is_featured` and every `meta_*` column alone — slugs are public URLs
  and the rest is editorial copy that a re-seed must not clobber. It never writes `price`,
  `stock_quantity`, `salla_id` or `salla_url`; those stay NULL for the Salla sync to fill.
  On a slug-base collision every claimant gets the code suffix (`wooden-stirrer-178-mm-st-178wood`),
  not just the runners-up, so the URL never depends on the order of rows in catalog.json.

- **Webhook idempotency keys are derived, because Salla does not send an event id.**
  The webhook envelope carries only `event`, `merchant`, `created_at` and `data` — there is
  no event identifier to dedupe on. So `salla_events.event_id` holds
  `sha256:<sha256(event | storeId | createdAt | sha256(rawBody))>`. The inner hash is over
  the RAW request bytes, never a re-serialisation: a Salla redelivery is byte-identical and
  collapses onto the same key, while two genuinely different deliveries differ somewhere in
  those bytes. An explicit `event_id` field is preferred if Salla ever starts sending one
  (stored as `salla:<id>`), but a bare top-level `id` is deliberately NOT trusted — in Salla
  payloads that field identifies the app or the resource, and treating it as an event id
  would collapse every delivery for that resource into one row.

- **The webhook route validates its body by hand, outside the global ValidationPipe.**
  `main.ts` installs a pipe with `forbidNonWhitelisted: true`, which is right for our own
  endpoints and wrong for a third party's. Salla adding a field to a payload would 400 the
  delivery, and rejecting a webhook because the sender got _more_ informative is exactly the
  wrong failure mode. So the controller types `@Body()` as `unknown` — no class metatype, so
  the pipe skips it — and `parseWebhookEnvelope()` runs class-validator with `whitelist: false`
  on just the envelope fields we depend on. A test asserts a payload with an unmodelled field
  still returns 200 under the strict global pipe.

- **Tokens are encrypted in `salla_events.payload`, not just in `salla_tokens`.**
  `app.store.authorize` delivers the access and refresh tokens inside the webhook body, and
  every body is persisted verbatim so a failed handler can be fixed and replayed. Storing it
  as-is would put both tokens in cleartext in a jsonb column and quietly undo the encryption
  on `salla_tokens`. So the same AES-256-GCM envelope (`v1:base64(iv|authTag|ciphertext)`,
  key from `SALLA_TOKEN_ENC_KEY`) is applied to `access_token`/`refresh_token`/`token` leaves
  before the row is written, and the handler decrypts on the way out. Replay still works;
  `SELECT payload FROM salla_events` shows `v1:…` where the token was.

- **Token refresh is serialised by a Postgres advisory lock, not an in-process mutex.**
  Salla invalidates the old refresh token as soon as a refresh succeeds, so two concurrent
  refreshes leave the second one presenting a burned token — Salla answers `invalid_grant`
  and the store is disconnected until someone reinstalls the app by hand. The contenders can
  be in different processes (a webhook worker and the nightly reconcile, or two replicas), so
  the mutual exclusion has to live in the one thing they share. `refreshUnderLock()` takes
  `pg_advisory_xact_lock(key)` where key = the first 8 bytes of
  `sha256('packvio:salla-token-refresh:' + storeId)` read as a signed big-endian int64
  (Postgres bigint is signed; the namespace prefix keeps it from colliding with any advisory
  lock added later for another purpose). The re-read inside the lock is not redundant — the
  caller that loses the race must return the winner's token instead of refreshing again.

- **The public catalog API flattens locale, and always ships `alternateSlug`.**
  Every `/api/v1/catalog/*` endpoint takes `?locale=ar|en` (default `ar`) and returns `name`,
  `slug`, `description` already resolved — never `nameAr`/`nameEn` pairs. Alongside them every
  localized entity carries `alternateSlug`, the same row's slug in the other locale. That field
  is not a convenience: without it the language switcher on a product page has nowhere to send
  the reader but the home page, which is the most common way a bilingual site loses someone
  mid-visit. It is produced by `CatalogMapperService` and nothing else builds response shapes,
  because a rule implemented at five call sites is a rule that decays at four of them.

  Slug lookups resolve against BOTH locale columns regardless of the requested locale, and
  report `canonicalSlug` plus `slugMatchedOtherLocale` so Next can 301 rather than 404 a page
  that plainly exists. `PaginatedResponse<T>`, `CatalogProductDetailDto` and friends live in
  `packages/shared` and are what apps/web imports.

- **Arabic search normalises in Postgres, never in JavaScript.**
  `packvio_normalize_ar(text)` is an IMMUTABLE SQL function folding hamza forms (أ إ آ ٱ → ا),
  teh marbuta (ة → ه), alef maksura (ى → ي), stripping tashkeel and tatweel, then lowercasing.
  It backs `products.name_ar_normalized`, a STORED generated column with a GIN trigram index,
  so `اكواب` and `أكواب` return the same rows through an index scan. `search/arabic-normalize.ts`
  mirrors the function character-for-character and is applied ONLY to the incoming query string
  — normalising the column in JS would mean loading every row into Node to transform it, which
  no index can help with. The two halves are pinned together by a test that runs the same
  samples through both and asserts they agree; change one and the suite fails.

- **TypeORM cannot manage the catalog's indexes, so `migration:generate` lies about them.**
  Ten indexes in `CatalogSearchAndReadIndexes` are hand-written SQL: five GIN trigram indexes
  (TypeORM's `@Index` cannot express an operator class), and five partial B-tree indexes whose
  column order and `WHERE` predicate TypeORM's introspection does not read back faithfully — it
  reports `(id, created_at)` for an index created as `(created_at DESC, id)`. The consequence:
  **every future `migration:generate` will propose dropping all ten. Those DROP INDEX lines are
  false positives — delete them from the generated migration.** Everything else in a generated
  diff is real. The backstop is a test in `test/catalog-api.spec.ts` that asserts the indexes
  still exist, so accepting a bad drop fails the suite rather than silently degrading search to
  a sequential scan in production.

- **The home page's `featured` rail is a true filter, and catalog.json owns the flag.**
  This previously sorted by `is_featured DESC, sort_order` and topped the rail up with whatever
  came next in catalog order, because nothing was flagged yet. Twelve products now carry
  `"featured": true` in docs/catalog.json, so `/catalog/home` filters on `is_featured = true`
  outright. The fallback had to go with it: an editor who un-flags a product would otherwise see
  it keep appearing in the rail and reasonably conclude the flag does nothing.

  The flag is the ONE editorial column the seed re-syncs on every run (`product.isFeatured =
item.featured === true`), because it belongs to the printed-catalog selection rather than to
  copy written in the admin — everything else editorial (slugs, descriptions, `meta_*`) is still
  left alone. Consequence: un-flagging a product means editing catalog.json, not the database,
  or the next re-seed puts it back.

- **apps/api resolves `@packvio/shared` through the built package, not a `paths` mapping.**
  Pointing `paths` at `../../packages/shared/src` pulls those files into the API's tsc program,
  which drags the inferred `rootDir` up to the monorepo root and emits `dist/apps/api/src/main.js`
  instead of `dist/main.js` — after which `node dist/main.js` cannot find itself. The npm
  workspace symlink resolves the package the same way apps/web will, and `npm run build` /
  `npm run typecheck` both build packages/shared first. Relatedly, `tsconfig.build.json` sets
  `incremental: false`: combined with nest-cli's `deleteOutDir`, incremental compilation wipes
  dist and then decides every output is already up to date, emitting nothing and failing with a
  missing-module error that names no cause.

- **The language switcher resolves server-side, from a middleware-injected `x-pathname`.**
  Next gives a LAYOUT no way to see the current URL — only the page below it gets `params` — and
  the header renders in the layout. The first implementation worked around that with a client
  context: a page published its `alternateSlug` in a `useEffect`, and the switcher read it. The
  href in the initial HTML was therefore always the home-page fallback, corrected only after
  hydration, so crawlers and anyone who clicked quickly got the wrong destination on exactly the
  pages where it matters. Now `middleware.ts` copies `request.nextUrl.pathname` onto the request
  headers before handing it to next-intl (on the REQUEST — a response header is invisible to the
  server tree), the layout reads it via `resolveAlternateHref()`, and the anchor is correct in the
  first byte on every route. `SetLocaleAlternates` and its context are deleted.

  Two consequences. First, `resolveAlternateHref` calls `headers()`, which makes the whole
  `[locale]` tree DYNAMIC — the pages are no longer prerendered at build time. The data is still
  cached (`revalidate: 300` on every API fetch), so this costs a render, not a round trip, but it
  is a real trade and it is the brief's chosen design. Second, the resolver must use
  `findProduct` / `findCategory`, never the `*OrNotFound` variants: those call `notFound()`, and a
  layout that 404s takes down the page below it that was about to render a proper 404 itself.

- **`supports_custom_printing` is a column, and catalog.json owns it PER CATEGORY.**
  The listing filters on "custom printing available", which cannot be answered by anything already
  in the schema. It is declared once per category in docs/catalog.json (`"customPrinting": false`
  on lids, cutlery and equipment; true on the other 13) and products inherit it in the seed,
  because it is one commercial decision about a product family, and 18 reviewable flags is
  something the Packvio team can actually check where 213 would not be. It re-syncs on every seed
  run for the same reason `is_featured` does. **The current split is a first pass and is listed
  under "Copy pending business sign-off" — it is a guess about what Packvio prints on.**
  Default is `true` at the database level: printing is what the catalog is for, so the exceptions
  are what get enumerated.

- **The RFQ is posted from the BROWSER, not proxied through Next.**
  Every catalog read is server-rendered, so this is the one exception, and the reason is the rate
  limit: the API counts submissions per client IP, and proxying through a Next route handler would
  make every submission in the world arrive from the web server's single address — the fifth RFQ
  of the hour from anyone would throttle everyone. It works because CORS already allows
  `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` is public by definition. `main.ts` sets
  `trust proxy = 1` (one hop, not `true`) so `request.ip` is the real client and cannot be forged
  by prepending an `X-Forwarded-For`.

  Rate limiting is registered in `LeadsModule`, not globally via `APP_GUARD`: the catalog
  endpoints are read-only and hit by every page render, and a global limiter would throttle our
  own ISR revalidation long before it inconvenienced an abuser. Note that the limit counts
  REQUESTS, so validation failures consume quota too — client-side validation (sharing
  `normalizeSaudiPhone` with the server) is what keeps that from biting a real buyer.

- **The honeypot returns 201, not 400.**
  `CreateQuoteRequestDto.website` is hidden from people and irresistible to bots. A filled one is
  accepted with a plausible-looking reference and silently discarded — nothing is written. A 400
  naming the field would tell the bot exactly what to stop filling in, and the next submission
  would get through. It is a modelled DTO field rather than something read off the raw body
  because the global pipe runs `forbidNonWhitelisted`, which would 400 on an unmodelled property
  and leak the same information.

- **The quote basket and UTM attribution use sessionStorage ONLY.**
  Not localStorage, not a cookie. Tab-scoped storage of something the user is actively assembling
  is "strictly necessary for a service they explicitly requested" — no consent banner, nothing to
  disclose. A cookie would ship a shopping list to the API and the CDN on every request for no
  benefit; localStorage would leave a business's purchasing shortlist on a shared machine
  indefinitely, and a persistent attribution record is exactly the cross-visit tracking that does
  need consent. The cost is that neither survives closing the tab, which for a single-session
  conversion funnel is the correct lifetime. Both read in an effect, never during render, so the
  server and first client render agree.

- **Saudi phone normalisation lives in packages/shared, used by BOTH sides.**
  `normalizeSaudiPhone` is imported by the browser form and by the API's `@IsSaudiPhoneNumber`
  validator. One implementation because the failure mode of two is the worst a lead form has: the
  buyer fills everything in, presses submit, and is rejected by a rule the page never showed them.
  It accepts `+966…`, `00966…`, `966…`, `05…` and `5…`, any spacing, and Arabic-Indic digits
  (an Arabic keyboard produces those by default), and canonicalises to E.164. Saudi MOBILE only —
  we reply over WhatsApp, so a landline lead is one nobody can reach the way this business works.

- **Product JSON-LD omits `offers` entirely.**
  Every row's price is null until the Salla sync runs. schema.org allows a Product with no offer,
  and that is the honest description; emitting a zero, a placeholder or an invented amount is
  fabricated pricing in a machine-readable format, which Google Merchant treats as a policy
  violation and can demote the whole domain for. The block appears when real prices do.

- **The Salla sync writes through an ALLOWLIST of columns, never a denylist.**
  `WRITABLE_PRODUCT_COLUMNS` / `WRITABLE_CATEGORY_COLUMNS` in
  `sync/catalog/salla-catalog.mapper.ts` enumerate the only columns a sync may touch, and
  `pickWritableProductColumns()` filters the assembled patch again at RUNTIME — the types stop a
  typo, the filter stops a key that arrived from parsed JSON. A denylist would be correct only
  until someone added a column: the next local-only flag after `isFeatured`,
  `supportsCustomPrinting` and `fulfilmentMode` would be silently writable from the day it was
  added, and would surface months later as "Salla keeps resetting our featured products".

  Deliberately absent from the allowlist: slugs (public URLs, frozen at insert), `code` (the join
  key — a Salla SKU edit must not sever the row from the seed it matched), `sortOrder`, every
  `meta*` column, `priceTiers`, and **`size` / `material` / `caseQuantity`**. The Product entity's
  docblock calls those three mirrored, but Salla's payload carries no field that means any of
  them — they come from the printed catalog. Listing them would open a path to nulling out
  curated spec data the moment someone added a plausible-looking source field.

- **A Salla product matches a local row by SKU FIRST, `sallaId` second.**
  The seed holds all 213 printed-catalog codes with `salla_id = NULL`; Salla holds the same
  products under its own ids. Matching on `sallaId` alone would find nothing on the first sync and
  insert 213 duplicates alongside the curated rows — each with a fresh slug, no case quantity and
  no custom-printing flag. SKU is what marries the two catalogs. Comparison is case-insensitive
  (`upper(code)`), because someone typing `pcs/08` into Salla means `PCS/08` and treating those as
  two products is the same duplicate-catalog failure by another route. `sallaId` remains the
  fallback for a product whose SKU was later edited upstream.

- **Reconciliation may only soft-delete rows with a non-null `salla_id`.**
  This is the most destructive thing in the codebase and the guard is one filter in
  `sallaSourcedProducts()`. Absence from Salla is evidence only about rows that CLAIM to come from
  Salla; a `salla_id = NULL` row came from the printed catalog and has never existed upstream. If
  the delete pass considered them, the first reconcile against a store whose catalog has not been
  uploaded yet would soft-delete all 213 products — every listing empty, every product URL 404 —
  and would log "succeeded" while doing it. A second guard sits underneath: an upstream catalog
  that comes back completely EMPTY skips the delete pass entirely, because an empty page 1 is far
  more likely to be an auth failure or a permissions change than a merchant deleting everything.
  Both are covered by `test/salla-reconcile.spec.ts`, including the inverse — that a genuinely
  orphaned Salla-sourced row IS proposed for deletion, so the filter cannot be widened into a
  no-op.

  The admin endpoint is **dry-run by default**; `?apply=true` is required to write, matched with
  strict equality so `?apply=1` and `?apply` are still dry runs. The safe side of that line has to
  be the side you land on by accident.

- **The sync writes ONE locale column and leaves the other untouched.**
  Salla admin v2 returns one language per request — the store's own — and no reliable per-locale
  read was found, so `SALLA_STORE_LOCALE` (default `ar`) says which of `name_ar` / `name_en` a
  sync fills. The opposite column is never written on an update: overwriting a curated Arabic name
  with the English one Salla happened to return is not recoverable without a re-seed, whereas a
  slightly stale second locale is. INSERT is the exception — both name columns are NOT NULL and
  there is no curated value to protect, so a new product gets the store-language text in both and
  a human translation, once written, is never overwritten afterwards. **If Salla turns out to
  expose a per-locale read, this is the one decision to revisit.**

- **Timestamps are parsed with their timezone, not with `new Date()`.**
  Salla sends `updated_at` as an ISO string OR a Laravel `{ date, timezone_type, timezone }`
  object whose `date` is naive. Reading `'2026-08-19 08:00:00'` with `new Date()` interprets it in
  the SERVER's zone, so a UTC container reads an Asia/Riyadh timestamp three hours late — and this
  value is the sole input to the out-of-order guard, which means a three-hour skew is exactly
  enough to let a stale webhook overwrite fresher data. `parseSallaDate` resolves the named zone
  through `Intl` (not a hard-coded +03:00, which a DST zone would break) and falls back to UTC,
  never to server-local.

- **Images reconcile by URL, not by Salla image id.**
  `main_image` arrives both as an object with an id and as a bare URL string; the bare form has no
  id at all, so a diff keyed on id would re-insert the same picture on every sync. The URL is the
  only identifier present in every shape. Removed images are hard-deleted, unlike products —
  nothing references an image row historically, and keeping withdrawn photography would eventually
  show a product in packaging it no longer ships in.

- **Revalidation is debounced per SyncRun and collapses above 40 tags.**
  A reconcile touching 200 products produces ~600 tags (two locale slugs each, plus categories).
  `RevalidationBatch` collects them across the whole run and sends ONE request at the end; above
  `TAG_THRESHOLD` it sends the single broad `catalog` tag instead, because at that size the whole
  catalog is being rebuilt anyway and enumerating 600 tags only costs a large body and 600
  individual `revalidateTag` calls. Below it the specific tags are worth keeping, so one product
  edit does not evict the entire site's cache.

  `RevalidationService` NEVER throws. A failed purge means the site serves data up to five minutes
  stale — the ISR window expires on its own — whereas failing the sync would, on a webhook, make
  Salla redeliver an event we have already fully applied. It also gets its OWN axios instance via
  `RevalidationModule`: SyncModule's instance carries SallaApiService's auth interceptor, which
  fetches a Salla token on every request it touches, and sharing it would make cache purging fail
  outright on any deployment where the Salla app is not installed yet.

- **Tags cover BOTH locale slugs.** The site fetches with the slug from the URL it is rendering,
  so `product:كوب-…` and `product:single-wall-…` are two different cache entries for one row.
  Purging one would leave the other locale stale.

- **Two measures, and a desktop-only vertical scale.**
  The page measure went 1280 → **1440px** (`--container-page`), with a **1600px** `wide` variant
  (`--container-wide`) used by the hero and the value band. Two rather than one because they solve
  opposite problems: 1600px of body copy runs to ~180 characters and is genuinely hard to read,
  while a 1440px hero on a 1920px display leaves 240px of dead margin either side. Gutters are
  16 / 24 / **40px** at <640 / <1024 / ≥1024 — the third step is what stops the layout reading as
  a narrow strip pinned to the middle of a wide screen.

  Section spacing roughly doubles at ≥1024px only: `sm` 48→64, `md` 64→112, `lg` 96→160, via new
  `--spacing-4xl` (112px) and `--spacing-5xl` (160px). **Mobile is deliberately unchanged** —
  vertical space costs a phone reader scrolling, and 160px of padding on a 375px screen is a third
  of the viewport spent on nothing. The problem being fixed was a desktop problem.

  The product grid steps 1 → 2 → 3 → 4 → 5 at **600 / 900 / 1280 / 1600**, declared as
  `--breakpoint-g2..g5` because those thresholds are the CARD's (a product card needs ~300px
  before its code wraps), not Tailwind's defaults.

- **Only three categories have children, and products live on the LEAF.**
  `cutlery`, `clear-cups` and `wrapping-paper` are the only families holding more than one product
  type; everywhere else a subcategory would be an empty shelf advertising stock we do not carry.
  A product is assigned to the child ONLY, never to both — so the read side has to roll up:

  - `CategoryQueryService.productCounts()` uses a recursive CTE with `COUNT(DISTINCT product_id)`,
    or Cutlery would report 0 in front of 56 products.
  - `ProductQueryService`'s category filter expands each slug to its whole subtree, or
    `/categories/cutlery` would be an empty page. Inactive categories terminate the walk, so
    hiding a parent hides everything under it.
  - `CatalogCategoryDetailDto.ancestors` (root-first, excluding self) exists solely so a
    subcategory can render "Home > Products > Cutlery > Spoons".

  `countActive()` counts **top-level only** (18, not 28): the hero and About page stat has to
  agree with the 18 families the nav, home grid and footer all show.

  The seed resolves `parent` in a SECOND pass, after every row has an id — a child can appear
  before its parent in catalog.json, and resolving inline would depend on file order.

  Note: the brief said "11 new children"; the taxonomy it specifies yields **10** (6 + 2 + 2).

- **The FAQ lists questions Packvio has not answered yet, and marks them.**
  `faq-content.ts` owns an `answered` flag per question. False means nobody has confirmed it: the
  page shows a placeholder with a visible "pending" badge, and `FaqJsonLd` **excludes it from the
  structured data entirely**. That gate is the point — Google renders FAQ rich results directly in
  search, so marking up "we will confirm this shortly" would publish that sentence as Packvio's
  official answer to "what is your minimum order", under the brand's name, on the results page.
  It is also a structured-data policy violation.

  Listing the unanswered questions rather than hiding them is deliberate: minimum quantity, lead
  time and payment terms are exactly what a first wholesale buyer asks, and a FAQ that skips them
  reads as evasive rather than incomplete. 13 of 25 are currently placeholders.

- **The contact map is OpenStreetMap, not Google.**
  A Google Maps embed sets cookies and sends the visitor's IP and referrer to Google before they
  have agreed to anything — under PDPL/GDPR that is the kind of transfer that needs a consent
  banner in front of it. The OSM embed sets no cookies and needs no API key, so the site keeps its
  no-banner property, which is worth more than the nicer tiles. `loading="lazy"` because the map
  sits at the bottom of a sidebar most readers never reach.

  **The pin is central Riyadh, NOT Packvio's address** — it is a stand-in until the real one is
  confirmed. Change `NEXT_PUBLIC_MAP_LAT` / `_LNG` / `_ZOOM` in `.env` and `contact.address` in
  messages; no code change needed. See the block comment in `contact/location-map.tsx`.

- **The category icon set is a consistent stand-in, not final artwork.**
  28 icons in `components/icons/categories/`, all 24×24, stroke 1.75, round caps and joins,
  `currentColor`, no fills, content inside x/y 3–21, at most one interior line. `CategoryIconBase`
  owns those attributes so an icon file contains ONLY its path data and cannot quietly ship a
  different stroke width. `categoryIcon(slug, { parentSlug })` resolves from either locale's slug
  and falls back to the PARENT's icon before the generic box — an undrawn "Spoons" showing the
  cutlery icon is a reasonable stand-in; a generic box next to eight drawn icons looks like a bug.
  The styleguide renders the whole set at 24/48/96 because the failure modes are size-dependent:
  interior detail turns to mud at 24, inconsistent weight only shows at 96.

- **The hero drift is columns on DESKTOP ONLY; tablet gets the marquee.**
  The brief specified two drifting columns at 640–1023px. It ships as the horizontal
  marquee there instead, and the reason is measured rather than aesthetic.

  A side panel only works by narrowing the headline beside it, and a narrowed Arabic headline
  is what exposed the fallback-metrics bug described in the next entry. Even with that bug
  fixed the tablet range has no room for both: the column widths where the Arabic headline
  wraps identically in the fallback and the real face do not leave space for a panel beside
  them — at 768px the stable column ends at 504px and a 50% panel starts at 384px. Ignoring
  that measured CLS 0.038 at 640px against a baseline of 0.000, so tablet keeps its full-width
  headline and gets the marquee instead. Above 1024px there is room for both.

  There is one residual, and it is worth knowing before anyone rewrites the hero copy. With
  the fallback fixed, the Arabic headline's line count still disagrees between the two faces
  at column widths of 760–780px, which is viewports **1542–1580px** — a ~38px-wide window
  where the swap costs a measured CLS of 0.0194. It is under the 0.02 bar and was left alone
  rather than patched, because any patch would be tuned to the exact wording of today's
  headline. If that copy changes, re-run the width sweep rather than assuming this window
  moved with it.

- **`adjustFontFallback: false` on the Arabic face, with an explicit Arabic fallback stack.**
  next/font's default builds a fallback `@font-face` named "IBM Plex Sans Arabic Fallback"
  from `local("Arial")`, with `size-adjust` computed by comparing Arial's metrics to the real
  face's. That is right for a Latin font and actively wrong for this one: **Arial has no Arabic
  glyphs**, so Arabic fell through to a last-resort face while a size-adjust derived from LATIN
  metrics was still applied over it. Measured on the hero headline at 56px — real face 756px,
  synthesised fallback **590px (22% narrow)**, Segoe UI 786px (4% wide). The synthesised
  fallback was making the swap worse than no adjustment at all, and it cost the UNTOUCHED hero
  a CLS of 0.048 at 768px.

  So the synthesised face is off and `--font-body` in globals.css names a real Arabic face per
  platform: Segoe UI (Windows), Geeza Pro (older macOS/iOS), SF Arabic (macOS 12+/iOS 15+),
  Noto Sans Arabic (Android, most Linux), Tahoma (long tail), then `sans-serif`. Segoe UI alone
  would have been a Windows-only fix while this site's Arabic traffic is mostly phones, which
  would have put the 22% error straight back for the readers who matter most. `system-ui` is
  deliberately NOT in that list: it resolves to the platform UI face, which on a Latin-configured
  system can have no Arabic coverage and would swallow the fallthrough before the named Arabic
  faces got a turn.

  The trade is the ascent/descent overrides that face carried. They are affordable because every
  size in the type scale sets line-height as a UNITLESS multiplier, so a line box takes its
  height from font-size and not from the font's own vertical metrics — **do not introduce a
  `line-height: normal` anywhere in this design, or that trade stops being free.**

  Measured after, /ar, 6 cold runs per width: 768px 0.048 → **0.0047**, 1440px **0.0020**,
  1280px **0.0142**, 640px **0.0045**, 1920px **0.0009**. English is unaffected (≤0.0003
  everywhere) — its headings are Poppins, which keeps its own perfectly valid Arial fallback.

  **The `lg:max-[1541px]:min-h-[2lh]` guard that used to sit on the hero h1 was REMOVED, not
  kept.** It existed only to absorb the 22% error; with the metrics correct, the width sweep
  shows the two faces agreeing across the guard's entire range, and measuring with and without
  it gives identical CLS. It was a workaround for this bug, and it went when the bug did.

- **The drift's tiles reserve two lines for the name and clip the code to one.**
  The code is `truncate`d because JetBrains Mono KEEPS its synthesised fallback — correctly, its
  codes are Latin and Arial has those — but that fallback is Arial at `size-adjust: 134.59%`,
  35% wider than the real face. In a narrow column that is the difference between a code fitting
  and not: at 1280px `TC-170-PS-SPN-W` set on two lines until JetBrains Mono arrived and then
  collapsed to one, taking 21px off the tile and pulling every tile below it up (CLS 0.0297 →
  0.0142 once clipped). A SKU that wraps mid-token reads as broken anyway.

  The name uses `minHeight: '2lh'` alongside the line clamp, so a one-line Arabic name does not
  become a two-line name when the webfont swaps and grow the tile, the track and everything below —
  a measured 23px of travel across 36 tiles, charged to an element that is pure ornament. It
  makes the tiles a uniform height, which the columns wanted anyway.

- **`dealIntoColumns` deals against the tile ABOVE, not against the previous tile.**
  A tile's neighbours on screen are the ones above and below it in its own column; the columns
  move independently and at different speeds, so nothing is reliably beside anything. In the
  flat list those neighbours are `count` apart, which means a perfectly interleaved order deals
  into the worst possible result: A B C A B C over three categories becomes one column of A,
  one of B and one of C. So each column takes the first remaining product that differs from its
  own last tile. `selectDriftProducts` feeds it by taking the category with the MOST products
  left rather than the next one that differs — the naive version spends its variety early and
  emits the last four straws in a row.

- **public/brand/packvio-mark.svg is a placeholder.**
  The real "P" mark has not been extracted from the identity PDF yet (the PDFs in /docs
  are image-based; this machine has no pdftoppm/poppler to rasterise them). The file is a
  geometric stand-in with the correct filename and `0 0 100 100` viewBox so nothing 404s.
  Replace the path data, keep the filename and viewBox.

- **Product photography comes from the printed catalogue cards, and the Salla sync may not delete it.**
  `docs/product-images.json` maps product codes to the pictures in
  `apps/web/public/products/`. The source was a Drive export whose filenames were
  UUIDs, carrying nothing about which product each picture showed — so every card
  was read and matched on the CODE printed in its own spec table, which is the
  same string `products.code` holds. **150 of 213 products have a picture**; the
  gaps are forks-and-knives, straws, stirrers, the HMR containers and most of the
  spoons, which were not in the export.

  Two variants per card. `card` is the whole catalogue card — trimmed of its page
  margin, squared on the card's own tint — and is what the seed makes PRIMARY,
  because it is reliable and on-brand (the card's field _is_ the panel tint).
  `shot` is an automated crop of just the product photograph: it reads better in
  a grid, but roughly one in five clips a title band or a table edge, so it ships
  as the second gallery image rather than the first. After a human pass over the
  crops, flip `primaryVariant` in the manifest and re-seed — no code change.

  Both variants are square WebP so the grid has ONE aspect ratio and no image can
  contribute CLS, and both are letterboxed on the card's own background rather
  than on white, so a trimmed card and a cropped shot sit on the same field.

  **`planImageReconciliation` refuses to delete a row whose `salla_id` is null and
  whose url starts with `/products/`.** Without that filter the first
  `product.updated` carrying an `images` key would wipe the gallery of every
  product whose photography is not in Salla yet — today, all of them — and would
  log success while doing it. It is the same mistake as deleting seed-only
  products in reconciliation, guarded the same way, and tested both ways round:
  a seeded row survives an empty Salla gallery, and a Salla-sourced row at a
  `/products/` url is still deleted, so the guard cannot decay into a no-op.

  Three discrepancies the cards exposed in docs/catalog.json, left UNCHANGED because
  `code` is the SKU the Salla sync joins on and renaming one mid-flight would
  orphan a row:
  - `WT-KS508` should be **`WT-KSS08`** (its sibling on the same card is
    `WT-KSS12`; the extraction read the second S as a 5). Aliased in the image
    manifest so the picture still lands. Fix the code before the Salla catalogue
    is uploaded, not after.
  - `ST/1200KR` is a real sushi tray with its own card, and is MISSING from
    catalog.json entirely. Adding it would change the product count that
    `salla-reconcile.spec` asserts, so it is flagged rather than added.
  - `SQ-ALU05` is printed `SQ-ALU25` on the card. Unresolved; the digit is
    ambiguous at card resolution.

- **Deploy wrappers live in `scripts/`; `deploy/scripts/` is server-side only.**
  Two directories, and the split is deliberate. `scripts/*.sh` run on YOUR machine
  and drive the server over one SSH session — `npm run deploy`, `deploy:status`,
  `deploy:logs`, `deploy:watch`, `deploy:rollback`, `deploy:seed`, `deploy:ssh`,
  `deploy:setup`. `deploy/scripts/*.sh` run ON the server, some of them inside a
  container: `backup-loop.sh` is the `backup` service's entrypoint,
  `init-letsencrypt.sh` breaks the nginx/certbot chicken-and-egg once, and
  `local-verify.sh` brings the production topology up on a laptop.

  `deploy/scripts/deploy.sh` and `deploy/scripts/lib.sh` were DocGen's files
  pasted in unchanged — still naming `tawal-docgen`, `/var/www/tawal-docgen`,
  port 8095 and a `/api/health` endpoint this stack does not publish, with
  `ROOT_DIR` resolving to `deploy/` so `deploy.config` was looked for in the
  wrong place. They were deleted rather than patched. Four things differ enough
  from DocGen that adapting them in place would have been the longer route:

  1. **Three images, not two** (api, web, nginx), all built from the REPO ROOT
     with `-f`, because both workspaces depend on `packages/shared` and the root
     lockfile and a context of `apps/api` cannot see either.
  2. **`NEXT_PUBLIC_*` are build args.** Next inlines them into the browser
     bundle at build time; DocGen's Vite frontend read its config at runtime.
     The deploy script passes them from `DOMAIN` in deploy.config — set them in
     `.env` alone and the site renders perfectly with `undefined` in every URL.
  3. **Nothing but nginx publishes a port**, so the health check runs from
     INSIDE the network (`compose exec nginx curl http://api:4000/...`) rather
     than against a published port on the host. It therefore reports on the
     deploy rather than on DNS, TLS and Basic Auth.
  4. **Migrations are a step between build and restart**, never on API boot.

  Kept from DocGen, because they were right: one SSH session per script so a
  password is typed once, the Windows multiplexing fallback, `setsid` so a
  dropped connection cannot kill a build mid-way, `:previous` retagging for a
  rebuild-free rollback, and `up -d` without a preceding `down`.

- **A product that can be ordered always offers a way to order it.**
  `ProductActions` used to gate "Order on our store" on `sallaUrl`, which is NULL
  on every row until the Salla catalogue is uploaded and the sync runs. The net
  effect was that no product on the site offered any way to place an order: a
  buyer who already knew their SKU and quantity — a reorder, which is most B2B
  traffic — had nothing but a quote form.

  So the button is now shown for any product whose `fulfilmentMode` is `cart` or
  `both` (210 of 213), and the DESTINATION upgrades on its own:

  - `sallaUrl` present → the Salla storefront. Card, Mada, Apple Pay, Tabby and a
    ZATCA invoice, handled by the back office built for it.
  - `sallaUrl` null → **WhatsApp**, pre-filled with the product name, its code,
    the number of cases and the resulting unit count. In Saudi B2B that is not a
    downgrade — it is how a large share of reorders are actually placed, and it
    works today instead of after the store goes live.

  Nothing needs changing when the sync lands: the row gains a `sallaUrl` and the
  same button starts pointing at checkout. The quote stays PRIMARY — this is a
  quote-first wholesale catalogue and no price is published yet — with ordering
  secondary and "add to quote list" demoted to ghost.

  Note what was NOT built: an on-site cart and checkout. Taking payment means
  payment gateway onboarding, ZATCA e-invoicing and refunds, all of which Salla
  already does and all of which would have to be re-certified here. The handoff
  is the design, not a shortcut.

- **54 products have no photograph, 9 more show a sibling's, and the placeholder
  carries a category icon.**
  Coverage is 159 of 213. Three tiers, kept distinguishable on purpose:

  1. **150 have their own card** from the printed catalogue.
  2. **9 carry a REPRESENTATIVE image** — listed under `representative` in
     docs/product-images.json, each with the sibling it borrows from and why.
     The 12 oz kraft shaker has no card; the 16 oz does, and it is the same
     product in another size. Their alt text says "product family shown" /
     "صورة توضيحية لمجموعة المنتج", because the picture is honest about the family
     and not about the SKU — and the spec table beside it states the real size.
     `kind: 'duplicate'` is the one case with no caveat: `ST-178WOOD` and
     `STI-178WOOD` are the same object listed twice in the printed catalogue.
     They are a SEPARATE map rather than more entries in `products` because a
     compromise indistinguishable from the real thing in the data is one nobody
     goes back and fixes.
  3. **54 have nothing** and are not getting an invented picture: forks and
     knives (19), most spoons (12), HMR containers (8), straws (6), other
     tableware (5), plastic stirrers (2), `BB/01`, `PET-JAR-M`. Showing a spoon
     on a fork's page is worse than showing no photograph — a buyer orders what
     they saw. **These need a supplier shoot; nothing in code fixes them.**

  For that last group `ImagePlaceholder` now draws the product's CATEGORY ICON
  at 64px above the code. Before, every placeholder in a grid was identical apart
  from six characters of mono type, so a page of cutlery and a page of lids were
  indistinguishable at a glance. The icon restores shape-level scanning, which is
  most of what product photography does in a grid. It works because
  `CatalogProductSummaryDto.primaryCategory` was already on the summary payload
  for exactly this purpose; `ProductMedia` and `ProductGallery` now pass it
  through, and `categoryIcon` falls back to the parent's icon before the generic
  one, so an undrawn subcategory shows its family rather than a box.

- **`docker compose up --build` is the DEV stack; production is a different file.**
  The root `docker-compose.yml` used to start Postgres alone, so the one command
  everyone reaches for first brought up a third of the system and left the rest
  to be worked out. It now runs the lot: Postgres, a one-shot `init` that
  migrates and seeds, then the API and the site.

  Three things make it work with no setup at all, and each is a deliberate
  departure from the production file:

  1. **No `.env` required.** Every value has a dev default inline, including the
     two secrets the API refuses to boot without — `SALLA_TOKEN_ENC_KEY` and
     `QUOTE_IP_HASH_SALT` are validated for SHAPE at boot, so the placeholders
     have to be a real 32-byte base64 string and a real 32+ character salt.
  2. **Migrations and the seed run automatically**, as an `init` service the API
     waits on with `service_completed_successfully`. Production keeps them as
     deliberate manual steps for the reason in that file's comments; a dev stack
     that comes up with an empty database is one you have to finish by hand,
     which is the thing this file exists to avoid. The seed is idempotent, so a
     second `up` changes nothing.
  3. **The API publishes a port.** In production nothing but nginx does. Here the
     RFQ form posts from the BROWSER to `NEXT_PUBLIC_API_URL`, so the API has to
     be reachable from the host. Everything is bound to `127.0.0.1`, so it is on
     your machine and not on your network.

  Project name `packvio-dev` against production's `packvio`: separate containers,
  separate network, separate `pgdata` volume. Running this on the server would
  not touch production data — though it would still build images and eat RAM on
  a box that also runs DocGen, so don't.

  **Note on upgrading:** the old root compose had no `name:`, so its volume was
  named after the directory (`testing-packvio_packvio_pgdata`). This one is
  `packvio-dev_pgdata`, so the first `up` starts on an empty database — which is
  fine, because `init` migrates and seeds it. Anything you had typed into the old
  one (test RFQs) stays in the old volume.

- **Both JSON files under docs/ ship inside the API image, and forgetting one fails silently.**
  The seed reads `docs/catalog.json` AND `docs/product-images.json` at runtime,
  resolving them five directories up from `dist/database/seeds`. `.dockerignore`
  excludes `docs/*` — 76MB of PDFs — so each file needs an explicit `!` exception
  there and an explicit `COPY` in `apps/api/Dockerfile`.

  `product-images.json` was missing from both when it was added, and the failure
  mode is the worst kind: `loadProductImageSource` treats an unreadable manifest
  as "this checkout has no photography" and returns null, so the seed COMPLETES,
  reports success, and leaves all 213 products showing a placeholder. It would
  have shipped that way to production. The seed now prints a loud multi-line
  warning when the manifest is absent rather than a single quiet line.

- **The compose image defaults are `:latest`, because that is what the deploy builds.**
  They used to be `:local`, which nothing ever built — `docker-compose.local.yml`
  pins `:local` explicitly on every service, so the default was serving no one.
  The deploy tags `:latest` / `:previous` / `:failed`, because that is what makes
  a rebuild-free rollback possible, and `deploy.sh`, `rollback.sh` and `seed.sh`
  all export the three names before invoking compose.

  The hole was any compose command run BY HAND on the server. A bare

      docker compose -f docker-compose.prod.yml up -d --force-recreate nginx

  resolved `packvio-web:local`, found nothing locally, tried to pull it from
  Docker Hub and died with `pull access denied ... repository does not exist` —
  which names neither the tag nor the variable, and sends you looking for a
  registry login you never needed. Worse, `nginx` depends on `web` and `api`, so
  a command aimed at one container took down the other two on the way past.
  Matching the default to reality means a hand-run compose command now does the
  obvious thing, and the exports in the scripts are belt-and-braces rather than
  load-bearing. **If the build tags ever change, change them in four places:
  those three scripts and these defaults.**

  Relatedly, the deploy now copies the WHOLE of `deploy/nginx` (Dockerfile,
  nginx.conf, entrypoint, templates, snippets) to the server rather than just
  templates and snippets: the nginx service carries a `build:` alongside its
  `image:`, so compose needs the context present on the rare occasion it decides
  to rebuild. It is a copy, not a `--delete` sync — `deploy/nginx/htpasswd` is
  generated on the server and is not in the repo, and wiping it stops nginx from
  starting at all.

- **The edge has two modes, because this server already runs another application.**
  `docker-compose.prod.yml` used to publish `80:80` and `443:443` outright. The
  first deploy to the shared box failed at the very last step:

      failed to bind host port 0.0.0.0:80/tcp: address already in use

  A host port can be bound once, and DocGen's nginx on the same server already
  had it. The collision is at Docker's port-publishing layer, _before_ nginx
  runs, so nothing inside the nginx config could have fixed it. There are three
  real answers — give Packvio its own IP, move the other application, or put one
  proxy in front of both — and the third is the only one that does not touch
  DocGen's deployment.

  So `EDGE_MODE` (in the server's `.env`, default `standalone`) selects which
  template `deploy/nginx/docker-entrypoint.sh` renders:

  - **`standalone`** — exactly the old behaviour. Packvio's nginx owns :80/:443,
    terminates TLS, and its certbot issues and renews. Correct on a host where
    Packvio is the only application; needs no new variables set.
  - **`behind-proxy`** — Packvio's nginx serves plain HTTP on
    `EDGE_HTTP_PUBLISH` (`127.0.0.1:8080`), and the nginx that already holds
    :80/:443 proxies this hostname to it using the server block in
    `deploy/nginx/front-proxy/packvio.conf.example`.

  Four things in that split are load-bearing, and three of them are mistakes
  that would have shipped as a working-looking site:

  1. **The locations moved into `snippets/site.conf`.** Both templates include
     it, so the Basic Auth gate, the Salla webhook exception, the `/api/v1/`
     split and the cache policy cannot drift between modes. Only the TLS
     envelope differs, which is the only thing that should.
  2. **No HTTPS redirect in behind-proxy mode, and this is not an omission.**
     The front proxy terminates TLS and forwards over HTTP, so a `301` to
     `https://` sends the browser back around the same circle — an infinite
     redirect, not a misconfiguration you notice in the logs. The front proxy
     does that redirect, once.
  3. **`set_real_ip_from` in `nginx.conf`, or the RFQ rate limit silently
     becomes global.** Docker NATs the loopback hop, so without it every
     request reaches this nginx from the bridge gateway, `proxy.conf`'s
     `X-Forwarded-For $remote_addr` writes that one address, and _every
     enquiry on the site shares one per-IP bucket_ — the fifth of the hour
     throttles every buyer. Only private ranges are trusted, which is what
     lets the directives live in `nginx.conf` unconditionally: in standalone
     mode a public client matches none of them and an invented
     `X-Forwarded-For` is ignored, so they are inert rather than a hole.
     Verified both ways round: a forwarded `203.0.113.7` arrives at the app as
     exactly that one address, and a client-injected `1.2.3.4, 203.0.113.7`
     still arrives as `203.0.113.7` alone, so a caller cannot mint a fresh
     rate-limit identity per request.
  4. **`$packvio_forwarded_proto` / `_port` replace `$scheme` / `$server_port`
     in `proxy.conf`.** Behind the proxy, TLS ends there and this hop is plain
     HTTP, so `$scheme` reports `http` for a visitor who is on HTTPS and
     `$server_port` reports 80. Both are maps in `nginx.conf` that fall back to
     the direct values, so one `proxy.conf` is correct in both modes.

  Also: certbot **idles** in behind-proxy mode with a log line saying why, and
  the certificate for this hostname belongs to the front proxy's certbot —
  only the process holding :80 can answer an HTTP-01 challenge. Do not point
  both at the same name. And `deploy.sh` now checks the edge ports in
  **preflight**, because the alternative is discovering the conflict after
  several minutes of Docker build, in a daemon error that names a container id
  rather than the process holding the port.

  The example front-proxy block deliberately sets no security headers, no CSP
  and no `auth_basic`. Packvio's own nginx sends all of them per-location; a
  second CSP header means the browser enforces the **intersection** of the two
  policies, and a second password would sit in front of the webhook exception
  and meet Salla with a 401 it cannot answer.

- **Compose refuses to run on a missing variable rather than substituting a blank.**
  Every `${VAR}` in `docker-compose.prod.yml` that is fatal when empty is now
  `${VAR:?message}`. The first deploy to the shared server is why. `.env` was
  missing `PACKVIO_DOMAIN` and `SITE_URL`; compose printed

      level=warning msg="The \"SITE_URL\" variable is not set. Defaulting to a blank string."

  and **carried on**. Migrations ran, every container was created, the deploy
  reported each step as done, and the stack then failed in two places at once
  for reasons that named neither variable:

  - `api` crash-looped on `Config validation error: "WEB_ORIGIN" is not allowed
to be empty. "NEXT_PUBLIC_SITE_URL" is not allowed to be empty`. Both are
    `${SITE_URL}`. The Joi schema gives each a `.default()`, which fires only
    when a key is **undefined** — compose had supplied `''`, and
    `Joi.string().uri()` rejects an empty string. A variable compose "defaults
    to a blank string" is therefore _worse_ than one that is absent.
  - `nginx` would have rendered `server_name ;` and
    `ssl_certificate /etc/letsencrypt/live//fullchain.pem` from the blank
    `PACKVIO_DOMAIN`.

  `${VAR:?}` makes compose exit with the message instead, for every invocation
  including a manual one. The variables that may legitimately be blank —
  `SALLA_CLIENT_ID`, `SALLA_CLIENT_SECRET`, `SALLA_WEBHOOK_SECRET`,
  `ADMIN_API_KEY`, `REVALIDATE_SECRET`, all `.allow('')` in the schema — are
  `${VAR-}` instead, so the blank is explicit rather than a warning. The four
  with real Joi defaults (`SALLA_API_BASE`, `SALLA_OAUTH_TOKEN_URL`,
  `SALLA_STORE_LOCALE`, `QUOTE_RATE_LIMIT`) mirror those defaults here.

  **A `:?` message must not contain a `": "` sequence.** YAML reads that as a
  mapping key inside a plain scalar and rejects the whole file; "generate with:
  openssl rand -base64 32" broke it exactly once. Same trap as the certbot
  command, which is a `>-` block scalar for the same reason.

  `deploy.sh` repeats the check in preflight — before three Docker builds rather
  than after them — and additionally rejects a `SITE_URL` with no scheme, which
  the URI validator fails just as firmly as an empty one.

- **A listener on the HOST is as fatal as a container, and the port preflight
  failed to say so.**
  The port check added with the edge modes treated another _container_ on :80 as
  fatal but a non-Docker listener as a warning. The server turned out to have a
  **system nginx** on :80 and :443 — not DocGen's container — so the deploy
  printed `! port 80 also has a non-Docker listener: nginx`, continued in
  `standalone` mode, and left nginx crash-looping. Both cases now fail, with the
  same remedy, and the message points at `/etc/nginx/conf.d/` for a host nginx
  rather than assuming the front proxy is containerised.

- **A failed health check prints the internal network's membership.**
  `nginx: [emerg] host not found in upstream "web:3000"` while `compose ps`
  shows `web` as `Up`, and Next reporting `EAI_AGAIN` for `api`, are the same
  symptom: a container holding a **stale network endpoint**, left behind by an
  earlier `up` that failed partway through creating it — in this case the one
  that died on `failed to set up container networking`. `EAI_AGAIN` is the
  resolver not answering at all, not a name that does not exist, which is the
  tell. Nothing in `compose ps`, the logs or `docker inspect` of the container
  says so, so the health-check failure path now lists what is actually attached
  to `packvio_internal`. A container present in `ps` but absent from that list
  is this bug, and the cure is a full `down` + `up -d`, which rebuilds the
  network; named volumes, `pgdata` included, survive unless `-v` is passed.

- **The front-proxy example uses `listen ... http2`; Packvio's own templates use `http2 on;`.**
  Not an inconsistency — the two files run on different nginx builds.
  `deploy/nginx/templates/*` run in Packvio's container, Alpine 3.21, nginx 1.27.
  `deploy/nginx/front-proxy/packvio.conf.example` runs on whatever nginx the HOST
  has, and Ubuntu 24.04 still ships 1.24. `http2 on;` arrived in 1.25.1, so on the
  host it fails the entire config with `[emerg] unknown directive "http2"` — which
  it did, on the real server. `listen 443 ssl http2;` has worked since 1.9.5 and
  still works on 1.25+, where it only logs a deprecation warning, so it is the
  portable spelling for a file that may land anywhere.

  Worth noting how this was missed: the same error appeared while validating the
  edge-mode work against a local nginx 1.24 and was written off as a sandbox
  artifact, which was correct for the container template and wrong for this file.
  **Anything under `front-proxy/` is validated against the OLDEST nginx likely to
  run it, not the one in our image.** Re-verified on 1.24: passes.

- **The staging gate is a switch, not two lines of committed config.**
  `STAGING_GATE` in the server's `.env` — `on` by default — decides whether
  Basic Auth covers the site. `docker-entrypoint.sh` writes
  `/etc/nginx/gate/gate.conf` from it and `snippets/site.conf` includes that
  file unconditionally; nginx has no `if` for this, and `snippets/` is a
  read-only bind mount, so the generated fragment needs a directory of its own.

  A switch rather than an edit because the alternative is predictable: someone
  wants the password gone, deletes two lines from committed config, and it is
  never put back. This way `off` is a one-line `.env` change and `on` is the
  default anyone gets without thinking about it.

  Three properties worth preserving:

  1. **Declared at SERVER level, disabled per-location.** Protection is the
     default and the three open paths say so explicitly, so a location added
     later inherits the gate instead of appearing on the public internet
     because somebody forgot a line.
  2. **The gate cannot fail OPEN.** With `STAGING_GATE=on` the entrypoint tests
     the password file with `-s`, not `-f`, and refuses to start if it is
     missing _or empty_. An empty file is the dangerous one: nginx starts
     normally and rejects every correct password, which reads as a forgotten
     password rather than a broken deploy. Verified: on+file → exit 0,
     on+empty → exit 1, on+absent → exit 1, off+absent → exit 0, nonsense → exit 1.
  3. **`off` does not put the site in Google.** `X-Robots-Tag: noindex` and
     `robots.txt Disallow: /` are separate mechanisms and both still apply —
     confirmed by test in both states. Going properly public means removing all
     three deliberately, together.

  `deploy.sh` keeps an empty `htpasswd` file present even when the gate is off,
  because Docker creates a **directory** at a bind-mount source that does not
  exist, and that directory is what nginx trips over the day the gate goes back
  on. It also detects that directory and says how to remove it.

- **The logo is the real one now, extracted from the identity PDF — and it is raster.**
  `public/brand/packvio-mark.svg` and its two siblings were geometric
  placeholders, because the PDFs under /docs are image-based and this machine
  had no poppler to rasterise them. It does now (`apt-get install
poppler-utils`), so the artwork came out of `Packvio identity.pdf` page 5,
  which carries all three variants side by side on white.

  **There is no vector to extract.** `pdfimages -list` reports every page as a
  300 ppi JPEG with a soft mask, and `pdftocairo -svg` produces an SVG wrapping
  two `<image>` elements. So the shipped assets are WebP, not SVG, and a true
  vector logo needs the designer's original AI/EPS file. A hand-trace was
  rejected deliberately: it would be an approximation of the brand mark that
  differs from the brand asset, which is worse than an honest raster.

  Transparency is recovered by un-premultiplying against the white page —
  `a = 255 − min(r,g,b)`, then `C = (c − 255(1−a)) / a` — rather than by keying
  out white, which would have eaten the pale cyan in the gradient.

  Five files, all from the one source so they cannot drift:

  | file                        | what it is                                                 |
  | --------------------------- | ---------------------------------------------------------- |
  | `packvio-logo.webp`         | horizontal lockup, colour — header                         |
  | `packvio-logo-white.webp`   | the SAME artwork with its own alpha filled white — footer  |
  | `packvio-mark.webp`         | the P mark alone — the panel watermark                     |
  | `packvio-mark-white.webp`   | ditto, white                                               |
  | `packvio-logo-stacked.webp` | mark above wordmark; unused, kept for layouts that need it |

  **Two aspect ratios are load-bearing and neither is square.** The lockup is
  3.111:1 and the mark is 0.6156:1. The placeholders were declared `148x40`
  (3.7:1) in the header and footer and `size x size` in `Watermark`, so the real
  artwork dropped into those boxes would have been stretched 19% wide and
  squashed 38% narrow respectively. Both call sites now carry the measured
  ratio, `Watermark` has a `MARK_ASPECT` constant, and a re-export means
  re-measuring. Nothing at build time catches this — they are raster files.

  `src/app/icon.svg` is replaced by `icon.png`, the mark on a transparent
  square with 18% breathing room.

- **The announcement strip is the brand bar, and it is not sticky.**
  The first line on the page — the one that says what this company sells — was
  `text-caption text-ink-muted` on `bg-surface-alt`, `py-1.5`, and
  `hidden lg:block`. The quietest element on the page, and absent entirely on
  phones. It is now white on `bg-brand-purple` at a readable size and visible
  at every width; the phone number and email stay desktop-only, because on a
  phone they wrap the bar to two rows and they already live in the drawer.

  **It moved OUT of `HeaderShell` in the same change, and that is not
  cosmetic.** `HeaderShell` is `sticky top-0`, so the whole header sticks. A
  26px desktop-only hairline could afford that; a 40px bar that also shows on
  phones cannot — a sticky strip plus a sticky nav would hold ~100px of a 667px
  screen permanently, on every page, to repeat a tagline the reader has already
  read. Only the main bar is sticky now. The strip is unmissable where it is
  and then gets out of the way, which is the better reading of "make it
  prominent" than "make it permanent".

  `LanguageSwitcher` gained an `on-dark` variant for it. `inline` could not be
  reused: its rest state is `text-ink-muted` and its HOVER is
  `text-brand-purple` — the new background colour, so the link would have
  vanished on the one interaction meant to confirm it. A variant rather than a
  `className` override, because two Tailwind utilities for the same property
  resolve by STYLESHEET order, not by which is last in the attribute, so an
  override would work or not depending on how the CSS happened to be emitted.

- **Section spacing came back down; the previous revision over-corrected.**
  The scale ran 48/112/160 at desktop on the reasoning that 96px reads as mean
  at 1440px. True of one section in isolation, false of a stacked page: what a
  reader experiences is the SUM of two paddings, so adjacent `md` sections sat
  224px apart and `lg` sections 320px. At that distance the eye stops reading
  rhythm and starts reading "the page has ended".

  Now 48/64/80 for `md` and 48/64/96 for `lg` — a 160px gap between `md`
  sections, which is still generous. Mobile came down too (64→48): the earlier
  note was right that a phone should not GAIN space, but that did not make 64px
  already correct. `--spacing-2xhalf` (80px) is the new desktop step; `4xl` and
  `5xl` are no longer used by `Section` and stay defined for full-bleed features
  where that much air is deliberate.

- **Category tiles are photographs, keyed on the ENGLISH slug via the icon
  registry's alias map.**
  `public/categories/<slug>.webp`, 17 of the 18 top-level categories, 640×640
  so the grid has one aspect ratio and no tile can contribute layout shift.
  Each is the cleanest product shot in that category with the card's title band
  and spec table trimmed off and the result squared on the card's own tint;
  `docs/category-images.json` records which source image each came from.

  Picking them was two passes, and the second one matters. An automatic score —
  ink coverage in the top and bottom strips, where bands and tables live — got
  12 right and **missed five**, because those cards' title bands are dark text
  on a PALE fill, so no row was ever "full-width ink". Those five
  (`cutlery`, `food-trays`, `soup-cup-lids`, `soup-cups`, `wrapping-paper`)
  were chosen by eye from a contact sheet of every candidate and are marked
  HAND in the generator. **Do not re-run the scorer and trust it.**

  `hmr-containers` has no tile, because no photograph of an HMR container
  exists anywhere in the supplied export. It falls back to its category icon —
  the treatment the whole grid used to wear — so it reads as a category rather
  than as a broken image.

  `categoryImage()` accepts EITHER locale's slug and canonicalises through
  `canonicalCategorySlug()`, newly exported from the icon registry. Keying on
  English alone and passing `category.slug` would have produced a grid with no
  photographs at all on the Arabic pages — the default locale, the ones most
  visitors see — while looking perfect in English.

- **Four Arabic category names were revised, and BOTH slugs stay aliased.**
  Register and accuracy problems rather than preferences: `أوعية` (vessels) is
  lab Arabic for a kraft bowl, `أدوات المائدة` means fine-dining cutlery rather
  than counter disposables, `عبوات` (containers) says nothing where `برطمانات`
  means jars, and the carry bags' handle is what distinguishes them from every
  other bag in the catalogue.

  The trap: the seed freezes a slug at INSERT and only re-syncs names, so an
  existing database keeps the slug derived from the OLD name forever while a
  database seeded from scratch derives the new one. `AR_TO_EN_SLUG` therefore
  carries both spellings for all four. Drop either and the icon and the tile
  vanish on the Arabic pages of one of the two deployments — the half that is
  hardest to notice, because English stays perfect throughout.

  Also fixed in the hero: `منشأتك الغذائية` is the register of a municipal
  licence, not of someone buying cups, and `تُورَّد بالعبوة` is a literal
  rendering of "by the case" that means little in the trade — Saudi wholesale
  quotes **بالكرتون**, which is also what `caseQuantity` actually counts.

- **"Leaf Spoon" is mistranslated throughout as "paper spoon", and it is a pun
  bug.** `ملعقة ورقية` means _paper_ spoon; `ورقة` means both "leaf" and "sheet
  of paper", so the shape name collapsed into a material claim. These spoons
  are `PS 2.05 G` — polystyrene. The name is therefore not just awkward, it
  states the wrong material on a food-contact product, which is the category of
  error the "Copy pending business sign-off" table exists for. **Not yet
  fixed**, because the correct replacement is a naming decision for Packvio:
  `ملعقة بلاستيك` loses the leaf shape that distinguishes these from the other
  spoons in the catalogue.

- **Colour and size variants roll up into one listing card; every SKU keeps its
  own page.**
  The catalogue lists each colour and each size as its own product, so
  `/categories/cutlery` showed seven near-identical Leaf Spoon cards differing
  only in the word Pearl, Candy Green, Blueberry… `docs/catalog.json` now
  carries `variantGroup`, `variantAxis`, `variantLabel{En,Ar}`,
  `variantGroupName{En,Ar}` and an optional `variantSwatch`, derived from the
  shared code prefix and the trailing name token.

  **45 groups cover 172 of 213 products, so the listing falls from 213 cards to 86.** The axis split is 26 size, 13 colour, 6 both; 91 products carry a hex
  swatch. Where a colour could not be read out of the label with confidence
  there is NO swatch and the chip falls back to its text — never a grey chip
  standing in for an unknown colour, which is how a buyer orders the wrong
  thing.

  **The rollup is a LISTING concern only.** Each variant keeps its own `code`
  (the SKU the Salla sync joins on), its own frozen slug and its own product
  page, and `VariantPicker` is a row of LINKS rather than a client-side toggle.
  Collapsing seven products onto one URL would cost six indexable pages and
  leave a buyer unable to send a colleague a link to the colour they meant.
  Pagination counts groups rather than SKUs, or the pager would lie about how
  many pages there are.

  The new columns are deliberately **absent from `WRITABLE_PRODUCT_COLUMNS`**,
  like every other local-only field: they come from the printed catalogue, and
  nothing in a Salla payload means any of them.

  Note that the Leaf Spoon group still reads `ملعقة ورقية 11.5 سم` in Arabic —
  see the mistranslation entry above. The grouping inherits the name; it did
  not introduce the error and cannot fix it.

- **Salla photography outranks the seeded catalogue cards, and nothing said so
  until a real database was pointed at the suite.**
  The delete guard above keeps a product's seeded cards when Salla images
  arrive. What no rule covered was which of them is PRIMARY. The seed marks its
  first picture `isPrimary` at `sortOrder` 0; the Salla parser marks its first
  picture `isPrimary` at `sortOrder` 0 too. So after one sync PCS/08 held four
  images, **two of them flagged primary**, with sort orders 0, 0, 1, 1 — and
  whatever renders "the primary image" picked whichever row the query returned
  first. The product page could show the catalogue card one day and the real
  photograph the next, and the gallery order was undefined.

  `planImageReconciliation` now demotes surviving seeded rows and re-sorts them
  after the incoming ones **whenever `incoming` is non-empty**, and leaves them
  completely alone when it is empty — with no Salla photography to defer to,
  demoting the only picture a product has would leave the page with no primary
  at all. Covered both ways round in the mapper spec.

  **This is only visible with Postgres running.** `npm test` skips the three
  database-backed suites and reports green, which is exactly how a two-primary
  bug reached a live deployment. To run them:

      pg_ctlcluster 16 main start
      createdb -O packvio packvio_test     # role: packvio / packvio, superuser
      export DATABASE_URL=postgres://packvio:packvio@127.0.0.1:5432/packvio_test
      npm -w apps/api run migration:run && npm -w apps/api run seed
      npm test

  With it up the full suite is **260 API + 25 web, all passing and none
  skipped**. Do that before shipping anything that touches the sync or the
  catalogue read path; the skip is silent and it hides precisely the class of
  bug that hand-written SQL produces.

- **Category tiles count SKUs, not variant families — deliberately.**
  Once variants grouped, `productCounts()` was changed to count families so the
  tile would not say "3 products" in front of a listing showing one card. That
  mismatch is real, and it is the lesser problem: counting families makes the
  Carry Bags tile read **"1 product"** against ten bags, Lunch Boxes 1 against
  nine, Shakers 2 against eighteen. A wholesale buyer reads that as "they
  barely carry this". Understating the range on the page whose whole job is to
  advertise it costs more than a count that differs from the number of cards.

  It also keeps ONE meaning for the word across the site: the hero's "213
  products in the catalog" is the sum of these tiles. Counting families here
  left two different numbers both labelled "products".

  The test that enforced `productCount === products.total` was rewritten rather
  than deleted. It now asserts the invariant that equality was standing in for
  — every SKU in the count is REACHABLE, as a card or inside some card's
  variant list — plus that grouping is actually collapsing something, so it
  cannot pass with the feature switched off.

- **Eight category tiles are the brochure's own section banners, and that is
  where `hmr-containers` finally got a picture.**
  The printed catalogue opens each chapter with a full lifestyle photograph —
  SOUP CUPS & ICE CREAM CUPS, SHAKERS / PAPER TUBS, COFFEE CUPS, LUNCH BOX &
  FOOD TRAYS, CLEAR CUPS, MICROWAVABLE HMR SERIES, CARRY BAGS & FOOD BAGS.
  Those are better tiles than any crop of a product card, and the HMR one is
  the only photograph of an HMR container that exists in any supplied asset, so
  the one category that had no tile now has the best one.

  Their English titles sit on a white swoosh across the bottom and are cropped
  away rather than shown on an Arabic page; the crop finds the swoosh by
  scanning up from the bottom for the last row that is not mostly white.

  **`lunch-boxes` and `food-trays` share ONE banner** and take different crops
  of it — the white box of chicken and wedges, and the kraft trays holding the
  hot dog and burger. The first attempt anchored both crops horizontally, which
  produced two nearly identical tiles, because a square crop of a 1280×1004
  photo is almost the whole photo. They are now explicit pixel boxes.

  The grid is therefore 8 lifestyle photographs and 10 product-on-tint crops,
  which do not match in style. That is the honest state of the available
  imagery, not a decision — prefer a banner whenever one turns up.

  **The banners did NOT fix the product-level gaps.** They are category
  photography. The 8 HMR SKUs are three bases and five lids, and a lid is not a
  tray: putting a picture of a loaded meal tray on a page headed "HMR 2
  Compartment Lid" is the same mistake as a spoon on a fork's page, which the
  `representative` mechanism exists to avoid rather than to license. Those 8,
  and `PET-JAR-M`, still need a supplier shoot.

- **The footer logo was stretched by `align-items: stretch`, not by its own
  dimensions.** The brand block is `flex flex-col`, whose default alignment
  stretches children across the cross axis, and an `<img>` with `width: auto`
  is stretchable — so `h-10 w-auto` pinned the height at 40px while the width
  was blown out to the full column, squashing the lockup. `w-auto` does not
  protect against this; only `self-start` does. The header is immune only
  because it is a flex ROW, where the stretch axis is the one `h-9` already
  fixes. Worth checking any other `<img>` dropped into a flex column.

- **`web` waited for `service_started`, not `service_healthy` — which is why
  `ECONNREFUSED 172.x.x.x:4000` appeared after every deploy.** `service_started`
  means the api CONTAINER has been started. It says nothing about Nest having
  finished bootstrapping and bound :4000. Next is "Ready in 180ms" and
  server-renders the home page immediately, so it won that race nearly every
  time. `apiFetch` throws `ApiUnreachableError` on an unreachable API rather
  than rendering empty data — deliberately, so a half-empty page is impossible
  — which means the reader got an ERROR PAGE, and the deploy's own health check
  (which fetches `/ar`) could fail on a stack that was seconds from fine.

  Fixed to `condition: service_healthy` in BOTH compose files. The thing that
  makes that wait real is a healthcheck on `api`, which neither file had.

  **The probe is spelled out in all three places rather than inherited.**
  Declaring `healthcheck:` with only timings and no `test:` is valid compose and
  is documented to inherit the image's probe — but if that inheritance did not
  happen, the container would have NO probe, never report healthy, and `web`
  would never start: a cosmetic log error turned into the site being down. That
  is not a risk worth an avoided duplication, so the `node -e` command now
  appears in `apps/api/Dockerfile`, `docker-compose.yml` and
  `docker-compose.prod.yml`, and `apps/api/test/deploy-startup-order.spec.ts`
  fails when the three drift apart.

  That suite also guards the silent failure mode directly: `condition:
service_healthy` against a service with no healthcheck does not error —
  compose just does not wait, and nothing in any log says why. Verified by
  mutation: reverting the condition, changing the probe path, and deleting the
  healthcheck block each make it fail.

- **"`npm run deploy` says successful but the website is not changing" was
  never a deploy bug.** The server does `git fetch` + `git reset --hard
origin/$BRANCH` and builds that. A zip pasted into the working tree, or a
  commit not yet pushed, is invisible to it — so the server rebuilt the
  identical commit, produced identical images, and reported success honestly.
  Nothing was wrong and nothing had happened, which is the most confusing pair
  of facts a deploy can present.

  Two checks now say so instead of leaving it to be deduced:

  1. **Locally, before anything is uploaded** (`scripts/deploy.sh`, before
     `setup_ssh`): lists uncommitted changes and unpushed commits, prints the
     `git add -A && git commit && git push` line, and asks for confirmation
     when stdin is a tty. Advisory, never fatal — every git call carries
     `|| true` because `set -euo pipefail` is on and a `| head` closing a pipe
     early would otherwise abort a perfectly good deploy via SIGPIPE.
  2. **On the server, after the fetch**: compares the checked-out SHA against
     `$DEPLOY/.last-deployed-sha` and prints either `new commits since the last
deploy: abc1234 → def5678` or a loud SAME COMMIT warning. It does NOT
     stop: redeploying an unchanged commit is a legitimate thing to want after
     an `.env` edit or a half-broken container. The marker is written only
     after the health check passes, so a failed deploy never claims the new
     commit as the deployed one.

- **The seed's "slug already held by another product in the database" line is a
  report of DUPLICATE PRODUCTS, not a cosmetic note.** It means a product's
  `code` changed between two generations of `docs/catalog.json`. The seed
  matches on `code` and never deletes, so the old row survives as an orphan —
  still holding the clean slug. The new product is then filed under
  `carry-bag-white-19-cm-cb19` while the stale one keeps `carry-bag-white-19-cm`
  and sorts first. Two of everything affected, with the old one in front, which
  is indistinguishable from a deploy that did not take effect. It cost a long
  diagnosis once; the seed script now says so in its own output.

  `npm run deploy:prune` (`apps/api/src/database/seeds/prune.ts`) is the only
  thing in this project that removes products. Dry run by default.

  **Soft-deleting an orphan is not enough to free its slug.**
  `uq_products_slug_en` is a plain unique index, not a partial one, so a
  soft-deleted row holds its slug forever — which is why the seed reads
  `withDeleted: true` to work out what is taken. The prune therefore renames as
  well as soft-deletes: `archived-<code suffix>-<old slug>`, prefixed so the
  archived rows sort together and keyed on the code so two of them can never
  collide. There is a test that fails if the rename is ever dropped as
  redundant.

  **The slug reclaim is deliberately narrow.** Slugs are frozen for life
  everywhere else, because they are public URLs. The prune will move one only
  when it is exactly `<planned slug>-<that product's own code suffix>` — the one
  shape the seed itself produces on a collision — and only when the base has
  just been freed. A slug that merely looks similar, or whose base is still held
  by a live product, is left alone.

- **The prune has a blast-radius guard, and it exists because the test suite
  triggered the disaster first.** Its input is whatever `docs/catalog.json` is
  inside the running API image, so a stale or truncated catalogue makes every
  absent product an orphan. The first version of the test helper passed a
  one-product source against the seeded database and `--apply` archived all 213
  products in one transaction — correctly, by its own rules. So `--apply` now
  refuses when the prune would remove more than 25% of live products (floor of
  10, so a young catalogue is not frozen), exits non-zero, and names the stale
  catalogue as the likely cause. `--force` is the override.

  The 22-product case this was built for is about 10% — comfortably inside the
  guard, which is the balance it was tuned for.

- **`npm run deploy:seed` changed data and left the site serving the old pages,
  silently.** Catalog fetches carry `revalidate: 300`, so a seed is invisible
  for up to five minutes and the first visitor after that still gets the stale
  page while the fresh one renders behind them. A rebuild masked this — a new
  container starts with an empty cache — so it only showed up once data changed
  on its own. `npm run deploy:purge` now calls the same `/api/revalidate`
  endpoint the Salla sync uses with the `catalog` tag, and `deploy:seed` and
  `deploy:prune` both end by pointing at it. With no `REVALIDATE_SECRET` the
  endpoint disables itself rather than running unauthenticated, so the script
  falls back to restarting `web` and says why.

- **`planSlugs` moved into `slugify.ts` as `planProductSlugs`.** The prune has to
  decide whether a product's current slug is its planned slug plus a collision
  suffix, which is only safe if "planned" means exactly what the seed meant by
  it. Two copies of that function would be two definitions of a public URL. The
  version in `seed.ts` is now a thin wrapper that folds the coercions into the
  seed summary.
