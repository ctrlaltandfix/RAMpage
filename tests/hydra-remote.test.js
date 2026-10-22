'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {HydraRemoteProvider}=require('../src/hydra-remote-provider');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-hydra-test-'));
 const dataDir=path.join(root,'RAMpage'),appData=path.join(root,'Roaming');
 const db=path.join(appData,'hydralauncher','hydra-db');
 fs.mkdirSync(db,{recursive:true});fs.writeFileSync(path.join(db,'CURRENT'),'MANIFEST-00001\n');
 const calls=[];
 const exec=(_exe,args,_opts,done)=>{
   calls.push(args);
   done(null,JSON.stringify({games:[
     {id:'hydra:steam:188',name:'Hydra Example',source:'hydra',shop:'steam',
      installed:true,platform:'Windows',cover:'https://cdn.example.org/img.jpg'},
     {id:'hydra:epic:alpha',name:'Epic in Hydra',source:'hydra',shop:'epic',installed:false,platform:null,cover:null}
   ]}),'');
 };
 const provider=new HydraRemoteProvider({dataDir,appData,readerExe:process.execPath,
   readerScript:__filename,exec});
 return {root,dataDir,appData,db,calls,provider,
   cleanup:()=>{provider.stop();fs.rmSync(root,{recursive:true,force:true});}};
}
test('Hydra remains off by default and cannot be read/exposed without opt-in',async t=>{
 const f=fixture();t.after(f.cleanup);
 assert.equal(f.provider.status().enabled,false);
 assert.equal(f.provider.status().detected,true);
 assert.deepEqual(f.provider.getGames(),{});
 await assert.rejects(f.provider.sync(),/Enable Hydra/);
 assert.equal(f.calls.length,0,'Never touch Hydra before opt-in');
});
test('Settings enable reads known local Hydra folder, and disable removes remote source immediately',async t=>{
 const f=fixture();t.after(f.cleanup);
 const state=await f.provider.configure(true);
 assert.equal(state.enabled,true);
 assert.equal(state.count,2);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0][1],f.db);
 assert.equal(f.provider.getGames()['hydra:steam:188'].name,'Hydra Example');
 const off=await f.provider.configure(false);
 assert.equal(off.enabled,false);assert.equal(off.count,0);
 assert.equal(Object.keys(f.provider.getGames()).length,0);
 await assert.rejects(f.provider.sync(),/Enable Hydra/);
});
test('remote metadata changes are RAMpage overrides, never writes to Hydra database',async t=>{
 const f=fixture();t.after(f.cleanup);
 await f.provider.configure(true);
 const game=f.provider.getGames()['hydra:steam:188'];
 game.name='Edited remotely';game.customName=true;game.favorite=true;
 game.metaEdits={description:'Safe override'};game.customArt={cover:'https://example.com/new-cover.jpg'};
 assert.equal(f.provider.save(game.id),true);
 assert.equal(JSON.parse(fs.readFileSync(f.provider.overridesPath,'utf8'))[game.id].name,'Edited remotely');
 assert.equal(fs.readFileSync(path.join(f.db,'CURRENT'),'utf8'),'MANIFEST-00001\n');
 await f.provider.configure(false);await f.provider.configure(true);
 const reread=f.provider.getGames()[game.id];
 assert.equal(reread.name,'Edited remotely');
 assert.equal(reread.meta.description,'Safe override');
 assert.equal(reread.customArt.cover,'https://example.com/new-cover.jpg');
});
test('unavailable Hydra sync does not erase existing library or disclose errors remotely',async t=>{
 const f=fixture();t.after(f.cleanup);
 await f.provider.configure(true);assert.equal(f.provider.status().count,2);
 f.provider.exec=(_e,_a,_o,done)=>done(Error('Hydra locked by other process'),'', '');
 const state=await f.provider.sync();
 assert.equal(state.count,2);
 assert.match(state.error,/close Hydra briefly/i);
 assert.equal(f.provider.getGames()['hydra:steam:188'].name,'Hydra Example');
});
test('reader sanitizes game record and omits sensitive values',async()=>{
 const readerFile=process.env.RAMPAGE_HYDRA_READER;
 assert.ok(readerFile,'RAMPAGE_HYDRA_READER required by Windows CI');
 const {toGame}=require(readerFile);
 const record=toGame({shop:'steam',objectId:'123',title:'Installed Game',
  executablePath:'C:\\Users\\Secret\\game.exe', downloadPath:'token-value',
  accessToken:'supersecret',iconUrl:'file:///C:/secret.jpg',
  playTimeInMilliseconds:7500});
 assert.equal(record.id,'hydra:steam:123');
 assert.equal(record.installed,true);
 assert.equal(record.playtimeSec,7);
 assert.ok(!JSON.stringify(record).includes('Secret'));
 assert.ok(!JSON.stringify(record).includes('token-value'));
 assert.equal(record.cover,null);
 assert.equal(toGame({shop:'steam',objectId:'123',title:'Removed',isDeleted:true}),null);
});
test('actual ClassicLevel fixture can be read with the bundled Node bridge',async t=>{
 const readerFile=process.env.RAMPAGE_HYDRA_READER;
 const executable=process.env.RAMPAGE_HYDRA_NODE;
 assert.ok(readerFile && executable);
 const {ClassicLevel}=require(path.join(path.dirname(readerFile),'node_modules','classic-level'));
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'hydra-real-level-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true,maxRetries:2}));
 const dbFolder=path.join(home,'hydra-db');
 const db=new ClassicLevel(dbFolder,{valueEncoding:'json'});
 await db.open();
 const games=db.sublevel('games',{valueEncoding:'json'});
 await games.put('steam:730',{shop:'steam',objectId:'730',title:'Counter-Strike',executablePath:'C:\\Hidden\\cs.exe'});
 await games.put('steam:999',{shop:'steam',objectId:'999',title:'Deleted',isDeleted:true});
 await db.close();
 const out=cp.execFileSync(executable,[readerFile,dbFolder],
   {env:{...process.env,RAMPAGE_HYDRA_TEST:'1'},encoding:'utf8',timeout:15000});
 const data=JSON.parse(out);
 assert.equal(data.count,1);
 assert.equal(data.games[0].id,'hydra:steam:730');
 assert.equal(data.games[0].installed,true);
 assert.ok(!out.includes('C:\\Hidden'));
 assert.ok(fs.existsSync(path.join(dbFolder,'CURRENT')));
});
