import unittest
from decimal import Decimal
from scraper import parse_html, price_row, safe_cell, money, valid_url

class FinderTests(unittest.TestCase):
    def test_product_and_duplicate(self):
        html = '<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Oraimo Power Bank","url":"/nairobi/other/oraimo-test.html","offers":{"price":"2,000","priceCurrency":"KES"}},{"@type":"Product","name":"Oraimo Power Bank","url":"/nairobi/other/oraimo-test.html","offers":{"price":2000,"priceCurrency":"KES"}}]}</script>'
        rows = parse_html(html, "https://jiji.co.ke")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["asking_price_kes"], Decimal("2000"))
        self.assertEqual(rows[0]["listing_url"], "https://jiji.co.ke/nairobi/other/oraimo-test.html")

    def test_cost_and_markup(self):
        row = price_row({"asking_price_kes": Decimal("20000")}, Decimal("10"), Decimal("300"))
        self.assertEqual(row["selling_price_kes"], Decimal("22330"))
        self.assertEqual(row["estimated_profit_kes"], Decimal("2030"))

    def test_reject_missing_or_foreign_price(self):
        html = '<script type="application/ld+json">{"@type":"Product","name":"Phone","url":"/phone.html","offers":{"price":100,"priceCurrency":"USD"}}</script>'
        self.assertEqual(parse_html(html, "https://jiji.co.ke"), [])
        self.assertIsNone(money("Contact for price"))
        self.assertFalse(valid_url("https://jiji.co.ke.evil.example/item"))

    def test_csv_formula_protection(self):
        self.assertEqual(safe_cell("=HYPERLINK(1)"), "'=HYPERLINK(1)")
        self.assertEqual(safe_cell(2000), "2000")

if __name__ == "__main__":
    unittest.main()
