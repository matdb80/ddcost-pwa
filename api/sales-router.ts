import {createHash} from 'node:crypto';
import {z} from 'zod';
import {and,eq,or,desc} from 'drizzle-orm';
import {TRPCError} from '@trpc/server';
import {createRouter,signedInQuery,authedQuery,adminQuery} from './middleware';
import {getDb} from './queries/connection';
import {colleagueAccess,salesAssignments,quotes,commercialOffers} from '@db/schema';
import {salesDocument} from '../src/lib/commercial-handoff';
import {quoteIsDraft} from '../src/lib/quote-draft-state';
import {env} from './lib/env';
const sourceInput=z.object({kind:z.enum(['quote','offer']),sourceId:z.number().int().positive()});
const enabled=()=>{if(process.env.DDCOST_COLLABORATION_ENABLED!=='1')throw new TRPCError({code:'PRECONDITION_FAILED',message:'Collaborazione non ancora attivata'});};
async function source(kind:'quote'|'offer',id:number){
  const db=getDb();
  if(kind==='offer'){
    const row=(await db.select().from(commercialOffers).where(eq(commercialOffers.id,id)).limit(1))[0];
    if(!row)throw new Error('Offerta non disponibile');
    return {...row,sourceId:row.id,revision:String(row.updatedAt),documentId:row.id};
  }
  const original=(await db.select().from(quotes).where(eq(quotes.id,id)).limit(1))[0];
  if(!original)throw new Error('Preventivo non disponibile');
  const root=original.rootId??original.id;
  const all=await db.select().from(quotes).where(or(eq(quotes.rootId,root),eq(quotes.id,root))).orderBy(desc(quotes.rev),desc(quotes.id));
  const row=all.find(r=>!quoteIsDraft(r.dataJson));
  if(!row)throw new Error('Completa la bozza prima di condividerla');
  return {...row,sourceId:root,revision:String(row.rev??1),documentId:row.id};
}
async function view(kind:'quote'|'offer',id:number){
  const row=await source(kind,id);
  const document=salesDocument(kind,row.dataJson??'{}');
  const hash=createHash('sha256').update(JSON.stringify([row.documentId,document])).digest('hex');
  return {row,document,hash};
}
async function assignment(id:number,oid:string,userId:number,admin:boolean){
  enabled();
  const a=(await getDb().select().from(salesAssignments).where(eq(salesAssignments.id,id)).limit(1))[0];
  if(!a||!(a.recipientOid===oid||a.senderId===userId||admin))throw new TRPCError({code:'NOT_FOUND'});
  return a;
}
export const salesRouter=createRouter({
  available:signedInQuery.query(()=>process.env.DDCOST_COLLABORATION_ENABLED==='1'),
  colleagues:authedQuery.query(async()=>{enabled();return getDb().select().from(colleagueAccess);}),
  authorize:adminQuery.input(z.object({oid:z.uuid(),name:z.string().trim().min(1).max(255),email:z.email().max(320),permission:z.enum(['commercial','editor']),enabled:z.boolean()})).mutation(async({input})=>{
    enabled();if(env.allowedMicrosoftOids.includes(input.oid))throw new Error('Questo account è amministratore nella configurazione principale');
    const row={...input,oid:input.oid.toLowerCase(),enabled:input.enabled?1:0};
    await getDb().insert(colleagueAccess).values(row).onDuplicateKeyUpdate({set:row});return {ok:true};
  }),
  preview:authedQuery.input(sourceInput).query(async({input})=>{const v=await view(input.kind,input.sourceId);return {document:v.document,hash:v.hash};}),
  share:authedQuery.input(sourceInput.extend({recipientOid:z.uuid(),expectedHash:z.string().length(64)})).mutation(async({ctx,input})=>{
    enabled();const v=await view(input.kind,input.sourceId);
    if(v.row.userId!==ctx.user.id&&ctx.user.role!=='admin')throw new TRPCError({code:'FORBIDDEN'});
    if(v.hash!==input.expectedHash)throw new Error('Il documento è cambiato: ricarica prima di condividerlo');
    const recipient=(await getDb().select().from(colleagueAccess).where(eq(colleagueAccess.oid,input.recipientOid)).limit(1))[0];
    if(!recipient?.enabled)throw new Error('Collega non abilitato');
    await getDb().insert(salesAssignments).values({kind:input.kind,sourceId:v.row.sourceId,recipientOid:recipient.oid,senderId:ctx.user.id})
      .onDuplicateKeyUpdate({set:{senderId:ctx.user.id,updatedAt:new Date()}});
    return {ok:true};
  }),
  list:signedInQuery.query(async({ctx})=>{
    enabled();const rows=await getDb().select().from(salesAssignments).where(ctx.user.role==='admin'?undefined:
      or(eq(salesAssignments.recipientOid,ctx.user.unionId),eq(salesAssignments.senderId,ctx.user.id))).orderBy(desc(salesAssignments.updatedAt));
    return Promise.all(rows.map(async a=>{
      try{const v=await view(a.kind,a.sourceId);return {id:a.id,kind:a.kind,client:v.document.client,reference:v.document.reference,
        unread:a.recipientOid===ctx.user.unionId&&a.seenHash!==v.hash,newRevision:!!a.seenHash&&a.seenHash!==v.hash,
        status:a.statusHash===v.hash?a.status:'ready' as const,recipientOid:a.recipientOid,unavailable:false};}
      catch{return {id:a.id,kind:a.kind,client:'Documento non disponibile',reference:'',unread:false,newRevision:false,status:'ready' as const,recipientOid:a.recipientOid,unavailable:true};}
    }));
  }),
  get:signedInQuery.input(z.object({id:z.number().int().positive()})).query(async({ctx,input})=>{
    const a=await assignment(input.id,ctx.user.unionId,ctx.user.id,ctx.user.role==='admin');const v=await view(a.kind,a.sourceId);
    return {id:a.id,kind:a.kind,document:v.document,hash:v.hash,revision:v.row.revision,
      status:a.statusHash===v.hash?a.status:'ready' as const,isRecipient:a.recipientOid===ctx.user.unionId,
      canRevoke:a.senderId===ctx.user.id||ctx.user.role==='admin'};
  }),
  receipt:signedInQuery.input(z.object({id:z.number().int().positive(),hash:z.string().length(64),status:z.enum(['ready','transferred','sent']).optional()})).mutation(async({ctx,input})=>{
    const a=await assignment(input.id,ctx.user.unionId,ctx.user.id,false);
    if(a.recipientOid!==ctx.user.unionId)throw new TRPCError({code:'FORBIDDEN'});
    const v=await view(a.kind,a.sourceId);if(v.hash!==input.hash)throw new Error('Nuova revisione disponibile: ricarica il documento');
    await getDb().update(salesAssignments).set({seenHash:v.hash,...(input.status?{status:input.status,statusHash:v.hash}:{}),updatedAt:new Date()}).where(and(eq(salesAssignments.id,a.id),eq(salesAssignments.recipientOid,ctx.user.unionId)));return {ok:true};
  }),
  revoke:authedQuery.input(z.object({id:z.number().int().positive()})).mutation(async({ctx,input})=>{
    const a=await assignment(input.id,ctx.user.unionId,ctx.user.id,ctx.user.role==='admin');
    if(a.senderId!==ctx.user.id&&ctx.user.role!=='admin')throw new TRPCError({code:'FORBIDDEN'});
    await getDb().delete(salesAssignments).where(eq(salesAssignments.id,a.id));return {ok:true};
  }),
});
