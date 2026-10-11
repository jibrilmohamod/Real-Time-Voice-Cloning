import robotsParser from "robots-parser";
import {validUrl,parseListings,priceRow} from "../../lib/listings.mjs";

const AGENT = "NairobiTechFinder";
const headers = {"cache-control":"no-store","content-type":"application/json"};
const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function get(url) {
  const response = await fetch(url,{headers:{"user-agent":AGENT+"/1.0"},redirect:"manual",signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error("Jiji returned HTTP "+response.status+". Collection stopped.");
  const text = await response.text();
  if (text.length>8000000) throw new Error("Page too large");
  return text;
}
export default async request => {
  if(request.method!=="GET") return reply({error:"Use GET"},405);
  const params=new URL(request.url).searchParams;
  const url=params.get("url");
  const markup=Number(params.get("markup") ?? 10), cost=Number(params.get("cost") ?? 0);
  if(!validUrl(url)) return reply({error:"Enter a public https://jiji.co.ke listing or search URL."},400);
  if(!Number.isFinite(markup)||markup<0||markup>1000||!Number.isFinite(cost)||cost<0||cost>10000000)
    return reply({error:"Enter a valid non-negative markup and cost."},400);
  try {
    const robotsText=await get("https://jiji.co.ke/robots.txt");
    const robots=robotsParser("https://jiji.co.ke/robots.txt",robotsText);
    if(robots.isAllowed(url,AGENT)!==true) return reply({error:"Collection is not allowed for this URL by robots.txt."},403);
    const delay=Math.max(5,Number(robots.getCrawlDelay(AGENT))||0);
    if(delay>20) return reply({error:"This page requires a longer crawl delay. Use the desktop scraper."},422);
    await sleep(delay*1000);
    const html=await get(url);
    let products=parseListings(html,url);
    const keywords=(params.get("keywords")||"").toLowerCase().split(",").map(s=>s.trim()).filter(Boolean);
    if(keywords.length) products=products.filter(p=>keywords.some(k=>p.title.toLowerCase().includes(k)));
    if(!products.length) return reply({error:"No matching products extracted. Jiji may require JavaScript, the page layout may have changed, or your filter matched nothing.",products:[]},422);
    return reply({products:products.slice(0,100).map(p=>priceRow(p,markup,cost)),source:url});
  } catch(error) {
    console.error("Collection failed:",error.message);
    return reply({error:error.message||"Collection failed"},502);
  }
};
export const config={rateLimit:{windowLimit:6,windowSize:60,aggregateBy:"ip"}};
