// Parses one Dot Property search-results page into listing rows.
//
// Each result is an <article class="listing-snippet" data-uuid="…">. Inside:
//   • a title like "1 Bedroom Condo for rent in The Residences at Greenbelt, San Lorenzo, Metro Manila near MRT-3 Ayala"
//   • the price ("₱ 90,000" plus "/ month" for rentals)
//   • a facts list with icons: bed (bedrooms), bathtub, resize (floor area "80 m²"), home (kind)
//   • a description snippet
// Developer "project" cards (price "From ₱…", size ranges "22-27 m²") describe many
// units at once and are skipped.
import { load } from 'cheerio';

export type Offer = 'rent' | 'sale';
export type Kind = 'condo' | 'house' | 'apartment' | 'townhouse' | 'room' | 'other';

export type Listing = {
  source_id: string;
  url: string;
  offer: Offer;
  kind: Kind;
  city: string;
  area: string | null;
  building: string | null;
  title: string;
  bedrooms: number | null;
  bathrooms: number | null;
  floor_sqm: number | null;
  price_php: number;
  furnishing: 'furnished' | 'semi' | 'bare' | null;
};

export type ParsedPage = {
  listings: Listing[];
  skipped: { id: string; reason: string }[];
  total: number | null;
  hasNext: boolean;
};

const TITLE = /^(?:(\d+)\s+Bedroom|Studio)?\s*([A-Za-z ]+?)\s+for\s+(?:Sale or Rent|rent|sale)\s+in\s+(.+?)(?:\s+near\s+.+)?$/i;

const KINDS: Record<string, Kind> = {
  condo: 'condo', condominium: 'condo',
  house: 'house', 'house and lot': 'house', villa: 'house',
  apartment: 'apartment', flat: 'apartment',
  townhouse: 'townhouse', 'town house': 'townhouse',
  room: 'room', bedspace: 'room', dormitory: 'room',
};

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "₱ 1,250,000" → 1250000; null for anything that isn't a single amount. */
export function parsePrice(text: string): number | null {
  const t = squash(text);
  if (/from|request|negotiable/i.test(t)) return null;
  const m = t.match(/₱\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** "80 m2" → 80, "1,200 m2" → 1200, ranges like "22-27 m2" → null. */
export function parseArea(text: string): number | null {
  const t = squash(text);
  if (/\d\s*-\s*\d/.test(t)) return null;
  const m = t.match(/([\d,]+(?:\.\d+)?)\s*m/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCount(text: string): number | null {
  const t = squash(text);
  if (/studio/i.test(t)) return 0;
  if (/-/.test(t)) return null;
  const n = Number(t.replace(/[^\d]/g, ''));
  return t && Number.isFinite(n) ? n : null;
}

/** The value if it's within [lo, hi], else null (agents' typos: 41 bathrooms). */
const inRange = (n: number | null, lo: number, hi: number) => (n != null && n >= lo && n <= hi ? n : null);

export function kindOf(word: string): Kind {
  return KINDS[squash(word).toLowerCase()] ?? 'other';
}

/** "Building, Area, Region" → { building, area }; "Area, Region" → { area }. */
export function splitPlace(place: string): { building: string | null; area: string | null } {
  const parts = place.split(',').map(squash).filter(Boolean);
  if (parts.length >= 3) return { building: parts[0], area: parts[parts.length - 2] };
  if (parts.length === 2) return { building: null, area: parts[0] };
  return { building: null, area: parts[0] ?? null };
}

export function furnishingOf(text: string): Listing['furnishing'] {
  if (/semi[\s-]?furnished/i.test(text)) return 'semi';
  if (/un[\s-]?furnished|bare\s+unit/i.test(text)) return 'bare';
  if (/(fully\s+)?furnished/i.test(text)) return 'furnished';
  return null;
}

export function parsePage(html: string, city: string, offer: Offer): ParsedPage {
  const $ = load(html);
  const listings: Listing[] = [];
  const skipped: ParsedPage['skipped'] = [];

  $('article.listing-snippet').each((_, el) => {
    const card = $(el);
    const id = card.attr('data-uuid') ?? '';
    const skip = (reason: string): void => {
      skipped.push({ id, reason });
    };
    if (!id) return skip('no id');

    const titleEl = card.find('div[title].text-2xl').first();
    const title = squash(titleEl.attr('title') ?? titleEl.text());
    const t = title.match(TITLE);
    if (!t) return skip('project or unrecognised title');

    const priceBlock = card.find('.text-secondary-base.font-bold').first();
    const price = parsePrice(priceBlock.text());
    if (price == null) return skip('no single price');
    const perMonth = /month/i.test(squash(priceBlock.parent().text()));
    const cardOffer: Offer = perMonth ? 'rent' : 'sale';
    // "for Sale or Rent" cards show the rent on rent pages and the price on sale pages.
    if (cardOffer !== offer) return skip(`price is for ${cardOffer}`);
    // Agents sometimes type a sale price as monthly rent (₱9.6M/month). Same bounds as the database's check.
    if (offer === 'rent' ? price < 1000 || price > 5_000_000 : price < 200_000 || price > 2_000_000_000) {
      return skip('implausible price');
    }

    const facts: Record<string, string> = {};
    card.find('ul li').each((__, li) => {
      const icon = $(li).find('img').attr('src') ?? '';
      const key = icon.match(/\/(bed|bathtub|resize|home)-/)?.[1];
      if (key && !(key in facts)) facts[key] = squash($(li).text());
    });

    const url = card.find('a[href*="/ads/"]').first().attr('href') ?? '';
    if (!url) return skip('no link');

    const sqm = facts.resize != null ? parseArea(facts.resize) : null;
    if (facts.resize && /\d\s*-\s*\d/.test(facts.resize)) return skip('size range (project)');

    const titleBeds = t[1] != null ? Number(t[1]) : /^studio/i.test(title) ? 0 : null;
    const beds = facts.bed != null ? parseCount(facts.bed) : titleBeds;
    const { building, area } = splitPlace(t[3]);
    const description = squash(card.find('.line-clamp-4').text());

    listings.push({
      source_id: id,
      url: url.split('?')[0],
      offer,
      kind: kindOf(facts.home ?? t[2]),
      city,
      area,
      building,
      title,
      bedrooms: inRange(beds ?? titleBeds, 0, 20),
      bathrooms: inRange(facts.bathtub != null ? parseCount(facts.bathtub) : null, 0, 20),
      floor_sqm: inRange(sqm, 1, 99_999),
      price_php: price,
      furnishing: furnishingOf(`${title} ${description}`),
    });
  });

  const totalText = $('small').filter((_, el) => /results found/i.test($(el).text())).first().text();
  const total = totalText ? Number(totalText.replace(/[^\d]/g, '')) : null;
  const hasNext = $('a[href*="page="]').length > 0 && listings.length + skipped.length > 0;

  return { listings, skipped, total, hasNext };
}
