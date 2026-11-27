import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

for(const disease of ["mm","aml","fl","dlbcl"]){
  test(disease+" index has unique official paper references",()=>{
    const file=new URL("../public/indexes/"+disease+"-2026.json",import.meta.url);
    const index=JSON.parse(readFileSync(file,"utf8"));
    assert.equal(index.year,2026);
    assert.ok(index.queries.length);
    assert.ok(index.records.length>0);
    const ids=new Set();
    for(const row of index.records){
      assert.ok(Number.isSafeInteger(row.pid)&&row.pid>0);
      assert.ok(!ids.has(row.pid));
      assert.ok(row.title.trim());
      assert.ok(["oral","poster","other"].includes(row.format));
      assert.equal(typeof row.titleMatch,"boolean");
      ids.add(row.pid);
    }
    assert.ok(index.records.some(row=>row.titleMatch));
  });
}

test("keyword filters and pagination stay on the requested disease page", async ()=>{
  const {runInNewContext}=await import("node:vm");
  const script=readFileSync(new URL("../public/abstract-index.js",import.meta.url),"utf8");
  const data=JSON.parse(readFileSync(new URL("../public/indexes/fl-2026.json",import.meta.url),"utf8"));
  const nodes=new Map();
  const element=()=>({children:[],value:"",append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(type,fn){this[type]=fn;},scrollIntoView(){}});
  function get(id){
    if(!nodes.has(id))nodes.set(id,element());
    return nodes.get(id);
  }
  get("match").value=get("format").value="all";
  await runInNewContext("(async()=>{"+script+"})()",{
    URLSearchParams,
    location:{search:"?disease=fl"},
    document:{getElementById:get,createElement:element},
    fetch:async url=>{
      assert.equal(url,"/indexes/fl-2026.json");
      return {ok:true,json:async()=>data};
    },
  });
  assert.equal(get("tabs").children.length,4);
  assert.equal(get("records").children.length,Math.min(30,data.records.length));
  if(data.records.length>30){
    get("next").click();
    assert.match(get("page").textContent,/^2 /);
  }
  get("match").value="title";
  get("match").change();
  assert.match(get("count").textContent,new RegExp("^"+data.records.filter(row=>row.titleMatch).length+" /"));
  get("q").value=String(data.records.find(row=>row.titleMatch).pid);
  get("q").input();
  assert.match(get("count").textContent,/^1 /);
});
