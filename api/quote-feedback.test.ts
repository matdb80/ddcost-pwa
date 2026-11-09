import {beforeEach, afterEach, describe, expect, it, vi} from "vitest";
import {getTableName, type SQL} from "drizzle-orm";
import {MySqlDialect} from "drizzle-orm/mysql-core";
import type {TrpcContext} from "./context";
import {quoteWriteToken} from "./quote-write-guard";
import type {Quote} from "@db/schema";

const connection=vi.hoisted(()=>({db:undefined as any}));
vi.mock("./queries/connection",()=>({getDb:()=>connection.db}));
import {quoteRouter} from "./quote-router";
import {offerRouter} from "./offer-router";

// Transactional in-memory adapter: exercises the real routers and shared allocator.
// Row locking/rollback are simulated here, not a claim of a live TiDB test.
class Store {
  quotes:any[]=[];
  offers:any[]=[];
  counter=0;
  missingCounter=false;
  failInsert="";
  locks=0;
  private tail=Promise.resolve();
  private dialect=new MySqlDialect();
  private table(table:any){return getTableName(table);}
  private filter(rows:any[],condition?:SQL){
    if(!condition)return rows;
    const {sql,params}=this.dialect.sqlToQuery(condition);
    const fields=[...sql.matchAll(/`(?:quotes|commercial_offers)`\.`(id|userId|rootId)` = \?/g)].map(m=>m[1]);
    if(!fields.length)return rows;
    return rows.filter(row=>{
      const matches=fields.map((field,i)=>row[field]===params[i]);
      return /\sor\s/i.test(sql)?matches.some(Boolean):matches.every(Boolean);
    });
  }
  private adapter(inTransaction=false):any {
    const store=this;
    return {
      transaction:async(fn:(tx:any)=>Promise<unknown>)=>{
        let release!:()=>void;
        const prior=store.tail;store.tail=new Promise<void>(r=>release=r);await prior;
        const snapshot=structuredClone({quotes:store.quotes,offers:store.offers,counter:store.counter});
        try{return await fn(store.adapter(true));}
        catch(e){Object.assign(store,snapshot);throw e;}
        finally{release();}
      },
      execute:async(query:SQL)=>{
        const {sql,params}=store.dialect.sqlToQuery(query);
        if(sql.includes("FOR UPDATE")){expect(inTransaction).toBe(true);store.locks++;}
        if(sql.includes("FROM offer_number_sequence"))return [store.missingCounter?[]:[{lastNumber:store.counter}],[]];
        if(sql.includes("AS documents")){
          const values=[...store.offers.map(r=>r.name),...store.quotes.map(r=>{try{return JSON.parse(r.dataJson).numero_preventivo;}catch{return undefined;}})];
          const nums=values.map(v=>/^DDC([0-9]{1,5})(?:\/[0-9]{4})?$/.exec(v??"")).filter(Boolean).map(m=>Number(m![1]));
          return [[{lastNumber:Math.max(0,...nums)}],[]];
        }
        if(sql.startsWith("UPDATE offer_number_sequence")){expect(inTransaction).toBe(true);store.counter=Number(params[0]);return [{affectedRows:1},[]];}
        throw new Error("Unexpected SQL: "+sql);
      },
      select:()=>{
        let name="",condition:SQL|undefined,limit=Infinity;
        const q:any={from:(t:any)=>{name=store.table(t);return q;},where:(c:SQL)=>{condition=c;return q;},
          orderBy:()=>q,limit:(n:number)=>{limit=n;return q;},for:()=>{expect(inTransaction).toBe(true);return q;},
          then:(resolve:any,reject:any)=>{
            const rows=name==="product_groups"?[{name:"Bandelle"}]:name==="quotes"?store.quotes:store.offers;
            return Promise.resolve(structuredClone(store.filter(rows,condition).sort((a,b)=>(b.rev??1)-(a.rev??1)||b.id-a.id).slice(0,limit))).then(resolve,reject);
          }};return q;
      },
      insert:(t:any)=>({values:async(values:any)=>{
        const name=store.table(t);if(store.failInsert===name){store.failInsert="";throw new Error("Insert failed");}
        const rows=name==="quotes"?store.quotes:store.offers;
        const id=Math.max(0,...rows.map(r=>r.id))+1;
        rows.push({id,createdAt:new Date(),updatedAt:new Date(),...values});return [{insertId:id}];
      }}),
      update:(t:any)=>({set:(values:any)=>({where:async(condition:SQL)=>{
        const rows=store.table(t)==="quotes"?store.quotes:store.offers;
        const found=store.filter(rows,condition);found.forEach(row=>Object.assign(row,values,{updatedAt:new Date()}));return [{affectedRows:found.length}];
      }})}),
    };
  }
  connect(){return this.adapter();}
}
const context=(id=1,commercialOnly=false):TrpcContext=>({req:new Request("https://test.local"),resHeaders:new Headers(),user:{id,role:"admin",commercialOnly} as TrpcContext["user"]});
const doc=()=>({cliente:"Cliente",riferimento_preventivo:"Progetto alfa",stato_preventivo:"completo",prodotti:[{codice:"TMP-storico-17",descrizione:"Bandella",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",quantita:10,oggetto_modifica:["occhio"]}],note_cliente:"Prima"});
const payload=(document=doc())=>({client:"Cliente",reference:"Progetto alfa",numProducts:1,totalFinal:"100",targetTotal:null,dataJson:JSON.stringify(document)});
let store:Store;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));store=new Store();connection.db=store.connect();});
afterEach(()=>vi.useRealTimers());
const caller=()=>quoteRouter.createCaller(context());
const offer=()=>offerRouter.createCaller(context());
async function createQuote(){const p=payload();return caller().create({...p,targetTotal:undefined});}

