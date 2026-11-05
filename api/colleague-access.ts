import {eq} from 'drizzle-orm';
import {colleagueAccess} from '@db/schema';
import {getDb} from './queries/connection';
export async function colleaguePermission(oid:string){
  if(process.env.DDCOST_COLLABORATION_ENABLED!=='1')return null;
  const row=(await getDb().select().from(colleagueAccess).where(eq(colleagueAccess.oid,oid)).limit(1))[0];
  return row?.enabled?row.permission:null;
}
