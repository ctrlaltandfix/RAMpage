'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const root=process.env.RAMPAGE_APP_ROOT;if(!root)throw Error('Set RAMPAGE_APP_ROOT to the extracted app');
const {RemoteLibraryService}=require(path.join(root,'src/remote-library'));
const {RemoteQuickTunnel}=require(path.join(root,'src/remote-quick-tunnel'));
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rampage-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('metadata saves without artwork or website, and accepts HTTP links',t=>{
 const dir=fixture(t),g={id:'test',name:'Test',_u:0,meta:{}};
 const service=new RemoteLibraryService({dataDir:dir,getGames:()=>({test:g}),saveGame:()=>true,rebuildMeta:()=>{}});
 assert.doesNotThrow(()=>service.edit('test',{updatedAt:0,patch:{notes:'No artwork needed'}}));
 assert.doesNotThrow(()=>service.edit('test',{updatedAt:g._u||0,patch:{website:'',coverUrl:''}}));
 assert.doesNotThrow(()=>service.edit('test',{updatedAt:g._u||0,patch:{website:'http://example.com/',coverUrl:'http://example.com/cover.jpg'}}));
 for(const value of ['javascript:alert(1)','file:///secret','https://user:pass@example.com'])assert.throws(()=>service.edit('test',{updatedAt:g._u||0,patch:{website:value}}),/HTTP or HTTPS/);
});
test('local HTTP address and authentication survive service recreation',async t=>{
 const dir=fixture(t),opts={dataDir:dir,getGames:()=>({}),saveGame:()=>true,rebuildMeta:()=>{}};
 const a=new RemoteLibraryService(opts);await a.configure({enabled:true,password:'a long test password 123'});
 const url=a.status().localUrl;await a.stop();
 const b=new RemoteLibraryService(opts);await b.start();t.after(()=>b.stop());
 assert.equal(b.status().localUrl,url);assert.equal(url,'http://127.0.0.1:43681/');assert(b.verifyPassword('a long test password 123'));
});
test('named tunnel keeps hostname and reconnect preference across restarts, explicit stop disables reconnect',async t=>{
 const dir=fixture(t),exe=path.join(dir,'cloudflared.exe'),config=path.join(dir,'config.yml');fs.writeFileSync(exe,'');fs.writeFileSync(config,'tunnel: example');
 let args;const spawnProcess=(_exe,a)=>{args=a;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};setImmediate(()=>child.stderr.emit('data','Registered tunnel connection'));return child;};
 const opts={exePath:exe,dataDir:dir,getLocalUrl:()=> 'http://127.0.0.1:43681/',spawnProcess};
 const first=new RemoteQuickTunnel(opts);first.configure({configPath:config,publicUrl:'https://games.example.com'});
 await first.start();assert.equal(first.status().url,'https://games.example.com');assert(args.includes(config));assert(!args.includes('--url'));first.stop({preserve:true});
 const second=new RemoteQuickTunnel(opts);assert(second.status().autoStart);await second.start();assert.equal(second.status().url,'https://games.example.com');second.stop();
 assert.equal(new RemoteQuickTunnel(opts).status().autoStart,false);
 assert.throws(()=>second.configure({configPath:config,publicUrl:'https://temporary.trycloudflare.com'}));
});
