'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createHydraCompanionClient}=require('./companion-client');

test('companion refuses public hosts, redirect URLs and short keys',()=>{
 for(const url of ['http://localhost:7999','https://127.0.0.1:7999',
  'http://192.168.1.5:7999','http://127.0.0.1:7999/open','http://127.0.0.1:7999?x=1']){
   assert.throws(()=>createHydraCompanionClient({baseUrl:url,token:'a'.repeat(48)}),{code:'INVALID_INPUT'});
 }
 assert.throws(()=>createHydraCompanionClient({baseUrl:'http://127.0.0.1:7999',token:'short'}),{code:'INVALID_INPUT'});
});

test('companion pairing and allowlisted operations use loopback auth only',async t=>{
 const operations=[];
 const server=http.createServer(async(req,res)=>{
   assert.equal(req.headers.authorization,'Bearer '+'a'.repeat(48));
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
   operations.push([req.method,req.url,body]);
   const response=req.url==='/v1/status'?{protocol:'rampage-hydra-v1',ready:true,userApproved:true}:
     req.url==='/v1/games/search'?{games:[{id:'game:1',title:'Test Game',optionCount:1}]}:
     req.url==='/v1/games/options'?{options:[{id:'opt:1',title:'Demo package'}]}:
     req.url==='/v1/downloaders'?{downloaders:[{id:'direct',label:'Direct',available:true,configured:true}],availableBytes:999}:
     req.url==='/v1/downloads'?{downloads:[{id:'job:1',state:'paused',progress:35}]}:
     {accepted:true,localApproved:true};
   res.setHeader('Content-Type','application/json');
   res.end(JSON.stringify(response));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port;
 const client=createHydraCompanionClient({baseUrl:'http://127.0.0.1:'+port,token:'a'.repeat(48)});
 assert.equal(await client.ping(),true);
 assert.equal((await client.search({title:'Test'}))[0].title,'Test Game');
 assert.equal((await client.options({gameId:'game:1'}))[0].id,'opt:1');
 assert.equal((await client.downloaders({gameId:'game:1',optionId:'opt:1'})).availableBytes,999);
 assert.equal((await client.downloads())[0].progress,35);
 assert.deepEqual(await client.command({action:'pause',gameId:'game:1',downloadId:'job:1'}),{accepted:true});
 assert.equal(operations[5][1],'/v1/downloads/command');
 await assert.rejects(client.command({action:'runExe',gameId:'game:1'}),{code:'INVALID_INPUT'});
});

test('unapproved companion fails pairing without accepting commands',async t=>{
 const server=http.createServer((_req,res)=>res.end(JSON.stringify({
   protocol:'rampage-hydra-v1',ready:true,userApproved:false
 })));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const client=createHydraCompanionClient({baseUrl:'http://127.0.0.1:'+server.address().port,token:'b'.repeat(48)});
 assert.equal(await client.ping(),false);
});
