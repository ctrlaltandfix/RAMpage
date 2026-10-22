'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const path=require('node:path');
const {RemoteQuickTunnel}=require('../src/remote-quick-tunnel');
function fixture(local='http://127.0.0.1:43681/'){
 const attempts=[],processes=[];
 const spawnProcess=(bin,args,opts)=>{
   attempts.push({bin,args,opts});
   const child=new EventEmitter();
   child.stdout=new EventEmitter();child.stderr=new EventEmitter();
   child.killed=false;child.kill=()=>{child.killed=true;child.emit('exit',0);return true};
   processes.push(child);return child;
 };
 const tunnel=new RemoteQuickTunnel({exePath:process.execPath,spawnProcess,getLocalUrl:()=>local,timeoutMs:1000});
 return {tunnel,attempts,processes};
}
test('never exposes service before the password-protected localhost listener exists',async()=>{
 const f=fixture(null);
 await assert.rejects(f.tunnel.start(),/Enable the password-protected/);
 assert.equal(f.attempts.length,0);
});
test('rejects non-loopback origin service, never directs tunnel at LAN address',async()=>{
 const f=fixture('http://0.0.0.0:43681/');
 await assert.rejects(f.tunnel.start(),/Enable the password-protected/);
 assert.equal(f.attempts.length,0);
});
test('only launches bundled tunnel binary with localhost URL, no user shell',async()=>{
 const f=fixture(); const pending=f.tunnel.start();
 assert.equal(f.attempts.length,1);
 assert.equal(f.attempts[0].bin,process.execPath);
 assert.deepEqual(f.attempts[0].args,['tunnel','--no-autoupdate','--url','http://127.0.0.1:43681']);
 assert.equal(f.attempts[0].opts.windowsHide,true);
 f.processes[0].stderr.emit('data','Created temporary tunnel at https://lunar-');
 f.processes[0].stderr.emit('data','arcade-forest.trycloudflare.com\n');
 const state=await pending;
 assert.equal(state.url,'https://lunar-arcade-forest.trycloudflare.com');
 assert.equal(state.connected,true);
 const duplicate=await f.tunnel.start();
 assert.equal(duplicate.url,state.url);
 assert.equal(f.attempts.length,1,'Start is idempotent; no duplicate public processes');
 f.tunnel.stop();
 assert.equal(f.processes[0].killed,true);
 assert.equal(f.tunnel.status().url,null);
});
test('ignores generic links and accepts only Cloudflare temporary hostnames',async()=>{
 const f=fixture();const pending=f.tunnel.start();
 f.processes[0].stderr.emit('data','https://malicious.example/ https://fake.trycloudflare.com.evil.test\n');
 assert.equal(f.tunnel.status().url,null,'Do not treat non-Cloudflare domains as a sharing URL');
 f.processes[0].stderr.emit('data','Your quick tunnel: https://winter-otter.trycloudflare.com\n');
 const s=await pending;
 assert.equal(s.url,'https://winter-otter.trycloudflare.com');
 f.tunnel.stop();
});
test('tunnel exits, invalidates previous URL and does not self-restart',async()=>{
 const f=fixture();const started=f.tunnel.start();
 f.processes[0].stderr.emit('data','https://silver-lamp.trycloudflare.com\n');
 await started;
 f.processes[0].emit('exit',1);
 assert.equal(f.tunnel.status().connected,false);
 assert.equal(f.tunnel.status().url,null);
 assert.equal(f.attempts.length,1);
});
test('missing bundled binary and early exit surface actionable errors',async()=>{
 const bad=new RemoteQuickTunnel({exePath:path.join(process.cwd(),'definitely-missing-cloudflared.exe'),getLocalUrl:()=> 'http://127.0.0.1:43681/'});
 await assert.rejects(bad.start(),/component missing/i);
 const f=fixture();const pending=f.tunnel.start();f.processes[0].emit('exit',4);
 await assert.rejects(pending,/exited before its URL was ready/);
 assert.equal(f.tunnel.status().connected,false);
});
test('new feature never replaces scrypt/password validation or existing remote game editing',()=>{
 const fs=require('node:fs');
 const src=fs.readFileSync(path.join(__dirname,'../src/remote-library.js'),'utf8');
 assert.match(src,/scryptSync/);
 assert.match(src,/this\.checkOrigin\(req\)/);
 assert.match(src,/this\.requireSession\(req\)/);
 assert.match(src,/saveGame\(id\)/);
 assert.match(src,/server\.listen\(this\.port,'127\.0\.0\.1'/);
});
