'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=process.env.RAMPAGE_APP_ROOT;
if(!root)throw Error('RAMPAGE_APP_ROOT must identify an official, patched v1.6.7 app');
const read=p=>fs.readFileSync(path.join(root,'src',p),'utf8');
const {RemoteLibraryService}=require(path.join(root,'src','remote-library.js'));

test('actual packaged RAMpage source includes companion boundary and existing Hydra UI',()=>{
 const html=read('remote/index.html'),client=read('remote/client.js'),server=read('remote-library.js');
 assert.match(html,/id="hydra-game-tools" hidden/);
 assert.match(html,/id="hydra-bridge-panel"/);
 assert.match(client,/mountHydraDownloadPanel\(qs\('hydra-bridge-panel'\)/);
 assert.match(client,/window\.RAMpageHydraWebClient/);
 assert.match(client,/window\.RAMpageHydraDownloadPanel/);
 assert.match(client,/window\.rampageHydraBridgePanel\.destroy\(\)/);
 assert.match(server,/createHydraBridge\(null\)/);
 assert.match(server,/canManageDownloads:false/);
 assert.match(server,/req\.headers\['x-rampage-csrf'\]/);
 assert.match(server,/pathname\.startsWith\('\/api\/hydra\/bridge\/'\)/);
 assert.match(read('main.js'),/ipcMain\.handle\('hydra:draft-create'/);
 assert.match(read('main.js'),/ShadPS4 foreground release result/);
});

test('existing login gates bridge, disabled Hydra refuses access, unsupported downloader fails closed',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-hydra-bridge-prod-'));
 let enabled=true;
 const svc=new RemoteLibraryService({
   dataDir,port:0,getGames:()=>({}),saveGame:()=>true,rebuildMeta:()=>{},
   hydraDraftEnabled:()=>enabled,
   getHydraIndex:()=>({enabled,sessionStored:enabled,games:[],downloads:[]}),
 });
 t.after(async()=>{await svc.stop();fs.rmSync(dataDir,{recursive:true,force:true})});
 await svc.configure({enabled:true,password:'A sufficiently long test password'});
 const base=svc.status().localUrl.slice(0,-1);
 const anon=await fetch(base+'/api/hydra/bridge/status');
 assert.equal(anon.status,401);
 const login=await fetch(base+'/api/login',{
  method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
  body:JSON.stringify({password:'A sufficiently long test password'})
 });
 assert.equal(login.status,200);
 const loginData=await login.json();
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const get=async resource=>fetch(base+resource,{headers:{Cookie:cookie}});
 const status=await get('/api/hydra/bridge/status');
 assert.equal(status.status,200);
 assert.deepEqual(await status.json(),{data:{connected:false,capabilities:[]}});
 const downloads=await get('/api/hydra/bridge/downloads');
 assert.equal(downloads.status,503);
 assert.deepEqual(await downloads.json(),{error:'UNAVAILABLE'});
 const denied=await fetch(base+'/api/hydra/bridge/command',{
  method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json',
   'X-Rampage-CSRF':loginData.csrf},
  body:JSON.stringify({action:'queue',gameId:'game:1',optionId:'option:1'})
 });
 assert.equal(denied.status,403);
 enabled=false;
 assert.equal((await get('/api/hydra/bridge/status')).status,403);
 assert.equal((await get('/api/hydra/draft/status')).status,200);
});

test('existing legacy Hydra index remains unchanged',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-hydra-bridge-index-'));
 const svc=new RemoteLibraryService({
  dataDir,port:0,getGames:()=>({}),saveGame:()=>true,rebuildMeta:()=>{},
  hydraDraftEnabled:()=>true,
  getHydraIndex:()=>({enabled:true,sessionStored:true,games:[{id:'game:1',title:'Demo'}],downloads:[]})
 });
 t.after(async()=>{await svc.stop();fs.rmSync(dataDir,{recursive:true,force:true})});
 await svc.configure({enabled:true,password:'An adequately long test password'});
 const base=svc.status().localUrl.slice(0,-1);
 const login=await fetch(base+'/api/login',{method:'POST',
  headers:{Origin:base,'Content-Type':'application/json'},
  body:JSON.stringify({password:'An adequately long test password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const r=await fetch(base+'/api/hydra/index?q=Demo',{headers:{Cookie:cookie}});
 assert.equal(r.status,200);
 assert.equal((await r.json()).games[0].title,'Demo');
});
