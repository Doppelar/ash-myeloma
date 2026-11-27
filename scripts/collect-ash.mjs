import {writeFile, mkdir, readFile} from "node:fs/promises";

const origin="https://onlineprogram.hematology.org";
const formUrl=origin+"/default.aspx?st=keyword";
const searches={
  mm:["multiple myeloma","plasma cell myeloma","smoldering myeloma","plasma cell leukemia","plasma cell dyscrasias"],
  aml:["acute myeloid leukemia","AML","acute promyelocytic leukemia","acute myelogenous leukemia"],
  fl:["follicular lymphoma"],
  dlbcl:["diffuse large B cell lymphoma","DLBCL","primary mediastinal large B cell lymphoma"],
};
const terms={
  mm:/\b(?:myeloma|plasma cell leukemia|plasma cell dyscrasias?)\b/i,
  aml:/\b(?:AML|acute myelo(?:id|genous) leuk[ae]mia|acute promyelocytic leuk[ae]mia)\b/i,
  fl:/\bfollicular lymphomas?\b/i,
  dlbcl:/\b(?:DLBCL|diffuse large B[- ]cell lymphomas?|primary mediastinal large B[- ]cell lymphomas?)\b/i,
};
const requested=process.argv.slice(2);
const checkpoint=process.env.ASH_COLLECT_CHECKPOINT;
const asOf="2026-11-27";
const decoder=html=>html.replace(/<[^>]+>/g," ").replace(/&(#x[0-9a-f]+|#\d+|amp|nbsp|lt|gt|quot|apos|ndash|mdash|rsquo);/gi,(all,entity)=>{
  if(entity[0]==="#")return String.fromCodePoint(entity[1].toLowerCase()==="x"?parseInt(entity.slice(2),16):Number(entity.slice(1)));
  return {amp:"&",nbsp:" ",lt:"<",gt:">",quot:'"',apos:"'",ndash:"–",mdash:"—",rsquo:"’"}[entity.toLowerCase()]||all;
}).replace(/\s+/g," ").trim();
async function request(url,options){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
      if(response.status<400)return response;
      throw Error("HTTP "+response.status);
    }catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,900*(attempt+1)))}
  }
}
function cookies(response,jar){
  for(const value of response.headers.getSetCookie()){
    const pair=value.split(";")[0];
    jar.set(pair.split("=")[0],pair);
  }
  return [...jar.values()].join("; ");
}
async function searchOnce(term){
  const form=await request(formUrl);
  const jar=new Map();
  cookies(form,jar);
  const html=await form.text();
  const params=new URLSearchParams();
  for(const [,name,value] of html.matchAll(/<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g)) params.set(name,value);
  params.set("__EVENTTARGET","ctl00$ashcontent$btnSubmit");
  params.set("ctl00$ashcontent$tbKeyword",term);
  params.set("ctl00$ashcontent$ddlOptions","All");
  const submission=await request(formUrl,{method:"POST",body:params,headers:{cookie:[...jar.values()].join("; ")},redirect:"manual"});
  if(!submission.headers.has("location"))throw Error("Official search did not redirect for "+term);
  const header={cookie:cookies(submission,jar)};
  const url=new URL(submission.headers.get("location"),origin);
  const first=await (await request(url,{headers:header})).text();
  const paginate=page=>page.match(/id="ashcontent_lblPageInfo">Page\s+(\d+)\s+of\s+(\d+)/i)?.slice(1).map(Number);
  const pageCount=paginate(first)?.[1]??1;
  const pages=[first];
  if(!first.includes("keyword-result")&&!/no results|no matches/i.test(first))throw Error("Unexpected results for "+term);
  for(let start=2;start<=pageCount;start+=3){
    const group=Array.from({length:Math.min(3,pageCount-start+1)},(_,index)=>start+index);
    pages.push(...await Promise.all(group.map(async page=>{
      for(let attempt=0;attempt<5;attempt++){
        const result=await (await request(origin+"/results-keyword.aspx?page="+page+"&size=50",{headers:header,cache:"no-store"})).text();
        const info=paginate(result);
        if(info?.[0]===page&&info[1]===pageCount)return result;
        await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
      }
      throw Error("Missing page "+page+" for "+term);
    })));
  }
  const records=[];
  for(const page of pages){
    for(const [article] of page.matchAll(/<article class="keyword-result">[\s\S]*?<\/article>/g)){
      const match=article.match(/href=['"]paper-details\.aspx\?pid=(\d+)['"]>([\s\S]*?)<\/a>/);
      if(!match)continue;
      const date=article.match(/December\s+(\d+),\s+2026/i);
      records.push({pid:Number(match[1]),title:decoder(match[2]),day:date?Number(date[1]):null,format:/Poster Abstract Session/i.test(article)?"poster":/Oral Abstract Session|Plenary/i.test(article)?"oral":"other"});
    }
  }
  console.log(term,pageCount+" pages",records.length+" abstracts");
  return records;
}
async function search(term){
  const cache=checkpoint?checkpoint+"/"+encodeURIComponent(term)+".json":null;
  if(cache){
    try{return JSON.parse(await readFile(cache,"utf8"));}catch{}
  }
  for(let attempt=0;attempt<5;attempt++){
    try{
      const results=await searchOnce(term);
      if(cache)await writeFile(cache,JSON.stringify(results));
      return results;
    }
    catch(error){
      if(attempt===4)throw error;
      console.warn("Retrying",term,error.message);
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
  }
}
await mkdir("public/indexes",{recursive:true});
for(const key of requested.length?requested:Object.keys(searches)){
  if(!Object.hasOwn(searches,key))throw Error("Unknown disease: "+key);
  const records=new Map();
  for(const term of searches[key]){
    for(const record of await search(term))records.set(record.pid,{...record,titleMatch:terms[key].test(record.title)});
  }
  const ordered=[...records.values()].sort((a,b)=>Number(b.titleMatch)-Number(a.titleMatch)||(a.day??99)-(b.day??99)||a.pid-b.pid);
  await writeFile("public/indexes/"+key+"-2026.json",JSON.stringify({year:2026,asOf,queries:searches[key],records:ordered})+"\n");
  console.log(key,ordered.length,"unique abstracts");
}
