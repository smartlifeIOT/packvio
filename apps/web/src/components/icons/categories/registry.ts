import type { ComponentType } from 'react';
import {
  BottleJarIcon,
  FoodTrayIcon,
  HmrContainerIcon,
  KraftBowlIcon,
  LunchBoxIcon,
  SushiTrayIcon,
} from './containers';
import {
  ClearCupIcon,
  ClearCupLidIcon,
  CoffeeAccessoryIcon,
  CoffeeCupIcon,
  CoffeeCupLidIcon,
  DrinkCupIcon,
  PortionCupIcon,
  ShakerIcon,
  SoupCupIcon,
  SoupCupLidIcon,
} from './cups';
import { SealingEquipmentIcon } from './equipment';
import type { CategoryIconProps } from './icon-base';
import { BakeryBagIcon, CarryBagIcon, WrapIcon, WrappingPaperIcon } from './paper-and-bags';
import {
  CutleryIcon,
  ForkKnifeIcon,
  NapkinIcon,
  OtherTablewareIcon,
  SpoonIcon,
  StirrerIcon,
  StrawIcon,
} from './tableware';

export type CategoryIconComponent = ComponentType<CategoryIconProps>;

/**
 * Category slug → icon.
 *
 * Keyed on the ENGLISH slug, which is stable in a way the Arabic one is not for
 * this purpose: `slug_en` is the seed's upsert key and the identifier used in
 * docs/catalog.json, so it is the closest thing the taxonomy has to a permanent
 * id that a human can read. A tile resolves its icon by looking up the slug it
 * already has, in either locale — see `categoryIcon`.
 *
 * Every one of the 28 categories is listed. A missing entry is not a crash but
 * it IS a silent downgrade to the fallback, so the styleguide renders the whole
 * set and `CATEGORY_ICON_SLUGS` exists to assert coverage.
 */
export const CATEGORY_ICONS: Record<string, CategoryIconComponent> = {
  // --- top level ---------------------------------------------------------
  'coffee-cups': CoffeeCupIcon,
  'coffee-cup-lids': CoffeeCupLidIcon,
  'coffee-accessories': CoffeeAccessoryIcon,
  'soup-cups': SoupCupIcon,
  'soup-cup-lids': SoupCupLidIcon,
  'kraft-bowls': KraftBowlIcon,
  shakers: ShakerIcon,
  'carry-bags': CarryBagIcon,
  'lunch-boxes': LunchBoxIcon,
  'sushi-trays': SushiTrayIcon,
  'wrapping-paper': WrappingPaperIcon,
  'food-trays': FoodTrayIcon,
  cutlery: CutleryIcon,
  'hmr-containers': HmrContainerIcon,
  'clear-cups': ClearCupIcon,
  'clear-cup-lids': ClearCupLidIcon,
  'bottles-jars': BottleJarIcon,
  equipment: SealingEquipmentIcon,

  // --- children ----------------------------------------------------------
  spoons: SpoonIcon,
  'forks-and-knives': ForkKnifeIcon,
  straws: StrawIcon,
  napkins: NapkinIcon,
  stirrers: StirrerIcon,
  'other-tableware': OtherTablewareIcon,
  'drink-cups': DrinkCupIcon,
  'portion-cups': PortionCupIcon,
  wraps: WrapIcon,
  'bakery-and-burger-bags': BakeryBagIcon,
};

/**
 * Arabic slug → English slug.
 *
 * A category tile renders in the reader's locale and therefore holds the
 * Arabic slug on an Arabic page. Rather than duplicate the registry per locale
 * — two maps that can disagree — the Arabic slug is translated to the English
 * one first. Kept beside the registry so adding a category means editing one
 * file, and derived from the same docs/catalog.json the seed reads.
 */
const AR_TO_EN_SLUG: Record<string, string> = {
  'اكواب-قهوة-ورقية': 'coffee-cups',
  'اغطية-اكواب-القهوة': 'coffee-cup-lids',
  'مستلزمات-القهوة': 'coffee-accessories',
  'اكواب-الشوربة': 'soup-cups',
  'اغطية-اكواب-الشوربة': 'soup-cup-lids',
  'اوعية-كرافت': 'kraft-bowls',
  'علب-الشيكر': 'shakers',
  'اكياس-التوصيل': 'carry-bags',
  'علب-الوجبات': 'lunch-boxes',
  'صواني-السوشي': 'sushi-trays',
  'ورق-التغليف': 'wrapping-paper',
  'صواني-الطعام': 'food-trays',
  'ادوات-المائدة': 'cutlery',
  'علب-الوجبات-الجاهزة': 'hmr-containers',
  'اكواب-شفافة': 'clear-cups',
  'اغطية-الاكواب-الشفافة': 'clear-cup-lids',
  'زجاجات-وعبوات': 'bottles-jars',
  'معدات-التغليف': 'equipment',
  ملاعق: 'spoons',
  'شوك-وسكاكين': 'forks-and-knives',
  شفاطات: 'straws',
  مناديل: 'napkins',
  'محركات-المشروبات': 'stirrers',
  'ادوات-مائدة-اخرى': 'other-tableware',
  'اكواب-المشروبات': 'drink-cups',
  'اكواب-الصلصات': 'portion-cups',
  'اوراق-التغليف': 'wraps',
  'اكياس-المخبوزات-والبرغر': 'bakery-and-burger-bags',
};

/** Every slug the registry covers — the styleguide and its test iterate this. */
export const CATEGORY_ICON_SLUGS = Object.keys(CATEGORY_ICONS);

/**
 * Resolves a category's icon from either locale's slug, falling back to the
 * parent's icon and then to a generic box.
 *
 * The fallback ladder matters more than it looks. A new subcategory added to
 * catalog.json before anyone draws its icon should inherit its parent's — a
 * "Spoons" tile showing the cutlery icon is a reasonable stand-in, whereas a
 * generic box next to eight drawn icons looks like a bug. Only a category with
 * no parent and no entry gets the box.
 */
export function categoryIcon(
  slug: string,
  options: { parentSlug?: string | null } = {},
): CategoryIconComponent {
  const direct = resolve(slug);
  if (direct) return direct;

  const inherited = options.parentSlug ? resolve(options.parentSlug) : undefined;
  if (inherited) return inherited;

  return LunchBoxIcon;
}

function resolve(slug: string): CategoryIconComponent | undefined {
  return CATEGORY_ICONS[slug] ?? CATEGORY_ICONS[AR_TO_EN_SLUG[slug] ?? ''];
}