it("allows an incomplete geometry draft but rejects invalid material geometry on completed writes",async()=>{
  const document=doc();Object.assign(document.prodotti[0],{costo_materiale_noto:false,geometria_materiale:"",lunghezza_mm:100,diametro_mm:10,diametro_interno_mm:6,costo_materiale_kg:4});
  const draft=await caller().saveDraft({dataJson:JSON.stringify(document)});
  await expect(caller().finalizeDraft({draftId:draft.id,...payload(document)})).rejects.toThrow("geometria");
  Object.assign(document.prodotti[0],{geometria_materiale:"tubo"});
  await caller().finalizeDraft({draftId:draft.id,...payload(document)});
  expect(JSON.parse((await caller().get({id:draft.id}))!.dataJson!).prodotti[0]).toMatchObject({geometria_materiale:"tubo",diametro_mm:10,diametro_interno_mm:6});
  Object.assign(document.prodotti[0],{diametro_interno_mm:12});
  const before=structuredClone(store.quotes);
  await expect(caller().create({...payload(document),targetTotal:undefined})).rejects.toThrow("diametro interno");
  await expect(caller().update({id:draft.id,expectedToken:quoteWriteToken(store.quotes[0]),...payload(document)})).rejects.toThrow("diametro interno");
  await expect(caller().saveRevision({sourceId:draft.id,...payload(document)})).rejects.toThrow("diametro interno");
  expect(store.quotes).toEqual(before);
});

describe("quote product description limit",()=>{
  it("persists exactly 60 characters including spaces unchanged through draft and completion",async()=>{
    const document=doc();document.prodotti[0].descrizione="A ".repeat(30);
    const draft=await caller().saveDraft({dataJson:JSON.stringify(document)});
    await caller().finalizeDraft({draftId:draft.id,...payload(document)});
    const loaded=await caller().get({id:draft.id});
    expect(JSON.parse(loaded!.dataJson!).prodotti[0].descrizione).toBe("A ".repeat(30));
  });
  it("rejects 61 characters on all writes without modifying or truncating saved history",async()=>{
    const source=await createQuote();
    const draft=await caller().saveDraft({dataJson:JSON.stringify(doc())});
    const invalid=doc();invalid.prodotti[0].descrizione="A ".repeat(30)+" ";
    const before=structuredClone(store.quotes);
    for(const write of [
      ()=>caller().create({...payload(invalid),targetTotal:undefined}),
      ()=>caller().saveDraft({dataJson:JSON.stringify(invalid)}),
      ()=>caller().saveDraft({sourceId:draft.id,dataJson:JSON.stringify(invalid)}),
      ()=>caller().finalizeDraft({draftId:draft.id,...payload(invalid)}),
      ()=>caller().update({id:source.id,expectedToken:quoteWriteToken(store.quotes[0]),...payload(invalid)}),
      ()=>caller().saveRevision({sourceId:source.id,...payload(invalid)}),
    ])await expect(write()).rejects.toMatchObject({code:"BAD_REQUEST",message:expect.stringContaining("60 caratteri, spazi inclusi")});
    expect(store.quotes).toEqual(before);
    for(const row of store.quotes){
      row.dataJson=JSON.stringify({...invalid,stato_preventivo:row.id===draft.id?"bozza":"completo"});
      expect(JSON.parse((await caller().get({id:row.id}))!.dataJson!).prodotti[0].descrizione).toBe(invalid.prodotti[0].descrizione);
      await expect(caller().createRevision({rootId:row.id})).rejects.toMatchObject({code:"BAD_REQUEST"});
    }
    expect(store.quotes).toHaveLength(2);
    expect(store.counter).toBe(2);
  });
});

