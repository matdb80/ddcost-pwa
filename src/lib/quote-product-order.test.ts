import {expect,it} from "vitest";
import {moveQuoteProductToIndex,productIndexAfterMove} from "./quote-calculation";

it.each([
  [2,0,["C","A","B","D","E"],[1,2,0,3,4]],
  [0,4,["B","C","D","E","A"],[4,0,1,2,3]],
  [4,1,["A","E","B","C","D"],[0,2,3,4,1]],
  [1,3,["A","C","D","B","E"],[0,3,1,2,4]],
] as const)("inserts product %s at %s preserving every row and dependent selection",(from,to,order,references)=>{
  const rows=["A","B","C","D","E"].map((codice,i)=>({codice,quantita:i+1,prezzo_netto_unitario:10+i}));
  const original=structuredClone(rows);
  const result=moveQuoteProductToIndex(rows,from,to);
  expect(result.map(p=>p.codice)).toEqual(order);
  expect([0,1,2,3,4].map(i=>productIndexAfterMove(i,from,to))).toEqual(references);
  for(const p of rows)expect(result.find(r=>r.codice===p.codice)).toBe(p);
  expect(rows).toEqual(original);
});
it("leaves an unchanged position untouched and rejects invalid positions",()=>{
  const rows=[{codice:"A"},{codice:"B"}];
  expect(moveQuoteProductToIndex(rows,1,1)).toBe(rows);
  for(const target of [-1,2,0.5,NaN])expect(()=>moveQuoteProductToIndex(rows,0,target)).toThrow(/Posizione/);
  expect(()=>moveQuoteProductToIndex(rows,3,0)).toThrow(/Posizione/);
  expect(rows.map(p=>p.codice)).toEqual(["A","B"]);
});
