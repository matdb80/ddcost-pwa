import { beforeEach, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { randomUUID } from "node:crypto";
import type { TrpcContext } from "./context";
const connection = vi.hoisted(() => ({ db: undefined as any }));
vi.mock("./queries/connection", () => ({ getDb: () => connection.db }));
import { quoteAttachmentRouter, decodeQuoteFile } from "./quote-attachment-router";
import { temporaryProductRouter } from "./temporary-product-router";
import { validateTemporaryProductDocument } from "./temporary-code-validation";
import { assertNov09Staging } from "./staging-nov09-release";

// Exercises the actual routers on a transactional adapter. It is not a live SQL test.
class Store {
  rows: Record<string, any[]> = { quotes: [{id:1,rootId:1,userId:1},{id:2,rootId:1,userId:1},{id:3,rootId:3,userId:2}], quote_attachments: [], temporary_product_sequence: [{id:1,lastNumber:0}], temporary_product_codes: [] };
  failInsert = "";
  locks = 0;
  tail = Promise.resolve();
  dialect = new MySqlDialect();
  filtered(name: string, condition?: SQL) {
    const rows = this.rows[name];
    if (!condition) return rows;
    const {sql,params}=this.dialect.sqlToQuery(condition);
    const fields=[...sql.matchAll(/`[a-z_]+`\.`(\w+)` = \?/g)].map(m=>m[1]);
    if (/ in \(/i.test(sql)) { const key=/`[a-z_]+`\.`(\w+)` in/i.exec(sql)![1]; return rows.filter(r=>params.includes(r[key])); }
    return rows.filter(r=>fields.every((field,i)=>r[field]===params[i]));
  }
  connect(transaction = false): any {
    return {
      transaction: async (fn: (db:any)=>Promise<any>) => {
        let release!:()=>void; const previous=this.tail; this.tail=new Promise(r=>release=r); await previous;
        const before=structuredClone(this.rows);
        try { return await fn(this.connect(true)); } catch(e) {this.rows=before;throw e;} finally {release();}
      },
      select: (columns?:Record<string,unknown>) => {
        let name="", condition:SQL|undefined, limit=Infinity;
        const q:any={from:(table:any)=>{name=getTableName(table);return q;},where:(c:SQL)=>{condition=c;return q;},limit:(n:number)=>{limit=n;return q;},orderBy:()=>q,
          for:()=>{expect(transaction).toBe(true);this.locks++;return q;},
          then:(resolve:any,reject:any)=>Promise.resolve(structuredClone(this.filtered(name,condition).slice(0,limit).map(row=>columns?Object.fromEntries(Object.keys(columns).map(k=>[k,row[k]])):row))).then(resolve,reject)};
        return q;
      },
      insert:(table:any)=>({values:async(value:any)=>{
        const name=getTableName(table);if(this.failInsert===name)throw new Error("injected insert failure");
        const rows=this.rows[name];const id=Math.max(0,...rows.map(r=>r.id))+1;
        rows.push({id,createdAt:new Date(),code:null,material:null,color:null,...value});return [{insertId:id}];
      }}),
      update:(table:any)=>({set:(value:any)=>({where:async(condition:SQL)=>{this.filtered(getTableName(table),condition).forEach(r=>Object.assign(r,value));return [{affectedRows:1}];}})}),
    };
  }
}
const ctx=(id=1,commercialOnly=false):TrpcContext=>({req:new Request("https://test.local"),resHeaders:new Headers(),user:{id,role:"user",commercialOnly} as TrpcContext["user"]});
let store:Store;
beforeEach(()=>{store=new Store();connection.db=store.connect();});
const attachments=(id=1)=>quoteAttachmentRouter.createCaller(ctx(id));
const codes=(id=1)=>temporaryProductRouter.createCaller(ctx(id));
it.each(["prodotti","righe"] as const)("validates custom finishes against the issued prefix in %s",async rowKey=>{
  const requestKey=randomUUID();await codes().reserve({family:"FP",requestKey});
  const input={requestKey,family:"FP" as const,material:"B" as const,color:null};
  await expect(codes().complete(input)).rejects.toMatchObject({code:"BAD_REQUEST"});
  const issued=await codes().complete({...input,suffix:"a"});
  expect(issued.code).toBe("TFP0000001Ba");
  expect(await codes().complete({...input,suffix:"a"})).toEqual(issued);
  await expect(codes().complete({...input,suffix:"b"})).rejects.toMatchObject({code:"CONFLICT"});
  const doc=(code:string)=>JSON.stringify({[rowKey]:[{codice:code,codice_temporaneo:issued}]});
  await expect(validateTemporaryProductDocument(doc("TFP0000001Bz"),rowKey)).resolves.toBeUndefined();
  for(const invalid of ["TFP0000002Bz","TFP0000001Az","TFP0000001B","TFP0000001Bzz"])
    await expect(validateTemporaryProductDocument(doc(invalid),rowKey)).rejects.toThrow(/primi 11/);
  await expect(validateTemporaryProductDocument(doc("TFP0000001B"),rowKey,true)).resolves.toBeUndefined();
  expect(store.rows.temporary_product_codes[0].code).toBe("TFP0000001Ba");
  expect(store.rows.temporary_product_sequence[0].lastNumber).toBe(1);
});
it("preserves legacy eleven-character issuance while new iron codes use lowercase n",async()=>{
  const legacy={sequence:99,family:"FP",material:"B",color:null,code:"TFP0000099B"};
  store.rows.temporary_product_codes.push({id:99,userId:1,requestKey:randomUUID(),...legacy});
  await expect(validateTemporaryProductDocument(JSON.stringify({prodotti:[{codice:legacy.code,codice_temporaneo:legacy}]}),"prodotti")).resolves.toBeUndefined();
  const requestKey=randomUUID();await codes().reserve({family:"FP",requestKey});
  const issued=await codes().complete({requestKey,family:"FP",material:"I",color:null});
  expect(issued.code).toBe("TFP0000001In");
  await expect(validateTemporaryProductDocument(JSON.stringify({prodotti:[{codice:issued.code,codice_temporaneo:issued}]}),"prodotti")).resolves.toBeUndefined();
  await expect(validateTemporaryProductDocument(JSON.stringify({prodotti:[{codice:"TFP0000001IP",codice_temporaneo:issued}]}),"prodotti")).rejects.toThrow(/non corrisponde/);
});
const file={quoteId:1,fileName:"../disegno.txt",dataBase64:Buffer.from("prova à").toString("base64")};
it("stores exact bytes outside quote JSON, reopens from another revision and lists metadata only",async()=>{
  const before=structuredClone(store.rows.quotes);
  const a=await attachments().upload(file);
  const read=await attachments().get({quoteId:2,id:a.id});
  expect(Buffer.from(read.dataBase64,"base64").toString()).toBe("prova à");
  expect(read.fileName).toBe("disegno.txt");expect(read.sha256).toMatch(/^[a-f0-9]{64}$/);
  const list=await attachments().list({quoteId:2});expect(list).toHaveLength(1);expect(list[0]).not.toHaveProperty("dataBase64");
  expect(store.rows.quotes).toEqual(before);
  await expect(attachments().get({quoteId:3,id:a.id})).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("deduplicates simultaneous retries and enforces count/byte limits atomically",async()=>{
  const results=await Promise.all([attachments().upload(file),attachments().upload(file)]);
  expect(results[0].id).toBe(results[1].id);expect(store.rows.quote_attachments).toHaveLength(1);expect(store.locks).toBe(4);
  store.rows.quote_attachments[0].sizeBytes=50*1024*1024;
  await expect(attachments().upload({...file,dataBase64:"YWJj"})).rejects.toThrow(/50 MB/);
  store.rows.quote_attachments=Array.from({length:20},(_,i)=>({id:i+1,rootId:1,sizeBytes:1,sha256:String(i)}));
  await expect(attachments().upload(file)).rejects.toThrow(/20 file/);
});
it("rejects unauthorized upload, anonymous and sales-only reads",async()=>{
  await expect(attachments(2).upload(file)).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(quoteAttachmentRouter.createCaller({...ctx(),user:undefined}).list({quoteId:1})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(quoteAttachmentRouter.createCaller(ctx(1,true)).list({quoteId:1})).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(store.rows.quote_attachments).toHaveLength(0);
});
it("validates base64 and checksum, and never previews active HTML/SVG",async()=>{
  for(const value of ["", "%%%", "YR==", "YWJj\n"])expect(()=>decodeQuoteFile("x.txt",value)).toThrow();
  expect(decodeQuoteFile("x.svg",Buffer.from('<svg onload="alert(1)"/>').toString("base64")).mimeType).toBe("application/octet-stream");
  expect(decodeQuoteFile("x.html",Buffer.from('<script>alert(1)</script>').toString("base64")).mimeType).toBe("application/octet-stream");
  const {id}=await attachments().upload(file);store.rows.quote_attachments[0].dataBase64="YWJj";
  await expect(attachments().get({quoteId:1,id})).rejects.toThrow(/integrità/);
});
it("reserves unique global sequences across users/families and reuses the request key on retry",async()=>{
  const key=randomUUID();const first=await codes().reserve({family:"AM",requestKey:key});
  expect(first.sequence).toBe(1);expect(await codes().reserve({family:"FP",requestKey:key})).toEqual(first);
  const values=await Promise.all(Array.from({length:12},(_,i)=>codes(i%2+1).reserve({family:i%2?"FP":"AM",requestKey:randomUUID()})));
  expect(new Set(values.map(r=>r.sequence)).size).toBe(12);expect(store.rows.temporary_product_sequence[0].lastNumber).toBe(13);
  await expect(codes(2).reserve({family:"FP",requestKey:key})).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("completes a reserved code idempotently and forbids reassignment",async()=>{
  const requestKey=randomUUID();await codes().reserve({family:"AM",requestKey});
  const input={requestKey,family:"AM" as const,material:"I" as const,color:"9006"};
  const result=await codes().complete(input);expect(result.code).toBe("TAM0000001IO9006");
  expect(await codes().complete(input)).toEqual(result);
  await expect(codes().complete({...input,color:"9010"})).rejects.toMatchObject({code:"CONFLICT"});
  await expect(codes(2).complete(input)).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("rolls back the sequence when issuance fails and prevents overflow",async()=>{
  store.failInsert="temporary_product_codes";
  await expect(codes().reserve({family:"AM",requestKey:randomUUID()})).rejects.toThrow();
  expect(store.rows.temporary_product_sequence[0].lastNumber).toBe(0);
  store.failInsert="";store.rows.temporary_product_sequence[0].lastNumber=9999999;
  await expect(codes().reserve({family:"AM",requestKey:randomUUID()})).rejects.toThrow(/esauriti/);
});
it("checks issued metadata server-side and rejects forged or mixed-color codes",async()=>{
  const requestKey=randomUUID();await codes().reserve({family:"FP",requestKey});
  const code=await codes().complete({requestKey,family:"FP",material:"X",color:"9010"});
  const doc={verniciatura_ral:{color:"9010",textured:false},prodotti:[{codice:code.code,codice_temporaneo:code}]};
  await expect(validateTemporaryProductDocument(JSON.stringify(doc),"prodotti")).resolves.toBeUndefined();
  await expect(validateTemporaryProductDocument(JSON.stringify({...doc,prodotti:[{codice:code.code,codice_temporaneo:{...code,sequence:2}}]}),"prodotti")).rejects.toThrow(/non emesso|incoerente/);
  await expect(validateTemporaryProductDocument(JSON.stringify({...doc,verniciatura_ral:{color:"9006",textured:false}}),"prodotti")).rejects.toThrow(/diverso/);
});
it("refuses schema activation outside the exact staging identity",()=>{
  expect(()=>assertNov09Staging({RENDER_SERVICE_ID:"srv-db4v8i3bc2fs73doa15g"})).toThrow(/identity/);
  const vars={RENDER_SERVICE_ID:"srv-db5np90473hc73bq8c1g",VITE_APP_ID:"ddcost-collaudo",RENDER_GIT_BRANCH:"feature/editor-cicli-v7-reviewed",RENDER_EXTERNAL_URL:"https://ddcost-collaudo.onrender.com",DATABASE_URL:"mysql://9ovJ2FwEUzJE8ck.root:test@gateway01.us-west-2.prod.aws.tidbcloud.com/ddcost"};
  expect(()=>assertNov09Staging(vars)).not.toThrow();
  expect(()=>assertNov09Staging({...vars,DATABASE_URL:vars.DATABASE_URL.replace("9ovJ2FwEUzJE8ck.root","production")})).toThrow(/identity/);
});
