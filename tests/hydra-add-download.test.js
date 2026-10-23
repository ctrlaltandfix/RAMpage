'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {cleanTitle,requireHydraEnabled,createHydraDownloadDraft,sanitizedOptions}=require('../src/hydra-download-draft');
test('Hydra draft creation requires activated desktop setting',()=>{
 assert.throws(()=>requireHydraEnabled(false),/Enable Hydra Launcher/);
 assert.throws(()=>requireHydraEnabled(undefined),/Enable Hydra Launcher/);
 assert.doesNotThrow(()=>requireHydraEnabled(true));
});
test('title validation rejects empty and overlong names',()=>{
 for(const title of ['', ' ', 'X','\nX','x'.repeat(161),null,123])
  assert.throws(()=>cleanTitle(title));
 assert.equal(cleanTitle('  Valid    legal game name '),'Valid legal game name');
});
test('placeholder has no game binaries, download commands or false installed state',()=>{
 const g=createHydraDownloadDraft('My Uninstalled Game',{now:1600000000000,random:()=>'abcdef'});
 assert.match(g.id,/^custom:hydra-download-/);
 assert.equal(g.source,'custom');assert.equal(g.installed,false);
 assert.equal(g.hydraDownloadDraft,true);
 assert.equal(g.hydraDownloadStatus,'awaiting-install');
 assert.deepEqual(g.launch,{type:'uri',target:''});
 assert.equal(g.exePath,null);assert.equal(g.installDir,null);
 assert.deepEqual(g.art,{});
 assert.equal(JSON.stringify(g).includes('magnet:?'),false);
});
test('cached availability is only safe title/count projection and not actual download link',()=>{
 const data=sanitizedOptions({sessionStored:true,games:[
  {title:'Test Game',newOptionsCount:4,installed:false,downloadUrl:'https://secret.example/',uri:'magnet:?xt=SECRET'},
  {title:'Other Game',newOptionsCount:9,installed:false}]},'Test Game');
 assert.equal(data.matches.length,1);
 assert.equal(data.matches[0].newOptionsCount,4);
 assert.equal(JSON.stringify(data).includes('secret'),false);
 assert.equal(JSON.stringify(data).includes('magnet:'),false);
 assert.equal(sanitizedOptions({sessionStored:false,games:[{title:'Test Game'}]},'Test Game').matches.length,0);
});
test('packaged RAMpage only exposes actions through desktop IPC, and checks opt-in on every call',()=>{
 const root=process.env.RAMPAGE_APP_ROOT;assert.ok(root);
 const get=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
 const main=get('main.js'),preload=get('preload.js'),renderer=get('renderer/app.js'),server=get('remote-library.js');
 assert.match(main,/ipcMain\.handle\('hydra:draft-create'/);
 assert.match(main,/ipcMain\.handle\('hydra:draft-options'/);
 assert.match(main,/ipcMain\.handle\('hydra:draft-open'/);
 const handlers=main.slice(main.indexOf("ipcMain.handle('hydra:draft-create'"),main.indexOf("ipcMain.handle('game:openFolder'"));
 assert.equal((handlers.match(/requireHydraEnabled\(hydraRemoteProvider\.status\(\)\.enabled\)/g)||[]).length,3);
 assert.match(handlers,/storage\.verifyGameOnDisk/);
 assert.match(handlers,/clipboard\.writeText\(game\.name\)/);
 assert.match(handlers,/shell\.openExternal\('hydralauncher:\/\/'\)/);
 assert.match(preload,/createHydraDownloadDraft/);
 assert.match(renderer,/WIZ\.hydraEnabled/);
 assert.match(renderer,/data-wiz='hydra-download'|dataset\.wiz='hydra-download'/);
 assert.match(renderer,/Open Hydra available downloads/);
 assert.match(renderer,/g\.hydraDownloadDraft && g\.installed === false/);
 assert.doesNotMatch(server,/hydra:draft-create|hydra:draft-open|\/api\/hydra\/start-download/);
});
test('Hydra metadata disclaimer, existing remote index and ShadPS4 remain intact',()=>{
 const root=process.env.RAMPAGE_APP_ROOT;assert.ok(root);
 const get=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
 const main=get('main.js'),renderer=get('renderer/app.js'),remote=get('remote-library.js');
 assert.match(main,/ShadPS4 foreground release result/);
 assert.match(main,/ipcMain\.handle\('hydra:remote-configure'/);
 assert.match(main,/ipcMain\.handle\('remote:tunnel-start'/);
 assert.match(remote,/this\.requireSession\(req\)/);
 assert.match(remote,/this\.checkOrigin\(req\)/);
 assert.match(remote,/pathname==='\/api\/hydra\/index'/);
 assert.match(renderer,/Hydra Launcher is an alternative game launcher/);
});
