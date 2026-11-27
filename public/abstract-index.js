const diseases={
  mm:"多発性骨髄腫",
  aml:"急性骨髄性白血病（AML）",
  fl:"濾胞性リンパ腫（FL）",
  dlbcl:"びまん性大細胞型B細胞リンパ腫（DLBCL）",
};
const formats={oral:"口頭",poster:"ポスター",other:"その他"};
const topics=[
  [/CAR[- ]?T|ciltacabtagene|idecabtagene|\b(?:axi|liso|tisa|ide|cilta)-cel\b/i,"CAR-T細胞療法"],
  [/bispecific|teclistamab|talquetamab|elranatamab|mosunetuzumab|glofitamab|epcoritamab|linvoseltamab|odronextamab/i,"二重特異性抗体"],
  [/transplant|\b(?:ASCT|HSCT|HCT)\b/i,"造血幹細胞移植"],
  [/measurable residual|minimal residual|\bMRD\b/i,"微小残存病変"],
  [/real.world|registry|registries|retrospective/i,"実臨床・登録データ"],
  [/infection|toxicity|adverse|safety/i,"安全性・有害事象"],
  [/survival|prognos|outcome|mortality/i,"生存・予後"],
  [/genom|sequencing|mutation|transcriptom|molecular/i,"ゲノム・分子解析"],
];
const requested=new URLSearchParams(location.search).get("disease");
const disease=Object.hasOwn(diseases,requested)?requested:"mm";
const $=id=>document.getElementById(id);
const make=(tag,value,cls)=>{
  const item=document.createElement(tag);
  if(value)item.textContent=value;
  if(cls)item.className=cls;
  return item;
};
let records=[];
let japaneseAbstracts={};
const japaneseOnly=make("input");
japaneseOnly.type="checkbox";
if(disease==="mm"){
  const label=make("label");
  label.append(japaneseOnly," 抄録の全文訳あり");
  document.querySelector(".filters").append(label);
  document.querySelector(".hint").textContent="翻訳済みの演題は、日本語の演題名、要約、公式抄録の日本語訳を表示します。翻訳準備中の演題は公式サイトで確認できます。";
}
japaneseOnly.addEventListener("change",()=>{page=1;render();});
let page=1;
const pageSize=30;
$("heading").textContent=diseases[disease]+" 演題索引";
document.title="ASH 2026 "+diseases[disease]+" 演題索引";
for(const [key,label] of Object.entries(diseases)){
  const link=make("a",label);
  link.href="/abstracts.html?disease="+key;
  if(key===disease)link.setAttribute("aria-current","page");
  $("tabs").append(link);
}
function topicFor(title){
  return topics.find(([pattern])=>pattern.test(title))?.[1]??"研究・臨床報告";
}
function render(){
  const tokens=$("q").value.normalize("NFKC").toLowerCase().trim().split(/\s+/);
  const matches=records.filter(row=>{
    const japanese=japaneseAbstracts[row.pid];
    if(japaneseOnly.checked&&!japanese?.abstract?.length)return false;
    const searchable=[row.title,row.pid,topicFor(row.title),japanese?.title,japanese?.summary].join(" ").normalize("NFKC").toLowerCase();
    return ($("match").value==="all"||row.titleMatch)&&($("format").value==="all"||row.format===$("format").value)&&tokens.every(token=>searchable.includes(token));
  });
  const pages=Math.max(1,Math.ceil(matches.length/pageSize));
  page=Math.min(page,pages);
  $("count").textContent=matches.length+" / "+records.length+" 演題";
  $("records").replaceChildren();
  for(const row of matches.slice((page-1)*pageSize,page*pageSize)){
    const card=make("article",null,"record");
    const japanese=japaneseAbstracts[row.pid];
    const title=make("h2");
    title.lang=japanese?"ja":"en";
    const link=make("a",japanese?.title??row.title);
    link.href="https://onlineprogram.hematology.org/paper-details.aspx?pid="+row.pid;
    title.append(link);
    const meta=[formats[row.format],row.day?"12月"+row.day+"日（現地）":null,row.titleMatch?"演題名で一致":"公式検索で一致"].filter(Boolean).join(" · ");
    card.append(make("div",topicFor(row.title),"topic"),title,make("div",meta,"meta"));
    if(japanese){
      const source=make("a","ASH公式抄録");
      source.href=link.href;
      card.append(make("p",japanese.summary),source);
      if(japanese.abstract?.length){
        const full=make("details");
        full.append(make("summary","抄録の日本語全文"),...japanese.abstract.map(paragraph=>make("p",paragraph)));
        card.append(full);
      }
      const detail=make("details");
      detail.append(make("summary","研究の詳細"));
      if(japanese.details){
        const fields=make("dl");
        for(const [key,label] of Object.entries({participants:"対象",design:"方法",results:"結果",limitations:"限界"})){
          if(japanese.details[key])fields.append(make("dt",label),make("dd",japanese.details[key]));
        }
        detail.append(fields);
      }
      if(japanese.details)card.append(detail);
    }
    $("records").append(card);
  }
  if(!matches.length)$("records").append(make("p","条件に一致する演題はありません。"));
  $("page").textContent=page+" / "+pages+" ページ";
  $("prev").disabled=page===1;
  $("next").disabled=page===pages;
}
for(const id of ["q","match","format"]){
  $(id).addEventListener(id==="q"?"input":"change",()=>{page=1;render();});
}
for(const [id,delta] of [["prev",-1],["next",1]])$(id).addEventListener("click",()=>{
  page+=delta;render();$("count").scrollIntoView({block:"start"});
});
try{
  const response=await fetch("/indexes/"+disease+"-2026.json");
  if(!response.ok)throw Error("Missing catalog");
  const catalog=await response.json();
  if(disease==="mm"){
    try{
      const summaries=await fetch("/indexes/mm-2026-ja.json");
      if(summaries.ok)japaneseAbstracts=await summaries.json();
    }catch{}
  }
  records=catalog.records;
  $("scope").textContent="ASH公式検索の収録件数 "+records.length+"件（"+catalog.asOf+"取得）。検索語 "+catalog.queries.join(" / ");
  render();
}catch{
  $("count").textContent="索引を読み込めませんでした。";
  $("prev").disabled=$("next").disabled=true;
}
