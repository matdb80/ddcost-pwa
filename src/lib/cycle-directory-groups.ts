/**
 * Pure listing helper: no database-specific GROUP BY/COALESCE syntax.
 * Each code gets a single row, containing all its revisions. Empty codes are
 * independent records. Searching any revision keeps the complete code history.
 */
export type CycleDirectoryRow={
  id:number;code:string|null;description:string|null;client:string|null;
  rev:number|null;updatedAt:Date|string|null;
};
export type CycleDirectoryGroup<T extends CycleDirectoryRow>={
  key:string;latest:T;revisions:T[];
};
export function groupCycleDirectory<T extends CycleDirectoryRow>(
  rows:readonly T[], search:string, page:number, pageSize:number
):{groups:Array<CycleDirectoryGroup<T>>;total:number;page:number;pageSize:number}{
  const groupMap=new Map<string,{rows:T[];modified:number}>();
  for(const row of rows){
    const code=(row.code??"").trim();
    const key=code?"code:"+code.toLocaleUpperCase("it-IT"):"missing:"+row.id;
    const date=row.updatedAt?new Date(row.updatedAt).getTime():0;
    const modified=Number.isFinite(date)?date:0;
    const group=groupMap.get(key);
    if(group){group.rows.push(row);group.modified=Math.max(group.modified,modified);}
    else groupMap.set(key,{rows:[row],modified});
  }
  const term=search.trim().toLocaleLowerCase("it-IT");
  const matching=[...groupMap.entries()].filter(([,g])=>!term||g.rows.some(x=>
    [x.code,x.description,x.client].some(v=>String(v??"").toLocaleLowerCase("it-IT").includes(term))
  ));
  matching.sort((a,b)=>b[1].modified-a[1].modified||
    Math.max(...b[1].rows.map(x=>x.id))-Math.max(...a[1].rows.map(x=>x.id)));
  const total=matching.length;
  const start=(Math.max(1,page)-1)*pageSize;
  const groups=matching.slice(start,start+pageSize).map(([key,group])=>{
    const revisions=[...group.rows].sort((a,b)=>(b.rev??1)-(a.rev??1)||b.id-a.id);
    return {key,latest:revisions[0],revisions};
  });
  return {groups,total,page,pageSize};
}