describe("mandatory modification selection",()=>{
  it("rejects missing, empty and malformed selections before reserving a number",async()=>{
    for(const oggetto_modifica of [undefined,null,[],"occhio",["","  "],[1,null]]){
      const invalid={...doc(),prodotti:[{...doc().prodotti[0],oggetto_modifica}]} as any;
      await expect(caller().create({...payload(invalid),targetTotal:undefined})).rejects.toMatchObject({code:"BAD_REQUEST"});
    }
    expect(store.counter).toBe(0);
    expect(store.quotes).toHaveLength(0);
  });
  it("keeps an incomplete draft but requires a selection on every row before completion",async()=>{
    const incomplete={...doc(),prodotti:[doc().prodotti[0],{...doc().prodotti[0],oggetto_modifica:[]}]};
    const draft=await caller().saveDraft({dataJson:JSON.stringify(incomplete)});
    const before=structuredClone(store.quotes);
    await expect(caller().finalizeDraft({draftId:draft.id,...payload(incomplete),numProducts:2})).rejects.toThrow("Prodotto 2");
    expect(store.quotes).toEqual(before);
    incomplete.prodotti[1].oggetto_modifica=["Foratura aggiuntiva"];
    await caller().finalizeDraft({draftId:draft.id,...payload(incomplete),numProducts:2});
    expect(JSON.parse(store.quotes[0].dataJson)).toMatchObject({stato_preventivo:"completo",prodotti:[{oggetto_modifica:["occhio"]},{oggetto_modifica:["Foratura aggiuntiva"]}]});
    expect(store.counter).toBe(1);
  });
  it("rejects removing the last selection on overwrite and revision, while history remains readable",async()=>{
    const created=await createQuote();
    const incomplete={...doc(),prodotti:[{...doc().prodotti[0],oggetto_modifica:[]}]};
    const before=structuredClone(store.quotes);
    await expect(caller().update({id:created.id,expectedToken:quoteWriteToken(store.quotes[0]),...payload(incomplete)})).rejects.toThrow("almeno una voce");
    await expect(caller().saveRevision({sourceId:created.id,...payload(incomplete)})).rejects.toThrow("almeno una voce");
    expect(store.quotes).toEqual(before);
    store.quotes[0].dataJson=JSON.stringify(incomplete);
    const historical=store.quotes[0].dataJson;
    expect((await caller().get({id:created.id}))?.dataJson).toBe(historical);
    expect(store.quotes[0].dataJson).toBe(historical);
    await expect(caller().createRevision({rootId:created.id})).rejects.toThrow("almeno una voce");
    expect(store.quotes).toHaveLength(1);
  });
});

