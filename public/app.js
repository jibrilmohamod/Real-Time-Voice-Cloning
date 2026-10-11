const $=id=>document.getElementById(id);
let products=[];
const kes=n=>new Intl.NumberFormat("en-KE",{style:"currency",currency:"KES",maximumFractionDigits:0}).format(n);
$("preset").addEventListener("change",()=>{$("url").value=$("preset").value;});
$("form").addEventListener("submit",async event=>{
  event.preventDefault();
  $("collect").disabled=true;$("download").disabled=true;$("status").className="";
  $("status").textContent="Collecting current listings…";$("rows").replaceChildren();$("count").textContent="Collecting…";products=[];
  const query=new URLSearchParams({url:$("url").value,markup:$("markup").value,cost:$("cost").value,keywords:$("keywords").value});
  try{
    const response=await fetch("/.netlify/functions/collect?"+query,{signal:AbortSignal.timeout(55000)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Collection failed");
    products=data.products;
    for(const product of products){
      const row=document.createElement("tr");
      for(const value of [product.title,kes(product.asking_price_kes),kes(product.selling_price_kes),kes(product.estimated_profit_kes),product.location||"Not provided"]){
        const cell=document.createElement("td");cell.textContent=value;row.append(cell);
      }
      const cell=document.createElement("td"),link=document.createElement("a");
      link.href=product.listing_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="View on Jiji";cell.append(link);row.append(cell);$("rows").append(row);
    }
    $("count").textContent=products.length+" listings";
    $("status").textContent="Collected "+products.length+" listings. Supplier availability still needs confirmation.";
    $("download").disabled=!products.length;
  }catch(error){$("status").className="error";$("status").textContent=error.message;$("count").textContent="Collection unsuccessful";}
  finally{$("collect").disabled=false;}
});
function cell(value){let text=String(value??"");if(/^\s*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
$("download").addEventListener("click",()=>{
 const fields=["title","asking_price_kes","selling_price_kes","estimated_profit_kes","extra_cost_kes","location","listing_url","observed_at_utc","availability"];
 const csv="\uFEFF"+[fields.map(cell).join(","),...products.map(p=>fields.map(f=>cell(p[f])).join(","))].join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download="nairobi-tech-products.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
