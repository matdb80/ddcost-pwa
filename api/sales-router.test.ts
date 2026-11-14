import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {TrpcContext} from './context';
const mock=vi.hoisted(()=>({rows:[] as unknown[][],writes:vi.fn()}));
vi.mock('./queries/connection',()=>({getDb:()=>({select:()=>{
 const result=mock.rows.shift()??[];
 const chain:any={from:()=>chain,where:()=>chain,limit:()=>Promise.resolve(result),orderBy:()=>Promise.resolve(result)};return chain;
},update:()=>{mock.writes();return {set:()=>({where:()=>Promise.resolve()})};}})}));
import {salesRouter} from './sales-router';
const ctx={req:new Request('https://test.local'),resHeaders:new Headers(),user:{id:2,unionId:'recipient',role:'user',commercialOnly:true}} as TrpcContext;
const assignment={id:1,kind:'offer',sourceId:10,recipientOid:'recipient',senderId:1,seenHash:null,statusHash:null,status:'ready'};
const offer={id:10,userId:1,updatedAt:new Date(),dataJson:JSON.stringify({cliente:'Customer',righe:[{codice:'A',descrizione:'Bandella',lotto:10,netto:5,full_cost:2}],note:'SECRET'})};
beforeEach(()=>{vi.stubEnv('DDCOST_COLLABORATION_ENABLED','1');mock.rows=[];mock.writes.mockClear();});
describe('Assigned document API',()=>{
 it('rejects guessing another recipient assignment id',async()=>{
  mock.rows=[[{...assignment,recipientOid:'other'}]];
  await expect(salesRouter.createCaller(ctx).get({id:1})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('returns only allowlisted sales data',async()=>{
  mock.rows=[[assignment],[offer]];
  const result=await salesRouter.createCaller(ctx).get({id:1});
  expect(result.document.rows[0].netPrice).toBe('5,00');
  expect(JSON.stringify(result)).not.toMatch(/SECRET|full_cost|dataJson|userId/);
 });
 it('rejects status updates for a superseded revision',async()=>{
  mock.rows=[[assignment],[offer]];
  await expect(salesRouter.createCaller(ctx).receipt({id:1,hash:'0'.repeat(64),status:'sent'})).rejects.toThrow(/Nuova revisione/);
  expect(mock.writes).not.toHaveBeenCalled();
 });
 it('does not let a sender forge the recipient receipt',async()=>{
  mock.rows=[[{...assignment,recipientOid:'other',senderId:2}]];
  await expect(salesRouter.createCaller(ctx).receipt({id:1,hash:'0'.repeat(64)})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('records a receipt for the exact displayed revision',async()=>{
  mock.rows=[[assignment],[offer]];const caller=salesRouter.createCaller(ctx);const d=await caller.get({id:1});
  mock.rows=[[assignment],[offer]];expect(await caller.receipt({id:1,hash:d.hash,status:'transferred'})).toEqual({ok:true});expect(mock.writes).toHaveBeenCalledOnce();
 });
 it('resets progress after the sales data changes',async()=>{
  mock.rows=[[assignment],[offer]];const caller=salesRouter.createCaller(ctx);const d=await caller.get({id:1});
  mock.rows=[[{...assignment,status:'sent',statusHash:d.hash}],[offer]];expect((await caller.get({id:1})).status).toBe('sent');
  mock.rows=[[{...assignment,status:'sent',statusHash:d.hash}],[{...offer,dataJson:offer.dataJson.replace('"netto":5','"netto":6')}]];expect((await caller.get({id:1})).status).toBe('ready');
 });
});
