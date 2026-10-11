# Nairobi Jiji Tech Reseller

A first version of a product sourcing tool for phones, laptops, Oraimo accessories and niche tech. Source stock from suppliers after receiving an order; use this tool to compare asking prices and calculate your selling prices.

## Setup

Python 3.10 or newer:

```powershell
python -m pip install -r requirements.txt
python scraper.py "PASTE_ACTUAL_JIJI_NAIROBI_SEARCH_OR_LISTING_URL" --markup 10 --cost 300
```

Replace the URL placeholder with an actual Jiji Kenya search URL filtered to Nairobi or a supplier listing URL. Multiple URLs are supported, up to 20 per run. The script does not independently filter location; select Nairobi on Jiji before copying your search URL.

Optional title filter:

```powershell
python scraper.py "PASTE_ACTUAL_JIJI_URL" --keywords "laptop,iphone,samsung,oraimo,power bank" --markup 10
```

CSV output is saved to `results/products.csv` and opens in Excel. It includes titles, asking prices, available location/condition, original listing links, selling prices, estimated profit and observation timestamps. Duplicate listing URLs are removed.

Selling price = (asking price + extra cost) × (1 + markup / 100), rounded to a whole shilling. The default 10% markup is editable, not a market recommendation. Asking prices are not confirmed supplier quotes or completed sale prices. Account for delivery, fees, returns and other costs in your pricing.

## Collection limits

This version reads public page structured data, with an HTML card fallback. Live Jiji extraction is **not yet verified**: local execution was unavailable during creation. If Jiji returns a JavaScript-only page or changes its layout, an adapter may be needed. No results are invented.

The collector respects robots.txt, waits at least five seconds between requests and stops on authentication blocks or rate limits. No bypassing CAPTCHA or login. You can also parse a saved HTML page:

```powershell
python scraper.py --saved-html listing.html --markup 10
```

Only use suppliers/listings you are authorized to reuse. This tool collects product data, not seller phone numbers, and does not automatically post adverts. Confirm stock, specifications, warranty and fulfilment time with the supplier before accepting a customer order.

## Seller profile

Your Jiji profile remains pending your business name and account setup. Register at https://jiji.co.ke and enter passwords/verification codes directly there.

Profile copy to adapt:
> Phones, laptops, Oraimo accessories and selected tech products in Nairobi. Products are sourced on order. Contact us to confirm current availability, specifications, price and delivery time before payment.

## Checks

```powershell
python -m unittest discover -s tests -v
```

The tests cover structured-data extraction, deduplication, pricing and CSV formula protection. They do not verify current live Jiji page layouts.

This repository was repurposed at the owner's request. Earlier voice-cloning files remain in Git history.

## Deploy the web app on Netlify

[Deploy to Netlify](https://app.netlify.com/start/deploy?repository=https://github.com/jibrilmohamod/Real-Time-Voice-Cloning&branch=master)

Choose the **gepdsomaliland** team. This imports the public repository and uses `netlify.toml` to run the Node tests and publish `public/` with the collection function. `.netlify/` is ignored to keep local linkage files out of Git.

The web app supports category selection, supplier/search URLs, markup and extra costs, and CSV export. It uses a JavaScript collector because Netlify functions do not run the Python CLI. One page per request; no automatic reposting. Live Jiji collection has not yet been verified. An access block or unsupported layout is shown as an error, not fake results.
