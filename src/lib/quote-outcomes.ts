/**
 * Commercial quote outcomes are metadata, not part of the industrial cost
 * engine. Count each logical quote (rootId) exactly once, using its latest
 * FINALIZED revision. Drafts have no reliable selling total and are ignored.
 */
export type QuoteOutcome="in_attesa"|"vinto"|"perso";
export type OutcomeInput={
  id:number;rootId:number|null;rev:number|null;
  dataJson:string|null;totalFinal:string|null;
};
export type OutcomeQuote=OutcomeInput&{
  root:number;outcome:QuoteOutcome;value:number|null;
};
export const validOutcome=(s:unknown):s is QuoteOutcome=>
  s==="in_attesa"||s==="vinto"||s==="perso";

export function readQuoteOutcome(raw:string|null):QuoteOutcome{
  if(!raw)return "in_attesa";
  try{
    const parsed=JSON.parse(raw) as unknown;
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return "in_attesa";
    const status=(parsed as Record<string,unknown>).esito_commerciale;
    return validOutcome(status)?status:"in_attesa";
  }catch{return "in_attesa";}
}
function isDraft(raw:string|null):boolean{
  try{
    const parsed=JSON.parse(raw??"null") as unknown;
    return Boolean(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)&&
      (parsed as Record<string,unknown>).stato_preventivo==="bozza");
  }catch{return false;}
}
export function latestCompletedQuotePerRoot<T extends OutcomeInput>(rows:T[]):Array<T&{root:number;outcome:QuoteOutcome;value:number|null}>{
  const chosen=new Map<number,T>();
  for(const q of rows){
    if(isDraft(q.dataJson))continue;
    const root=q.rootId??q.id;
    const existing=chosen.get(root);
    if(!existing || (q.rev??1)>(existing.rev??1) ||
       ((q.rev??1)===(existing.rev??1)&&q.id>existing.id))
      chosen.set(root,q);
  }
  return [...chosen.entries()].map(([root,q])=>{
    const numeric=q.totalFinal===null?NaN:Number(q.totalFinal);
    return {...q,root,outcome:readQuoteOutcome(q.dataJson),
      value:Number.isFinite(numeric)&&numeric>=0?numeric:null};
  }).sort((a,b)=>b.id-a.id);
}
export type OutcomeBucket={count:number;value:number;unpriced:number};
export function summarizeQuoteOutcomes(rows:OutcomeInput[]):{
  vinto:OutcomeBucket;perso:OutcomeBucket;in_attesa:OutcomeBucket;total:OutcomeBucket;
}{
  const init=():OutcomeBucket=>({count:0,value:0,unpriced:0});
  const summary={vinto:init(),perso:init(),in_attesa:init(),total:init()};
  for(const q of latestCompletedQuotePerRoot(rows)){
    for(const bucket of [summary[q.outcome],summary.total]){
      bucket.count++;
      if(q.value===null)bucket.unpriced++;else bucket.value+=q.value;
    }
  }
  return summary;
}
