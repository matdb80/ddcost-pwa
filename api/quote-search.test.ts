import {expect,it} from "vitest";
import {quoteSearchMatcher} from "./quote-search";

const row = {id:42,client:"Alfa",reference:"INT-77",dataJson:JSON.stringify({
  titolo_preventivo:"Cantiere Nord", numero_preventivo:"DDC90020/2026",
  verniciatura_ral:{color:"9010",textured:false},
  prodotti:[{descrizione:"Prima riga"},{descrizione:"Angolare sinistro",codice:"FCA00504HBIN"}]
})};
it.each(["ALFA","int-77","tiere nor","ddc90020","04hb","olare sini","9010","RAL 9010","Ral9010","bianco puro","FCA00504HBIO9010"])("finds %s in header or product rows",query=>{
  expect(quoteSearchMatcher(query)(row)).toBe(true);
});
it("treats percent and underscore as literal characters and ignores JSON keys",()=>{
  for(const query of ["%","_","textured","azzurro","RAL 6021"])expect(quoteSearchMatcher(query)(row)).toBe(false);
});
it("supports old consolidated colours and searches the archive even across unreadable snapshots",()=>{
  const old={...row,dataJson:JSON.stringify({ral_consolidato:true,ral_riepilogo:{color:"6021"}})};
  expect(quoteSearchMatcher("RAL 6021")(old)).toBe(true);
  expect(quoteSearchMatcher("angolare")({...row,dataJson:"{"})).toBe(false);
  expect(quoteSearchMatcher("INT-77")({...row,dataJson:"{"})).toBe(true);
});

it("finds the printed standard black finish and distinguishes a natural row",()=>{
  const snapshot=(code:string)=>({...row,dataJson:JSON.stringify({prodotti:[{codice:code}]})});
  expect(quoteSearchMatcher("RAL9005")(snapshot("TBC0000001IN"))).toBe(true);
  expect(quoteSearchMatcher("RAL9005")(snapshot("TBC0000001I0"))).toBe(false);
});
