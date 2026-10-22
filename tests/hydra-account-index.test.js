'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {HydraRemoteProvider}=require('../src/hydra-remote-provider');
const app=process.env.RAMPAGE_APP_ROOT;
test('signed-out Hydra never exposes download source indices',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ram-hydra-account-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=path.join(root,'roaming','hydralauncher','hydra-db');
 fs.mkdirSync(db,{recursive:true});fs.writeFileSync(path.join(db,'CURRENT'),'MANIFEST-00001\n');
 const p=new HydraRemoteProvider({appData:path.join(root,'roaming'),dataDir:path.join(root,'RAMpage'),
  readerExe:process.execPath,readerScript:__filename,
  exec:(_a,_b,_c,cb)=>cb(null,JSON.stringify({games:[{id:'hydra:steam:1',name:'Test Game',installed:true}],
    index:[{id:'hydra:steam:1',title:'Test Game',newOptionsCount:5}],downloads:[{id:'hydra:steam:1',title:'Test Game',status:'downloading',progress:50}],
    sourceCount:3,sessionStored:false}), '')});
 t.after(()=>p.stop());
 assert.equal(p.getIndex('Test').enabled,false);
 await p.configure(true);
 assert.equal(p.status().sessionStored,false);
 const index=p.getIndex('Test');
 assert.equal(index.sessionStored,false);assert.deepEqual(index.downloads,[]);
 assert.deepEqual(index.games,[]);assert.equal(index.sourceCount,0);
 await p.configure(false);
 assert.equal(p.getIndex('Test').enabled,false);
});
test('stored-account flag enables sanitized search/download index only with desktop opt-in',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ram-hydra-account-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=path.join(root,'roaming','hydralauncher','hydra-db');
 fs.mkdirSync(db,{recursive:true});fs.writeFileSync(path.join(db,'CURRENT'),'MANIFEST-00001\n');
 const p=new HydraRemoteProvider({appData:path.join(root,'roaming'),dataDir:path.join(root,'RAMpage'),
  readerExe:process.execPath,readerScript:__filename,
  exec:(_a,_b,_c,cb)=>cb(null,JSON.stringify({games:[{id:'hydra:steam:1',name:'Legal Test Game',installed:true}],
    index:[{id:'hydra:steam:1',title:'Legal Test Game',newOptionsCount:2}],
    downloads:[{id:'hydra:steam:1',title:'Legal Test Game',status:'paused',progress:21}],
    sourceCount:4,sessionStored:true}), '')});
 t.after(()=>p.stop());
 await p.configure(true);
 const idx=p.getIndex('legal');
 assert.equal(idx.sessionStored,true);assert.equal(idx.games.length,1);
 assert.equal(idx.downloads[0].progress,21);assert.equal(idx.sourceCount,4);
 assert.equal(p.getIndex('nonexistent').games.length,0);
 await p.configure(false);assert.equal(p.status().sessionStored,false);
 assert.equal(p.getIndex('legal').games.length,0);
});
test('auth snapshot never returns credentials, download URIs or source URLs',async t=>{
 const reader=process.env.RAMPAGE_HYDRA_READER;
 const node=process.env.RAMPAGE_HYDRA_NODE;
 assert.ok(reader&&node);
 const {ClassicLevel}=require(path.join(path.dirname(reader),'node_modules','classic-level'));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ram-hydra-level-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:2}));
 const folder=path.join(root,'hydra-db');
 const db=new ClassicLevel(folder,{valueEncoding:'json'});
 await db.open();
 await db.put('auth',{accessToken:'SECRET_ACCESSTOKEN_1234567890',refreshToken:'SECRET_REFRESH_1234567890'});
 await db.sublevel('games',{valueEncoding:'json'}).put('steam:1',{
    shop:'steam',objectId:'1',title:'Test Open Game',newDownloadOptionsCount:2,
    executablePath:'C:\\Users\\SECRET_PRIVATE_NAME\\game.exe'});
 await db.sublevel('downloads',{valueEncoding:'json'}).put('steam:1',{
    shop:'steam',objectId:'1',status:'downloading',progress:0.58,
    uri:'magnet:?xt=urn:btih:SECRET_LINK',downloadPath:'C:\\PrivateDownloads'});
 await db.sublevel('downloadSources',{valueEncoding:'json'}).put('example',{
    name:'Not Shared',url:'https://SECRET_SOURCE_URL.example/index.json'});
 await db.close();
 const out=cp.execFileSync(node,[reader,folder],{encoding:'utf8',timeout:20000,
  env:{...process.env,RAMPAGE_HYDRA_TEST:'1'}});
 const data=JSON.parse(out);
 assert.equal(data.sessionStored,true);assert.equal(data.sourceCount,1);
 assert.equal(data.index[0].newOptionsCount,2);
 assert.equal(data.downloads[0].progress,58);
 for(const secret of ['SECRET_ACCESSTOKEN','SECRET_REFRESH','SECRET_LINK','SECRET_SOURCE_URL','SECRET_PRIVATE_NAME','magnet:','downloadPath'])
  assert.equal(out.includes(secret),false,'Sensitive Hydra value leaked: '+secret);
});
test('Remote index is behind existing password/session gate and is GET read-only',()=>{
 assert.ok(app);
 const s=fs.readFileSync(path.join(app,'src','remote-library.js'),'utf8');
 const r=s.indexOf("if(pathname==='/api/hydra/index'&&method==='GET')");
 const a=s.indexOf('const session=this.requireSession(req);');
 assert.ok(r>a && a>0);
 assert.match(s,/this\.getHydraIndex\(term\)/);
 assert.doesNotMatch(s,/startGameDownload|addGameToQueue|magnet:\?/);
 assert.match(s,/this\.checkOrigin\(req\)/);
});
test('Web UI describes that download start must happen in Hydra, not from public link',()=>{
 assert.ok(app);
 const h=fs.readFileSync(path.join(app,'src','remote','index.html'),'utf8');
 const js=fs.readFileSync(path.join(app,'src','remote','client.js'),'utf8');
 assert.match(h,/New downloads must be started inside Hydra/);
 assert.match(js,/Hydra login not detected/);
 assert.match(js,/searchHydraIndex\(\)/);
 assert.doesNotMatch(js,/startGameDownload|addGameToQueue/);
});
