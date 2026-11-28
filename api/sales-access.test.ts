import {describe,it,expect} from 'vitest';
import {createRouter,authedQuery,signedInQuery,adminQuery} from './middleware';
import type {TrpcContext} from './context';
const router=createRouter({sales:signedInQuery.query(()=>true),costs:authedQuery.query(()=>true),manage:adminQuery.mutation(()=>true)});
const context=(role:'user'|'admin',commercialOnly:boolean)=>({req:new Request('https://test.local'),resHeaders:new Headers(),user:{id:2,role,commercialOnly}} as TrpcContext);
describe('Commercial permissions enforced at API boundary',()=>{
 it('denies anonymous requests',async()=>{
  const c=router.createCaller({req:new Request('https://test.local'),resHeaders:new Headers()});
  await expect(c.sales()).rejects.toMatchObject({code:'UNAUTHORIZED'});
 });
 it('allows commercial inbox but blocks internal reads and admin writes',async()=>{
  const c=router.createCaller(context('user',true));
  expect(await c.sales()).toBe(true);
  await expect(c.costs()).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(c.manage()).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('allows editor access without admin escalation',async()=>{
  const c=router.createCaller(context('user',false));expect(await c.costs()).toBe(true);
  await expect(c.manage()).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('retains administrator access',async()=>{expect(await router.createCaller(context('admin',false)).manage()).toBe(true);});
});