describe("shared commercial numbering",()=>{
  it("alternates standard offers and one-time quotes on one progressive",async()=>{
    expect((await offer().create({dataJson:'{"righe":[]}'})).name).toBe("DDC00001/2026");
    const q=await createQuote();expect(q.number).toBe("DDC00002/2026");
    expect(JSON.parse(store.quotes[0].dataJson)).toMatchObject({numero_preventivo:q.number,riferimento_preventivo:"Progetto alfa"});
    expect((await offer().create({name:"stale-preview",dataJson:'{"righe":[]}'})).name).toBe("DDC00003/2026");
    expect(store.counter).toBe(3);expect(store.locks).toBe(3);
  });
  it("honours existing references and deleted-document counter without renumbering",async()=>{
    store.offers=[{id:9,name:"DDC0042",dataJson:"{}"}];
    store.quotes=[{id:2,dataJson:'{"numero_preventivo":"DDC00050/2026"}'}];
    const old=structuredClone({offers:store.offers,quotes:store.quotes});
    expect((await offer().nextNumber()).number).toBe("DDC00051/2026");expect(store.counter).toBe(0);
    expect((await createQuote()).number).toBe("DDC00051/2026");
    expect(store.offers).toEqual(old.offers);expect(store.quotes[0]).toEqual(old.quotes[0]);
    store.counter=60;expect((await createQuote()).number).toBe("DDC00061/2026");
  });
  it("assigns distinct numbers to simultaneous creates of both kinds",async()=>{
    const results=await Promise.all([createQuote(),offer().create({}),createQuote(),offer().create({})]);
    expect(results.map(r=>"name" in r?r.name:r.number).sort()).toEqual([1,2,3,4].map(n=>`DDC0000${n}/2026`));
  });
  it("rolls counter back when document insertion fails",async()=>{
    store.failInsert="quotes";await expect(createQuote()).rejects.toThrow("Insert failed");
    expect(store.counter).toBe(0);expect(store.quotes).toHaveLength(0);
    expect((await offer().create({})).name).toBe("DDC00001/2026");
  });
  it("changes the year in Italian time while continuing the shared progressive",async()=>{
    vi.setSystemTime(new Date("2026-12-31T22:59:59Z"));expect((await createQuote()).number).toBe("DDC00001/2026");
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z"));expect((await offer().create({})).name).toBe("DDC00002/2027");
  });
  it("fails without a configured sequence rather than duplicating a number",async()=>{
    store.missingCounter=true;await expect(createQuote()).rejects.toThrow("non configurata");expect(store.quotes).toHaveLength(0);
  });
  it("does not reserve a number for an invalid quote",async()=>{
    await expect(caller().create({dataJson:"{}"})).rejects.toThrow("prodott");expect(store.counter).toBe(0);
  });
  it("reserves once for a draft, then preserves it on draft updates and completion",async()=>{
    const d=await caller().saveDraft({dataJson:JSON.stringify(doc())});
    const modified={...doc(),numero_preventivo:"FORGED"};
    await caller().saveDraft({sourceId:d.id,dataJson:JSON.stringify(modified)});
    await caller().finalizeDraft({draftId:d.id,...payload(modified)});
    expect(store.counter).toBe(1);expect(store.quotes).toHaveLength(1);
    expect(JSON.parse(store.quotes[0].dataJson)).toMatchObject({numero_preventivo:"DDC00001/2026",stato_preventivo:"completo"});
  });
});

