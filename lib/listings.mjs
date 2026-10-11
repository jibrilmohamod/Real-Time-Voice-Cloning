import * as cheerio from "cheerio";

export function validUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "jiji.co.ke" &&
      !u.username && !u.password && (!u.port || u.port === "443");
  } catch { return false; }
}
export function money(value) {
  if (typeof value === "object" && value) value = value.value ?? value.amount;
  const match = String(value).trim().match(/^(?:KSh\s*|KES\s*)?([\d,]+(?:\.\d+)?)$/i);
  if (!match) return null;
  const n = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function* walk(value) {
  if (value && typeof value === "object") {
    if (!Array.isArray(value)) yield value;
    for (const child of Object.values(value)) yield* walk(child);
  }
}
export function parseListings(html, source) {
  const $ = cheerio.load(html);
  const rows = new Map();
  function add(title, amount, link, location = "") {
    const price = money(amount);
    if (typeof title !== "string" || !title.trim() || price === null || typeof link !== "string") return;
    let url;
    try { url = new URL(link, "https://jiji.co.ke"); } catch { return; }
    if (!validUrl(url.href)) return;
    url.search = ""; url.hash = "";
    rows.set(url.href, {title:title.trim(), asking_price_kes:price, listing_url:url.href, location:String(location)});
  }
  $('script[type="application/ld+json"], script#__NEXT_DATA__').each((_, script) => {
    let data;
    try { data = JSON.parse($(script).text()); } catch { return; }
    for (const obj of walk(data)) {
      let offer = obj.offers ?? {};
      if (Array.isArray(offer)) offer = offer[0] ?? {};
      const currency = offer.priceCurrency ?? obj.currency ?? "KES";
      if (!["KES","KSh"].includes(currency)) continue;
      const location = typeof obj.location === "object" ? obj.location?.name ?? obj.location?.addressLocality ?? "" : obj.location ?? "";
      add(obj.name ?? obj.title, offer.price ?? obj.price,
        obj.url ?? obj.link ?? offer.url ?? (obj["@type"] === "Product" ? source : null), location);
    }
  });
  $('.b-list-advert__item, .b-list-advert-base, [data-testid="advert-card"]').each((_, element) => {
    const card = $(element);
    const link = card.find('a[href*=".html"]').first();
    const title = card.find('[class*="__title"], [data-testid="title"]').first().text() || link.attr("title");
    const priceText = card.find('[class*="__price"], [data-testid="price"]').first().text();
    const match = priceText.match(/(?:KSh|KES)\s*([\d,]+(?:\.\d+)?)/i);
    if (match) add(title, match[1], link.attr("href"), card.find('[class*="__region"]').first().text());
  });
  // Semantic fallback: smallest listing-link ancestor containing one price.
  $('a[href*=".html"]').each((_, element) => {
    const link = $(element), href = link.attr("href");
    if (!href || !/-[A-Za-z0-9]+\.html(?:[?#]|$)/.test(href)) return;
    let card = link;
    for (let i=0;i<6 && card.length;i++,card=card.parent()) {
      const text = card.text().replace(/\s+/g," ").trim();
      const prices = [...text.matchAll(/(?:KSh|KES)\s*([\d,]+(?:\.\d+)?)/gi)];
      if (prices.length !== 1) continue;
      const title = card.find('[class*="title"], h2, h3').first().text().trim() || link.attr("title") || link.find("img").first().attr("alt");
      if (title) { add(title, prices[0][1], href); break; }
    }
  });
  return [...rows.values()];
}
export function priceRow(row, markup, cost) {
  const total = row.asking_price_kes + cost;
  const selling = Math.round(total * (1+markup/100));
  return {...row, extra_cost_kes:cost, selling_price_kes:selling,
    estimated_profit_kes:Math.round((selling-total)*100)/100,
    observed_at_utc:new Date().toISOString(), availability:"Confirm with supplier"};
}
