import test from "node:test";
import assert from "node:assert/strict";
import {parseListings,priceRow,validUrl,money} from "../lib/listings.mjs";
test("extract and deduplicate product prices",()=>{
 const product={"@type":"Product",name:"Oraimo Power Bank",url:"/nairobi/other/oraimo-abc123.html",offers:{price:"2,000",priceCurrency:"KES"}};
 const rows=parseListings('<script type="application/ld+json">'+JSON.stringify({"@graph":[product,product]})+'</script>',"https://jiji.co.ke");
 assert.equal(rows.length,1);assert.equal(rows[0].asking_price_kes,2000);
});
test("costs and markup produce expected profit",()=>{
 const row=priceRow({asking_price_kes:20000},10,300);
 assert.equal(row.selling_price_kes,22330);assert.equal(row.estimated_profit_kes,2030);
});
test("reject offsite URLs and non-price text",()=>{
 assert.equal(validUrl("https://jiji.co.ke.evil.example/"),false);
 assert.equal(validUrl("https://jiji.co.ke@evil.example/"),false);
 assert.equal(money("Contact for price"),null);
});
test("foreign currency products are excluded",()=>{
 assert.deepEqual(parseListings('<script type="application/ld+json">{"@type":"Product","name":"Phone","url":"/phone.html","offers":{"price":100,"priceCurrency":"USD"}}</script>',"https://jiji.co.ke"),[]);
});
