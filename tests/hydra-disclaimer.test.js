'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.env.RAMPAGE_APP_ROOT;
assert.ok(root,'RAMPAGE_APP_ROOT must point to the verified official app');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const settings=read('src/renderer/app.js');
const site=read('src/remote/index.html');
const client=read('src/remote/client.js');
const main=read('src/main.js');
const remoteService=read('src/remote-library.js');
const literal='It does not provide, download, distribute, or grant access to pirated or otherwise unauthorised games or content.';

test('Desktop Hydra Settings displays complete, specific anti-piracy disclaimer',()=>{
 assert.match(settings,/Hydra Launcher is an alternative game launcher/);
 assert.ok(settings.includes(literal));
 assert.match(settings,/id="s-hydra-disclaimer"/);
 assert.match(settings,/Hydra Launcher integration/);
 assert.match(settings,/Enable Hydra integration/);
});
test('Remote library disclaimer is accessible, starts hidden and never appears before login',()=>{
 assert.ok(site.includes(literal));
 assert.match(site,/<p id="hydra-disclaimer" role="note"[^>]+ hidden>/);
 assert.ok(site.indexOf('id="hydra-disclaimer"')>site.indexOf('id="dashboard"'));
 assert.match(client,/qs\('hydra-disclaimer'\)/);
});
test('Remote disclaimer visibility follows whether opted-in Hydra records are present',()=>{
 const match=client.match(/const hydraDisclaimer=qs\('hydra-disclaimer'\);\s*if\(hydraDisclaimer\)hydraDisclaimer\.hidden=([^;]+);/);
 assert.ok(match,'Dynamic Hydra visibility rule missing');
 const expression=match[1];
 const evaluate=games=>{
  const ctx={state:{games}};
  return vm.runInNewContext(expression,ctx);
 };
 assert.equal(evaluate([]),true);
 assert.equal(evaluate([{source:'steam'}]),true);
 assert.equal(evaluate([{source:'hydra'}]),false);
 assert.equal(evaluate([{source:'steam'},{source:'hydra'}]),false);
});
test('Existing Hydra opt-in permissions and original remote authentication are preserved',()=>{
 assert.match(main,/ipcMain\.handle\('hydra:remote-configure'/);
 assert.match(main,/ipcMain\.handle\('remote:tunnel-start'/);
 assert.match(main,/ShadPS4 foreground release result/);
 assert.match(remoteService,/this\.requireSession\(req\)/);
 assert.match(remoteService,/this\.checkOrigin\(req\)/);
 assert.match(main,/hydraRemoteProvider\.getGames\(\)/);
 assert.match(main,/hydraRemoteProvider\.save\(id\)/);
});
