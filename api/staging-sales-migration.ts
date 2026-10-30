import mysql from 'mysql2/promise';
export async function migrateStagingSales(){
  const uri=process.env.DATABASE_URL??'';
  const target=new URL(uri);
  if(process.env.VITE_APP_ID!=='ddcost-collaudo'||
    new URL(process.env.MICROSOFT_REDIRECT_URI??'').origin!=='https://ddcost-collaudo.onrender.com'||
    target.hostname!=='gateway01.us-west-2.prod.aws.tidbcloud.com'||decodeURIComponent(target.username)!=='9ovJ2FwEUzJE8ck.root'||target.pathname!=='/ddcost')
    throw new Error('Refused non-staging collaboration migration');
  const db=await mysql.createConnection({uri,ssl:{rejectUnauthorized:true}});
  try{
    await db.query(`CREATE TABLE IF NOT EXISTS colleague_access (
      oid varchar(36) PRIMARY KEY, name varchar(255) NOT NULL, email varchar(320) NOT NULL,
      permission enum('commercial','editor') NOT NULL, enabled tinyint NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS sales_assignments (
      id bigint unsigned AUTO_INCREMENT PRIMARY KEY, kind enum('quote','offer') NOT NULL,
      sourceId bigint unsigned NOT NULL, recipientOid varchar(36) NOT NULL, senderId bigint unsigned NOT NULL,
      seenHash varchar(64), statusHash varchar(64), status enum('ready','transferred','sent') NOT NULL DEFAULT 'ready',
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY assignment_unique(kind,sourceId,recipientOid), KEY recipient(recipientOid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const initial=JSON.parse(process.env.DDCOST_INITIAL_COLLEAGUES??'[]') as {oid:string;name:string;email:string}[];
    for(const person of initial){
      if(!/^[0-9a-f-]{36}$/i.test(person.oid)||!person.email.endsWith('@didieffe.com'))throw new Error('Invalid colleague configuration');
      await db.execute("INSERT INTO colleague_access (oid,name,email,permission,enabled) VALUES (?,?,?,'commercial',1) ON DUPLICATE KEY UPDATE oid=VALUES(oid)",[person.oid,person.name,person.email]);
    }
    console.log('[DDCost] Collaboration tables ready; initial colleagues processed:',initial.length);
  }finally{await db.end();}
}
