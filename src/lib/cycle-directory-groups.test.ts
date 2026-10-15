import {describe,it,expect} from "vitest";
import {groupCycleDirectory,type CycleDirectoryRow} from "./cycle-directory-groups";
const t=(id:number,code:string|null,rev:number,description="",client="",day=1):CycleDirectoryRow=>({
  id,code,rev,description,client,updatedAt:new Date(`2026-10-${String(day).padStart(2,"0")}T10:00:00Z`),
});
describe("Cicli Standard list — grouped by code",()=>{
  it("groups every revision of a code, with most recent revision as parent",()=>{
    const x=groupCycleDirectory([t(1,"3098913",1),t(2,"3098913",2),t(3,"ABC",1)],"",1,25);
    expect(x.total).toBe(2);
    expect(x.groups.find(g=>g.latest.code==="3098913")?.latest.id).toBe(2);
    expect(x.groups.find(g=>g.latest.code==="3098913")?.revisions.map(r=>r.rev)).toEqual([2,1]);
  });
  it("handles case differences, trimming, and equal revision numbers without losing lines",()=>{
    const x=groupCycleDirectory([t(8," abc ",2),t(9,"ABC",2),t(7,"Abc",1)],"",1,25);
    expect(x.total).toBe(1);
    expect(x.groups[0].revisions.map(r=>r.id)).toEqual([9,8,7]);
  });
  it("does not mistakenly group unrelated uncoded cycles",()=>{
    const x=groupCycleDirectory([t(5,null,1),t(6,"",1),t(7,"  ",1)],"",1,25);
    expect(x.total).toBe(3);
    expect(x.groups.map(g=>g.latest.id).sort()).toEqual([5,6,7]);
  });
  it("finds older descriptions and includes full revision history",()=>{
    const x=groupCycleDirectory([
      t(2,"ZZ",2,"new name","",2),
      t(1,"ZZ",1,"specific old name","",1),
      t(3,"AB",1,"different","",3),
    ],"specific old",1,25);
    expect(x.total).toBe(1);
    expect(x.groups[0].revisions.map(r=>r.id)).toEqual([2,1]);
  });
  it("paginates by DISTINCT code instead of raw revision count",()=>{
    const rows=[t(1,"A",1,"","",1),t(2,"A",2,"","",1),t(3,"B",1,"","",2),t(4,"C",1,"","",3)];
    const a=groupCycleDirectory(rows,"",1,2);
    const b=groupCycleDirectory(rows,"",2,2);
    expect(a.total).toBe(3);expect(b.total).toBe(3);
    expect(a.groups.map(g=>g.latest.code)).toEqual(["C","B"]);
    expect(b.groups.map(g=>g.latest.code)).toEqual(["A"]);
    expect(b.groups[0].revisions).toHaveLength(2);
  });
  it("does not mutate fetched rows",()=>{
    const a=t(1,"AA",1);const b=t(2,"AA",2);const source=[a,b];
    const before=JSON.stringify(source);
    groupCycleDirectory(source,"",1,25);
    expect(JSON.stringify(source)).toBe(before);
  });
});
