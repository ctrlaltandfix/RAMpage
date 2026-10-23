'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=process.env.RAMPAGE_APP_ROOT;
if(!root)throw Error('RAMPAGE_APP_ROOT must be the unpacked official RAMpage app');
const {RemoteLibraryService}=require(path.join(root,'src','remote-library.js'));
const {cleanTitle,requireHydraEnabled,createHydraDownloadDraft,sanitizedOptions}=
 require(path.join(root,'src','hydra-download-draft.js'));

async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-web-hydra-'));
 const games={};let enabled=false,saves=0,creations=0;
 const svc=new RemoteLibraryService({
  dataDir:dir,port:0,getGames:()=>games,saveGame:(id)=>{
    saves++;fs.mkdirSync(path.join(dir,'game-journal'),{recursive:true});
    fs.writeFileSync(path.join(dir,'game-journal',id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json'),JSON.stringify(games[id]));return true;
  },rebuildMeta:()=>{},publish:()=>{},
  hydraDraftEnabled:()=>enabled,
  createHydraDraft:(title)=>{
    requireHydraEnabled(enabled);const name=cleanTitle(title);
    const existing=Object.values(games).find(g=>g.hydraDownloadDraft&&g.name.toLowerCase()===name.toLowerCase()&&!g.installed);
    if(existing)return {ok:true,created:false,id:existing.id};
    const draft=createHydraDownloadDraft(name);games[draft.id]=draft;
    svc.saveGame(draft.id);creations++;return {ok:true,created:true,id:draft.id};
  },
  getHydraDraftOptions:term=>sanitizedOptions({sessionStored:true,games:[{title:'Sample Game',newOptionsCount:2,
    magnet:'magnet:?xt=SECRET',token:'SECRET_ACCESS_TOKEN',downloadUrl:'https://SECRET.example/'}]},term),
 });
 t.after(async()=>{await svc.stop();fs.rmSync(dir,{recursive:true,force:true});});
 await svc.configure({enabled:true,password:'A sufficiently long unique web library password'});
 const base=svc.status().localUrl.slice(0,-1),origin=base;
 function http(route,{method='GET',body,headers={}}={}){
   return fetch(base+route,{method,headers:{
     ...(body===undefined?{}:{'Content-Type':'application/json'}),
     ...headers},body:body===undefined?undefined:JSON.stringify(body)});
 }
 const login=await http('/api/login',{method:'POST',body:{password:'A sufficiently long unique web library password'},
    headers:{origin}});
 assert.equal(login.status,200);
 const data=await login.json();
 const cookie=login.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookie,/^rampage_session=/);
 const auth={Cookie:cookie,Origin:origin,'X-Rampage-CSRF':data.csrf};
 return {svc,base,origin,cookie,auth,http,games,enable:v=>enabled=v,metrics:()=>({saves,creations}),dir};
}
test('Authentication and opt-in are both required before showing or creating Hydra drafts',async t=>{
 const f=await fixture(t);
 assert.equal((await f.http('/api/hydra/draft/status')).status,401,'anonymous web visitor cannot query Hydra');
 assert.equal((await f.http('/api/hydra/draft',{method:'POST',body:{title:'Sample Game'}})).status,401,'anonymous web visitor cannot mutate library');
 const s=await f.http('/api/hydra/draft/status',{headers:{Cookie:f.cookie}});
 assert.deepEqual(await s.json(),{enabled:false});
 let response=await f.http('/api/hydra/draft',{method:'POST',body:{title:'Sample Game'},headers:f.auth});
 assert.equal(response.status,403,'desktop opt-in required');
 assert.deepEqual(f.metrics(),{saves:0,creations:0});
 f.enable(true);
 response=await f.http('/api/hydra/draft/status',{headers:{Cookie:f.cookie}});
 assert.equal((await response.json()).enabled,true);
 const options=await f.http('/api/hydra/draft/options?q=Sample%20Game',{headers:{Cookie:f.cookie}});
 assert.equal(options.status,200);const sanitized=await options.json();
 assert.equal(sanitized.matches[0].newOptionsCount,2);
 assert.equal(JSON.stringify(sanitized).includes('SECRET'),false);
});
test('CSRF and origin protections prevent cross-site remote game creation',async t=>{
 const f=await fixture(t);f.enable(true);
 const noCsrf=await f.http('/api/hydra/draft',{method:'POST',body:{title:'Sample Game'},
   headers:{Cookie:f.cookie,Origin:f.origin}});
 assert.equal(noCsrf.status,403);
 const noOrigin=await f.http('/api/hydra/draft',{method:'POST',body:{title:'Sample Game'},
   headers:{Cookie:f.cookie,'X-Rampage-CSRF':f.auth['X-Rampage-CSRF']}});
 assert.equal(noOrigin.status,403);
 const wrongOrigin=await f.http('/api/hydra/draft',{method:'POST',body:{title:'Sample Game'},
   headers:{...f.auth,Origin:'https://outside.example'}});
 assert.equal(wrongOrigin.status,403);
 assert.equal(f.metrics().creations,0);
});
test('Authorized remote draft persists as Not installed, deduplicates, and syncs with normal games endpoint',async t=>{
 const f=await fixture(t);f.enable(true);
 let response=await f.http('/api/hydra/draft',{method:'POST',body:{title:'  Sample  Game '},headers:f.auth});
 assert.equal(response.status,201);
 const result=await response.json();
 assert.equal(result.created,true);
 assert.equal(result.game.installed,false);
 assert.equal(result.game.hydraDownloadDraft,true);
 assert.equal(result.game.name,'Sample Game');
 assert.equal(f.games[result.game.id].launch.target,'');
 const disk=fs.readdirSync(path.join(f.dir,'game-journal'));
 assert.equal(disk.length,1);
 response=await f.http('/api/hydra/draft',{method:'POST',body:{title:'sample game'},headers:f.auth});
 assert.equal(response.status,200);
 const duplicate=await response.json();assert.equal(duplicate.created,false);
 assert.equal(duplicate.game.id,result.game.id);
 assert.equal(f.metrics().creations,1);
 const listing=await f.http('/api/games',{headers:{Cookie:f.cookie}});
 const games=(await listing.json()).games;
 assert.equal(games.length,1);assert.equal(games[0].installed,false);
 f.enable(false);
 assert.equal((await f.http('/api/hydra/draft',{method:'POST',body:{title:'Another Game'},headers:f.auth})).status,403);
 assert.equal(f.metrics().creations,1);
});
test('Validates bounded input and limits bulk web draft creation per authenticated session',async t=>{
 const f=await fixture(t);f.enable(true);
 for(const invalid of ['', 'X', 'X'.repeat(161),'\nA']){
   const response=await f.http('/api/hydra/draft',{method:'POST',body:{title:invalid},headers:f.auth});
   assert.equal(response.status,400);
 }
 for(let i=0;i<12;i++){
   const res=await f.http('/api/hydra/draft',{method:'POST',body:{title:'Game '+String(i)},headers:f.auth});
   assert.equal(res.status,201);
 }
 assert.equal((await f.http('/api/hydra/draft',{method:'POST',body:{title:'Game 13'},headers:f.auth})).status,429);
 assert.equal(f.metrics().creations,12);
});
test('Public site cannot start Hydra, access files, or create drafts without explicit user submit',()=>{
 const server=fs.readFileSync(path.join(root,'src','remote-library.js'),'utf8');
 const js=fs.readFileSync(path.join(root,'src','remote','client.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'src','remote','index.html'),'utf8');
 const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');
 assert.match(server,/const session=this\.requireSession\(req\)/);
 assert.ok(server.indexOf("pathname==='/api/hydra/draft'")>server.indexOf('const session=this.requireSession(req)'));
 assert.match(server,/this\.checkOrigin\(req\)/);assert.match(server,/session\.hydraDraftTimes/);
 assert.match(server,/this\.hydraDraftEnabled\(\)/);
 assert.doesNotMatch(server,/hydra:draft-open|shell\.openExternal|clipboard\.writeText|startGameDownload/);
 assert.match(main,/createHydraDownloadDraftInLibrary/);
 assert.match(main,/ipcMain\.handle\('hydra:draft-create'/);
 assert.match(main,/hydraDraftEnabled: \(\) => hydraRemoteProvider\.status\(\)\.enabled===true/);
 assert.match(js,/refreshHydraDraftStatus/);
 assert.match(js,/submitHydraDraft/);
 assert.match(html,/id="hydra-draft-modal"/);
 assert.match(html,/id="hydra-add-download" hidden/);
 assert.match(html,/RAMpage does not download files or control Hydra remotely/);
});
