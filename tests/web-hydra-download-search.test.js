'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=process.env.RAMPAGE_APP_ROOT;
if(!root)throw Error('RAMPAGE_APP_ROOT must refer to patched official app');
const read=p=>fs.readFileSync(path.join(root,'src',p),'utf8');
const {RemoteLibraryService}=require(path.join(root,'src','remote-library.js'));
test('Only user-added, uninstalled Hydra entries expose game-level web search tools',()=>{
 const client=read('remote/client.js'),html=read('remote/index.html');
 assert.match(html,/<section id="hydra-game-tools" hidden/);
 assert.match(html,/id="hydra-game-search"/);
 assert.match(html,/id="hydra-game-status"/);
 assert.match(html,/id="hydra-game-steps"/);
 assert.match(html,/id="hydra-game-copy"/);
 assert.match(client,/hydraDraftEnabled && g\.hydraDownloadDraft===true && g\.installed===false/);
 assert.match(client,/function currentHydraDraft\(\)/);
 assert.match(client,/hydraDraftEnabled && g\?\.hydraDownloadDraft===true && g\.installed===false/);
 assert.match(client,/qs\('hydra-draft-search'\)\.onclick=searchNewHydraDraft/);
 assert.match(client,/qs\('hydra-draft-search'\)\.hidden=false/);
 assert.match(client,/openEditor\(id\)/);
});
test('Search only reads existing authenticated Hydra local index, never claims online downloads',()=>{
 const client=read('remote/client.js');
 const code=client.slice(client.indexOf('async function fetchHydraDownloads()'),client.indexOf('async function init(){'));
 assert.match(code,/call\('\/api\/hydra\/index\?q='/);
 assert.match(code,/response\.games\|\|\[\]/);
 assert.match(code,/response\.downloads\|\|\[\]/);
 assert.match(code,/newOptionsCount/);
 assert.match(code,/No locally cached matching downloads/);
 assert.match(code,/not a live installer control/);
 assert.match(code,/nothing starts remotely from RAMpage/);
 assert.doesNotMatch(code,/shell\.openExternal|execFile|spawn\(|magnet:\?|startGameDownload/);
 assert.doesNotMatch(code,/\.innerHTML|eval\(|new Function\(/);
 assert.match(code,/text\(li,/);
});
test('Authenticated and signed-in state is required for existing Hydra index endpoint',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-hydra-web-search-'));
 let enabled=true;
 const svc=new RemoteLibraryService({dataDir,port:0,
  getGames:()=>({'custom:hydra-demo':{id:'custom:hydra-demo',source:'custom',
   name:'Sample Game',installed:false,hydraDownloadDraft:true,art:{}}}),
  saveGame:()=>true,rebuildMeta:()=>{},
  getHydraIndex:query=>({
    enabled,sessionStored:enabled,sourceCount:1,lastSync:'2026-10-23T00:00:00Z',
    games:enabled&&'Sample Game'.toLowerCase().includes(query.toLowerCase())?
      [{id:'hydra:steam:1',title:'Sample Game',installed:false,newOptionsCount:2}]:[],
    downloads:enabled?[{id:'hydra:steam:1',title:'Sample Game',status:'downloading',progress:45}]:[]
  })
 });
 t.after(async()=>{await svc.stop();fs.rmSync(dataDir,{recursive:true,force:true});});
 await svc.configure({enabled:true,password:'An adequately long library password'});
 const base=svc.status().localUrl.slice(0,-1);
 const anon=await fetch(base+'/api/hydra/index?q=Sample');
 assert.equal(anon.status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
  body:JSON.stringify({password:'An adequately long library password'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const query=await fetch(base+'/api/hydra/index?q=Sample',{headers:{Cookie:cookie}});
 assert.equal(query.status,200);
 const body=await query.json();
 assert.equal(body.games[0].newOptionsCount,2);
 assert.equal(body.downloads[0].progress,45);
 assert.equal(body.games[0].title,'Sample Game');
 enabled=false;
 const disabled=await fetch(base+'/api/hydra/index?q=Sample',{headers:{Cookie:cookie}});
 assert.equal((await disabled.json()).enabled,false);
});
test('Installer controls remain inside Hydra, never executed through RAMpage web endpoints',()=>{
 const html=read('remote/index.html'),client=read('remote/client.js'),server=read('remote-library.js'),main=read('main.js');
 assert.match(html,/RAMpage does not download files or control Hydra remotely/);
 assert.match(html,/id="hydra-game-tools" hidden/);
 assert.match(client,/Installation cannot be initiated by this web app/);
 assert.match(client,/Use Hydra’s own download\/installer controls/);
 assert.match(main,/ipcMain\.handle\('hydra:draft-create'/);
 assert.match(main,/ShadPS4 foreground release result/);
 assert.match(server,/this\.requireSession\(req\)/);
 assert.match(server,/this\.checkOrigin\(req\)/);
 assert.match(server,/pathname==='\/api\/hydra\/draft'/);
 assert.doesNotMatch(server,/shell\.openExternal|startGameDownload|execFile\(/);
});
