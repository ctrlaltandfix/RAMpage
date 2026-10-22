'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const {RemoteLibraryService}=require('../src/remote-library');

function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-remote-test-'));
  let saves=0;let publishes=0;
  const games={
    'steam:123':{id:'steam:123',name:'Test Game',source:'steam',installed:true,exePath:'C:\\Sensitive\\game.exe',
      launch:{target:'my-personal-token'}, meta:{description:'Original description',genres:['RPG']},art:{cover:'https://example.com/cover.jpg'},
      metaBase:{description:'Original description',genres:['RPG']},notes:'original',favorite:false,_u:1000},
    'custom:ps4':{id:'custom:ps4',name:'Console game',source:'custom',systemName:'PlayStation 4',installed:true,meta:null,art:{},_u:1500}
  };
  const srv=new RemoteLibraryService({dataDir:dir,port:0,getGames:()=>games,
    saveGame:id=>{saves++;games[id]._u=Date.now();return true;},publish:()=>publishes++,
    rebuildMeta:g=>{g.meta={...(g.metaBase||{title:g.name}),...(g.metaEdits||{})};g.metaStatus='ok'} });
  return {dir,games,srv,counters:()=>({saves,publishes})};
}
async function request(root,path,options={}){
  const res=await fetch(root.replace(/\/$/, '')+path,options);
  let json=null;try{json=await res.json()}catch{}
  return {res,json};
}
async function login(url,password){
  const {res,json}=await request(url,'/api/login',{method:'POST',headers:{Origin:url.slice(0,-1),'Content-Type':'application/json'},body:JSON.stringify({password})});
  return {status:res.status,json,cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
test('server stays disabled without password and binds ONLY loopback after opt-in',async t=>{
  const f=fixture();t.after(async()=>{await f.srv.stop();fs.rmSync(f.dir,{recursive:true,force:true})});
  assert.equal(f.srv.status().enabled,false);
  await assert.rejects(()=>f.srv.configure({enabled:true}),/password/i);
  await assert.rejects(()=>f.srv.configure({enabled:true,password:'too short'}),/16 characters/);
  await f.srv.configure({enabled:true,password:'Strong-local-only-password-example-123'});
  const st=f.srv.status();assert.equal(st.enabled,true);assert.ok(st.localUrl.startsWith('http://127.0.0.1:'));
  assert.equal(f.srv.server.address().address,'127.0.0.1');
  const auth=JSON.parse(fs.readFileSync(f.srv.file,'utf8'));
  assert.ok(!JSON.stringify(auth).includes('Strong-local-only-password-example-123'));
  assert.equal(auth.enabled,true);
  await f.srv.stop();assert.equal(f.srv.status().enabled,false);
});
test('anonymous clients cannot list, view paths, or write library',async t=>{
  const f=fixture();t.after(async()=>{await f.srv.stop();fs.rmSync(f.dir,{recursive:true,force:true})});
  await f.srv.configure({enabled:true,password:'Strong-local-only-password-example-123'});
  const root=f.srv.status().localUrl;
  assert.equal((await request(root,'/api/games')).res.status,401);
  assert.equal((await request(root,'/api/game/steam%3A123',{method:'POST',headers:{Origin:root.slice(0,-1),'Content-Type':'application/json'},body:'{}'})).res.status,401);
  const html=await fetch(root);assert.equal(html.status,200);assert.match(await html.text(),/Your games, wherever you are/);
  assert.equal((await request(root,'/etc/passwd')).res.status,401);
  assert.equal(f.counters().saves,0);
});
test('login cookie + CSRF required; valid metadata writes preserve local paths and Steam custom edits',async t=>{
  const f=fixture();t.after(async()=>{await f.srv.stop();fs.rmSync(f.dir,{recursive:true,force:true})});
  await f.srv.configure({enabled:true,password:'Strong-local-only-password-example-123'});
  const url=f.srv.status().localUrl;
  const x=await login(url,'Strong-local-only-password-example-123');assert.equal(x.status,200);
  assert.match(x.cookie,/^rampage_session=[a-f0-9]{64}$/);
  const read=await request(url,'/api/games',{headers:{cookie:x.cookie}});
  assert.equal(read.res.status,200);assert.equal(read.json.games.length,2);
  assert.equal(JSON.stringify(read.json).includes('Sensitive'),false);
  assert.equal(JSON.stringify(read.json).includes('my-personal-token'),false);
  const game=read.json.games.find(g=>g.id==='steam:123');
  const data={updatedAt:game.updatedAt,patch:{name:'Renamed game',description:'My remote description',genres:['Adventure','Co-op'],favorite:true,coverUrl:'https://example.com/new-cover.png',notes:'Works great'}};
  const endpoint='/api/game/'+encodeURIComponent(game.id);
  const headers={Origin:url.slice(0,-1),'Content-Type':'application/json','Cookie':x.cookie};
  assert.equal((await request(url,endpoint,{method:'POST',headers,body:JSON.stringify(data)})).res.status,403);
  assert.equal((await request(url,endpoint,{method:'POST',headers:{...headers,'X-Rampage-CSRF':x.json.csrf,Origin:'https://evil.example'},body:JSON.stringify(data)})).res.status,403);
  const valid=await request(url,endpoint,{method:'POST',headers:{...headers,'X-Rampage-CSRF':x.json.csrf},body:JSON.stringify(data)});
  assert.equal(valid.res.status,200);
  assert.equal(valid.json.game.name,'Renamed game');
  assert.equal(f.games[game.id].meta.description,'My remote description');
  assert.deepEqual(f.games[game.id].meta.genres,['Adventure','Co-op']);
  assert.equal(f.games[game.id].exePath,'C:\\Sensitive\\game.exe');
  assert.equal(f.games[game.id].launch.target,'my-personal-token');
  assert.equal(f.counters().saves,1);assert.equal(f.counters().publishes,1);
  assert.equal((await request(url,endpoint,{method:'POST',headers:{...headers,'X-Rampage-CSRF':x.json.csrf},body:JSON.stringify(data)})).res.status,409);
});
test('malicious executable changes and non-HTTPS URLs rejected without mutation',async t=>{
  const f=fixture();t.after(async()=>{await f.srv.stop();fs.rmSync(f.dir,{recursive:true,force:true})});
  await f.srv.configure({enabled:true,password:'Strong-local-only-password-example-123'});
  const url=f.srv.status().localUrl;
  const x=await login(url,'Strong-local-only-password-example-123');
  const headers={Origin:url.slice(0,-1),'Content-Type':'application/json',cookie:x.cookie,'X-Rampage-CSRF':x.json.csrf};
  const endpoint='/api/game/'+encodeURIComponent('steam:123');
  for(const patch of [{launch:{target:'calc.exe'}},{website:'javascript:alert(1)'},{name:''},{coverUrl:'file:///C:/private.txt'},{genres:Array(50).fill('x')}] ){
    const q=await request(url,endpoint,{method:'POST',headers,body:JSON.stringify({updatedAt:1000,patch})});
    assert.equal(q.res.status,400,JSON.stringify(patch));
  }
  assert.equal(f.games['steam:123'].name,'Test Game');assert.equal(f.counters().saves,0);
});
test('password rotation revokes sessions and disabled server is unreachable',async t=>{
  const f=fixture();t.after(async()=>{await f.srv.stop();fs.rmSync(f.dir,{recursive:true,force:true})});
  await f.srv.configure({enabled:true,password:'Strong-local-only-password-example-123'});
  const url=f.srv.status().localUrl;
  const x=await login(url,'Strong-local-only-password-example-123');
  await f.srv.configure({enabled:true,password:'New-strong-password-more-than-16'});
  assert.equal((await request(url,'/api/games',{headers:{cookie:x.cookie}})).res.status,401);
  await f.srv.configure({enabled:false});
  assert.equal(f.srv.status().enabled,false);assert.equal(JSON.parse(fs.readFileSync(f.srv.file,'utf8')).enabled,false);
});
