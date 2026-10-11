"""Collect Jiji Kenya product listings and calculate resale prices."""
import argparse
import csv
import json
import re
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

BASE = "https://jiji.co.ke"
AGENT = "NairobiTechFinder/1.0"
FIELDS = ["title", "asking_price_kes", "location", "condition", "listing_url",
          "extra_cost_kes", "selling_price_kes", "estimated_profit_kes",
          "observed_at_utc", "availability"]

def money(value):
    if isinstance(value, dict):
        value = value.get("value", value.get("amount"))
    match = re.fullmatch(r"(?:KSh\s*|KES\s*)?([\d,]+(?:\.\d+)?)", str(value).strip(), re.I)
    if not match:
        return None
    try:
        result = Decimal(match.group(1).replace(",", ""))
        return result if result.is_finite() and result > 0 else None
    except InvalidOperation:
        return None

def valid_url(url):
    p = urlparse(url)
    return p.scheme == "https" and p.hostname == "jiji.co.ke" and not p.username and not p.password and p.port in (None, 443)

def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)

def parse_html(html, source):
    soup = BeautifulSoup(html, "html.parser")
    results = {}
    def add(title, price, url, location="", condition=""):
        price = money(price)
        if not isinstance(title, str) or not title.strip() or price is None or not isinstance(url, str):
            return
        url = urljoin(BASE, url)
        if not valid_url(url):
            return
        url = url.split("?")[0].split("#")[0]
        results[url] = dict(title=title.strip(), asking_price_kes=price,
                            location=str(location), condition=str(condition), listing_url=url)
    # Structured data is preferable to layout-dependent HTML selectors.
    for script in soup.select('script[type="application/ld+json"], script#__NEXT_DATA__'):
        try:
            data = json.loads(script.string or script.get_text())
        except (ValueError, TypeError):
            continue
        for item in walk(data):
            offers = item.get("offers", {})
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            if not isinstance(offers, dict):
                offers = {}
            title = item.get("name") or item.get("title")
            price = offers.get("price", item.get("price"))
            currency = offers.get("priceCurrency", item.get("currency", "KES"))
            link = item.get("url") or item.get("link") or offers.get("url")
            if not link and item.get("@type") == "Product":
                link = source
            location = item.get("location", "")
            if isinstance(location, dict):
                location = location.get("name", location.get("addressLocality", ""))
            if currency in ("KES", "KSh"):
                add(title, price, link, location, item.get("itemCondition", ""))
    # Card fallback for rendered/saved Jiji results. Page layouts may change.
    for card in soup.select('.b-list-advert__item, .b-list-advert-base, [data-testid="advert-card"]'):
        link = card.select_one('a[href*=".html"]')
        price = card.select_one('.b-list-advert__price, .b-list-advert-base__price, [data-testid="price"]')
        title = card.select_one('.b-list-advert__title, .b-list-advert-base__title, [data-testid="title"]')
        location = card.select_one('.b-list-advert__region, .b-list-advert-base__region')
        if link and price:
            text = price.get_text(" ", strip=True)
            match = re.search(r"(?:KSh|KES)\s*([\d,]+(?:\.\d+)?)", text, re.I)
            if match:
                add(title.get_text(" ", strip=True) if title else link.get("title", ""),
                    match.group(1), link["href"], location.get_text(" ", strip=True) if location else "")
    return list(results.values())

def price_row(row, markup, costs):
    total = row["asking_price_kes"] + costs
    sale = (total * (Decimal(1) + markup / 100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return dict(row, extra_cost_kes=costs, selling_price_kes=sale,
                estimated_profit_kes=sale-total,
                observed_at_utc=datetime.now(timezone.utc).isoformat(),
                availability="Unconfirmed — contact supplier")

class Collector:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = AGENT
        self.robots = None
        self.last_request = 0
        self.delay = 5

    def get(self, url):
        if not valid_url(url):
            raise ValueError("Use only HTTPS Jiji Kenya URLs")
        time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        response = self.session.get(url, timeout=30, allow_redirects=False)
        # No automatic retries or attempts to work around access blocks.
        response.raise_for_status()
        if 300 <= response.status_code < 400:
            raise ValueError("Redirect encountered; use the final public Jiji URL")
        if len(response.content) > 8_000_000:
            raise ValueError("Page exceeds size limit")
        return response.text

    def collect(self, url):
        if self.robots is None:
            self.robots = RobotFileParser()
            self.robots.parse(self.get(BASE + "/robots.txt").splitlines())
            self.delay = max(5, self.robots.crawl_delay(AGENT) or 0)
        if not self.robots.can_fetch(AGENT, url):
            raise ValueError("URL is disallowed by robots.txt")
        return parse_html(self.get(url), url)

def safe_cell(value):
    # Prevent listing text from being interpreted as an Excel formula.
    text = str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text

def main():
    parser = argparse.ArgumentParser(description="Jiji tech sourcing → resale price CSV")
    parser.add_argument("urls", nargs="*", help="Nairobi search URLs or authorized listing URLs")
    parser.add_argument("--saved-html", nargs="*", default=[], help="Parse saved pages offline")
    parser.add_argument("--markup", type=Decimal, default=Decimal("10"), help="Percent added to total cost")
    parser.add_argument("--cost", type=Decimal, default=Decimal("0"), help="Additional cost per item, KSh")
    parser.add_argument("--keywords", default="", help="Comma-separated title terms; empty includes all")
    parser.add_argument("--output", default="results/products.csv")
    args = parser.parse_args()
    if not args.urls and not args.saved_html:
        parser.error("Supply a Jiji URL or --saved-html file")
    if len(args.urls) > 20:
        parser.error("At most 20 URLs per run")
    if any(not x.is_finite() or x < 0 for x in (args.markup, args.cost)):
        parser.error("Markup and cost must be finite and non-negative")
    for url in args.urls:
        if not valid_url(url):
            parser.error("Only https://jiji.co.ke URLs are supported")
    terms = [term.strip().lower() for term in args.keywords.split(",") if term.strip()]
    collector = Collector()
    rows, errors = {}, []
    for source in [*args.urls, *args.saved_html]:
        try:
            found = collector.collect(source) if source in args.urls else parse_html(Path(source).read_text(encoding="utf-8"), BASE)
            if not found:
                raise ValueError("No listings extracted. The page may require JavaScript or an updated parser.")
            for row in found:
                if not terms or any(term in row["title"].lower() for term in terms):
                    rows[row["listing_url"]] = price_row(row, args.markup, args.cost)
            print(f"Extracted {len(found)} listings from {source}")
        except (requests.RequestException, ValueError, OSError) as exc:
            errors.append(source)
            print(f"Failed: {source}: {exc}")
            if isinstance(exc, requests.HTTPError) and exc.response is not None and exc.response.status_code in (401, 403, 429):
                print("Access blocked or rate limited; stopping online collection.")
                break
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows({k: safe_cell(v) for k, v in row.items()} for row in rows.values())
    print(f"Saved {len(rows)} unique products to {output}. Failed sources: {len(errors)}.")
    return 1 if errors or not rows else 0

if __name__ == "__main__":
    raise SystemExit(main())