describe("overwrite selected quote revision",()=>{
  it("updates in place and preserves revision, number, outcome and TMP codes",async()=>{
    const created=await createQuote();
    const source=store.quotes[0];source.rev=3;source.dataJson=JSON.stringify({...JSON.parse(source.dataJson),rev:3,esito_commerciale:"vinto"});
    store.quotes.push({...structuredClone(source),id:30,rev:2});
    const other=structuredClone(store.quotes[1]);
    const loaded=await caller().get({id:created.id});
    const result=await caller().update({id:created.id,expectedToken:loaded!.editToken,...payload({...doc(),note_cliente:"Dopo",numero_preventivo:"FORGED",rev:99} as any)});
    expect(result).toMatchObject({id:created.id,rev:3,rootId:created.id});
    expect(JSON.parse(result.dataJson)).toMatchObject({numero_preventivo:created.number,rev:3,esito_commerciale:"vinto",note_cliente:"Dopo",prodotti:[{codice:"TMP-storico-17"}]});
    expect(store.quotes).toHaveLength(2);expect(store.quotes[1]).toEqual(other);expect(store.counter).toBe(1);
  });
  it("keeps historical records unnumbered when edited and when revised",async()=>{
    store.quotes=[{id:4630016,userId:1,rootId:4630016,rev:1,client:"Cliente",reference:"Progetto alfa",dataJson:JSON.stringify(doc())}];
    const source=store.quotes[0];
    await caller().update({id:source.id,expectedToken:quoteWriteToken(source as Quote),...payload({...doc(),numero_preventivo:"FORGED"} as any)});
    expect(JSON.parse(source.dataJson)).not.toHaveProperty("numero_preventivo");
    await caller().saveRevision({sourceId:source.id,...payload({...doc(),note_cliente:"Versione 2",numero_preventivo:"FORGED"} as any)});
    expect(store.quotes[1].rev).toBe(2);expect(JSON.parse(store.quotes[1].dataJson)).not.toHaveProperty("numero_preventivo");expect(store.counter).toBe(0);
  });
  it("a new revision and draft retain the existing number without consuming another",async()=>{
    const q=await createQuote();
    await caller().saveRevision({sourceId:q.id,...payload({...doc(),note_cliente:"Versione 2"})});
    await caller().saveDraft({sourceId:q.id,dataJson:JSON.stringify(doc())});
    expect(store.quotes.map(r=>JSON.parse(r.dataJson).numero_preventivo)).toEqual([q.number,q.number,q.number]);expect(store.counter).toBe(1);
  });
  it("rejects stale writes and repeated submits without losing the successful edit",async()=>{
    const q=await createQuote();const loaded=await caller().get({id:q.id});
    const args={id:q.id,expectedToken:loaded!.editToken,...payload({...doc(),note_cliente:"Confermato"})};
    const results=await Promise.allSettled([caller().update(args),caller().update(args)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.code).toBe("CONFLICT");
    expect(JSON.parse(store.quotes[0].dataJson).note_cliente).toBe("Confermato");expect(store.counter).toBe(1);
  });
  it("prevents overwriting another user's record",async()=>{
    const q=await createQuote();const row=structuredClone(store.quotes[0]);
    await expect(quoteRouter.createCaller(context(2)).update({id:q.id,expectedToken:quoteWriteToken(row),...payload()})).rejects.toMatchObject({code:"NOT_FOUND"});
    expect(store.quotes[0]).toEqual(row);
  });
  it("validates mandatory product classification before overwrite",async()=>{
    const q=await createQuote();const row=structuredClone(store.quotes[0]);
    await expect(caller().update({id:q.id,expectedToken:quoteWriteToken(row),...payload({...doc(),prodotti:[{...doc().prodotti[0],materiale_prodotto:""}]})})).rejects.toThrow("ferro, ottone, inox o alluminio");
    expect(store.quotes[0]).toEqual(row);
  });
  it("rejects a draft on the completed-revision overwrite endpoint",async()=>{
    const d=await caller().saveDraft({dataJson:JSON.stringify(doc())});const loaded=await caller().get({id:d.id});
    await expect(caller().update({id:d.id,expectedToken:loaded!.editToken,...payload()})).rejects.toThrow("Completa preventivo");
  });
  it("keeps commercial-only access read-only",async()=>{
    await expect(quoteRouter.createCaller(context(1,true)).create({...payload(),targetTotal:undefined})).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(store.counter).toBe(0);
  });
});

describe("forfait completed writes",()=>{
  const forfaitDoc=()=>({...doc(),prodotti:[{a_forfait:true,descrizione:"Lavorazione da definire",valore_forfait:125.5,
    codice:"CODICE-INATTIVO",codice_temporaneo:{code:"CODICE-INATTIVO",color:"3000"},costo_materiale_noto:false,geometria_materiale:""}]});
  it("saves, completes, reopens and revises a forfait without standard classification, quantity or generated-code requirements",async()=>{
    const document=forfaitDoc();
    const draft=await caller().saveDraft({dataJson:JSON.stringify(document)});
    const p={client:"Cliente",numProducts:1,totalFinal:"125.5",targetTotal:null,dataJson:JSON.stringify(document)};
    await caller().finalizeDraft({draftId:draft.id,...p});
    const reopened=JSON.parse((await caller().get({id:draft.id}))!.dataJson!);
    expect(reopened.prodotti).toEqual(document.prodotti);
    document.prodotti[0].valore_forfait=250;
    const revision=await caller().saveRevision({sourceId:draft.id,...p,totalFinal:"250",dataJson:JSON.stringify(document)});
    expect(JSON.parse((await caller().get({id:revision.id}))!.dataJson!).prodotti[0].valore_forfait).toBe(250);
  });
  it("allows an incomplete draft but rejects missing descriptions or amounts on every completed write",async()=>{
    const document=forfaitDoc();
    const p={client:"Cliente",numProducts:1,totalFinal:"125.5",targetTotal:null,dataJson:JSON.stringify(document)};
    const source=await caller().create({...p,targetTotal:undefined});
    for(const invalid of [{...document.prodotti[0],descrizione:" "},{...document.prodotti[0],valore_forfait:null},{...document.prodotti[0],valore_forfait:-1}]){
      const dataJson=JSON.stringify({...document,prodotti:[invalid]});
      const draft=await caller().saveDraft({dataJson});
      const before=structuredClone(store.quotes);
      for(const write of [
        ()=>caller().create({...p,targetTotal:undefined,dataJson}),
        ()=>caller().finalizeDraft({draftId:draft.id,...p,dataJson}),
        ()=>caller().update({id:source.id,expectedToken:quoteWriteToken(store.quotes[0]),...p,dataJson}),
        ()=>caller().saveRevision({sourceId:source.id,...p,dataJson}),
      ])await expect(write()).rejects.toMatchObject({code:"BAD_REQUEST",message:expect.stringContaining("forfait")});
      expect(store.quotes).toEqual(before);
    }
  });
  it("keeps standard validation active on the other rows of a mixed quote",async()=>{
    const document={...doc(),prodotti:[...forfaitDoc().prodotti,{...doc().prodotti[0],oggetto_modifica:[]}]};
    await expect(caller().create({client:"Cliente",numProducts:2,dataJson:JSON.stringify(document)})).rejects.toThrow("Prodotto 2: Seleziona almeno una voce");
    expect(store.quotes).toHaveLength(0);
  });
});
