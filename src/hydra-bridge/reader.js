'use strict';
// Trusted LOCAL helper, executed with bundled Node + classic-level. No Hydra writes.
// Reads a short-lived copy of the LevelDB files; the original database stays untouched.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ClassicLevel}=require('classic-level');

function safeUrl(v){return typeof v==='string'&&v.length<2048&&/^https:\/\//i.test(v)?v:null}
function toGame(raw){
 if(!raw||typeof raw!=='object'||raw.isDeleted===true)return null;
 const shop=String(raw.shop||'').toLowerCase(),objectId=String(raw.objectId||'');
 if(!/^[a-z0-9_-]{1,40}$/.test(shop)||!/^[a-zA-Z0-9:._-]{1,180}$/.test(objectId))return null;
 const name=String(raw.title||'').trim().slice(0,250);if(!name)return null;
 // The helper does NOT export filesystem paths, downloads, credentials or links.
 return {id:'hydra:'+shop+':'+objectId, source:'hydra',name,shop,
  installed:!!(raw.executablePath||raw.installedSizeInBytes),
  platform:typeof raw.platform==='string'?raw.platform.slice(0,100):null,
  cover:safeUrl(raw.customCoverImageUrl)||safeUrl(raw.iconUrl),
  playtimeSec:Math.max(0,Math.floor(Number(raw.playTimeInMilliseconds||0)/1000)),
  lastPlayed:raw.lastTimePlayed||null};
}
async function scan(dbPath) {
 if(process.platform!=='win32'&&process.env.RAMPAGE_HYDRA_TEST!=='1')
   throw Error('Hydra database import supported only on Windows');
 const resolved=path.resolve(dbPath);
 if(!fs.statSync(resolved).isDirectory())throw Error('Hydra database folder not found');
 // Prevent accidental copying of giant/unknown files or traversal to other data.
 const names=fs.readdirSync(resolved);
 if(!names.some(n=>n==='CURRENT'))throw Error('Hydra LevelDB CURRENT file is missing');
 const candidates=names.filter(n=>n==='CURRENT'||/^(?:MANIFEST-\d+|OPTIONS-\d+|LOG(?:\.old)?|\d+\.(?:log|ldb|sst))$/.test(n));
 let total=0;
 for(const n of candidates){
   const stat=fs.lstatSync(path.join(resolved,n));
   if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe Hydra database entry');
   total+=stat.size;if(total>500*1024*1024)throw Error('Hydra library database too large to snapshot safely');
 }
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-hydra-snapshot-'));
 try{
   for(const n of candidates)fs.copyFileSync(path.join(resolved,n),path.join(tmp,n));
   const db=new ClassicLevel(tmp,{valueEncoding:'json',createIfMissing:false});
   try{
     await db.open();
     const level=db.sublevel('games',{valueEncoding:'json'});
     const records=await level.iterator({limit:10000}).all();
     const items=records.map(([,value])=>toGame(value)).filter(Boolean).slice(0,5000);
     // Hydra's account tokens are private. Read ONLY an in-memory boolean
     // derived from Hydra's stored auth record, never output/store/log tokens.
     const auth=await db.get('auth',{valueEncoding:'json'}).catch(()=>null);
     const sessionStored=!!(auth && typeof auth.accessToken==='string' && auth.accessToken.length>16);
     // A stored token does not guarantee it is online/valid; the UI says so.
     let downloads=[],sourceCount=0;
     if(sessionStored){
       const rawDownloads=await db.sublevel('downloads',{valueEncoding:'json'})
         .iterator({limit:3000}).all();
       const byId=new Map(items.map(g=>[g.id,g]));
       downloads=rawDownloads.map(([,d])=>{
         if(!d||typeof d!=='object')return null;
         const shop=String(d.shop||''),oid=String(d.objectId||'');
         const id='hydra:'+shop+':'+oid,game=byId.get(id);
         if(!game)return null;
         const progress=Number(d.progress);
         const status=String(d.status||'unknown').slice(0,50);
         // Never export torrent magnets, direct links, paths or downloader secrets.
         return {id,title:game.name,status:/^[a-z_ -]{1,50}$/i.test(status)?status:'unknown',
           progress:Number.isFinite(progress)?Math.max(0,Math.min(100,Math.round(progress*100))):0,
           queued:d.queued===true};
       }).filter(Boolean).slice(0,3000);
       const sources=await db.sublevel('downloadSources',{valueEncoding:'json'})
         .iterator({limit:1000}).all();
       sourceCount=sources.length;
     }
     // Only game identities, counts, download status; never downloadable URLs.
     const index=items.map(g=>{
       const raw=records.find(([,v])=>v?.shop===g.shop&&String(v?.objectId)===g.id.split(':').slice(2).join(':'))?.[1];
       const count=Math.max(0,Math.min(999,Number(raw?.newDownloadOptionsCount)||0));
       return {id:g.id,title:g.name,installed:g.installed,newOptionsCount:count};
     });
     return {games:items,count:items.length,sessionStored,downloads,sourceCount,index};
   }finally{await db.close().catch(()=>{});}
 }finally{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
if(require.main===module){
 const db=process.argv[2];
 if(!db){process.stderr.write('Missing approved Hydra database folder\n');process.exitCode=2;}
 else scan(db).then(data=>{process.stdout.write(JSON.stringify(data));},
   err=>{process.stderr.write('Hydra library could not be read: '+err.message+'\n');process.exitCode=1;});
}
module.exports={scan,toGame};
