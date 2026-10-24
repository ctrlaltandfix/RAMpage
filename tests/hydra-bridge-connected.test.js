"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const http=require("node:http"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const root=process.env.RAMPAGE_APP_ROOT;
if(!root)throw Error("Patched packaged RAMpage app required");
const {RemoteLibraryService}=require(path.join(root,"src","remote-library.js"));
test("real RAMpage authenticated server connects to explicitly paired local companion and gates each job",async t=>{
 const token=crypto.randomBytes(32).toString("base64url");
 let approved=true,hydraEnabled=true;const called=[];
 const mock=http.createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,"Bearer "+token);
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const data=chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):null;
  called.push({pathname:req.url,payload:data});
  const response=req.url==="/v1/status"?{protocol:"rampage-hydra-v1",ready:true,userApproved:true}:
    req.url==="/v1/games/options"?{options:[{id:"option:1",title:"Official demo archive",source:"Publisher",sizeBytes:2000,publishedAt:"2026-10-20",uri:"private"}]}:
    req.url==="/v1/downloaders"?{downloaders:[{id:"direct",label:"Direct",available:true,configured:true}],availableBytes:90000,destinationLabel:"C:\\Private\\Files"}:
    req.url==="/v1/downloads"?{downloads:[{id:"job:1",gameId:"game:1",title:"Demo",state:"paused",progress:50,downloadedBytes:1000,totalBytes:2000,speedBytesPerSecond:100,etaSeconds:10,path:"private"}]}:
    req.url==="/v1/downloads/command"?{accepted:true,localApproved:approved}:
    {games:[{id:"game:1",title:"Demo",optionCount:1}]};
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify(response));
 });
 await new Promise(resolve=>mock.listen(0,"127.0.0.1",resolve));
 t.after(()=>new Promise(resolve=>mock.close(resolve)));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rampage-hydra-connected-"));
 const previous={
  enabled:process.env.RAMPAGE_HYDRA_COMPANION_DEV_ENABLED,
  port:process.env.RAMPAGE_HYDRA_COMPANION_DEV_PORT,
  token:process.env.RAMPAGE_HYDRA_COMPANION_DEV_TOKEN
 };
 process.env.RAMPAGE_HYDRA_COMPANION_DEV_ENABLED="1";
 process.env.RAMPAGE_HYDRA_COMPANION_DEV_PORT=String(mock.address().port);
 process.env.RAMPAGE_HYDRA_COMPANION_DEV_TOKEN=token;
 const svc=new RemoteLibraryService({
  dataDir:dir,port:0,hydraDraftEnabled:()=>hydraEnabled,
  getGames:()=>({"game:1":{id:"game:1",name:"Demo",source:"custom",installed:false,hydraDownloadDraft:true,art:{}}}),
  saveGame:()=>true,rebuildMeta:()=>{},
 });
 t.after(async()=>{
  await svc.stop();fs.rmSync(dir,{recursive:true,force:true});
  for(const [k,v] of Object.entries({RAMPAGE_HYDRA_COMPANION_DEV_ENABLED:previous.enabled,
   RAMPAGE_HYDRA_COMPANION_DEV_PORT:previous.port,RAMPAGE_HYDRA_COMPANION_DEV_TOKEN:previous.token})){
    if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 });
 await svc.configure({enabled:true,password:"Secure private library testing password"});
 const base=svc.status().localUrl.slice(0,-1);
 const login=await fetch(base+"/api/login",{method:"POST",
   headers:{Origin:base,"Content-Type":"application/json"},
   body:JSON.stringify({password:"Secure private library testing password"})});
 assert.equal(login.status,200);
 const cookie=login.headers.get("set-cookie").split(";")[0];
 const csrf=(await login.json()).csrf;
 const get=async suffix=>fetch(base+suffix,{headers:{Cookie:cookie}});
 const post=async(suffix,body)=>fetch(base+suffix,{method:"POST",
  headers:{Cookie:cookie,Origin:base,"Content-Type":"application/json","X-Rampage-CSRF":csrf},
  body:JSON.stringify(body)});
 const status=await get("/api/hydra/bridge/status");
 assert.equal(status.status,200);
 assert.equal((await status.json()).data.connected,true);
 const options=await get("/api/hydra/bridge/options?gameId=game%3A1");
 assert.equal(options.status,200);
 const optionData=await options.text();
 assert.match(optionData,/Official demo archive/);
 assert.doesNotMatch(optionData,/private/);
 const down=await get("/api/hydra/bridge/downloaders?gameId=game%3A1&optionId=option%3A1");
 assert.equal(down.status,200);
 const downBody=await down.text();
 assert.doesNotMatch(downBody,/Private/);
 assert.match(downBody,/Direct/);
 const progress=await get("/api/hydra/bridge/downloads");
 assert.equal(progress.status,200);
 const progressData=await progress.json();
 assert.equal(progressData.data[0].progress,50);
 assert.equal(progressData.data[0].speedBytesPerSecond,100);
 const input={action:"queue",gameId:"game:1",optionId:"option:1",downloaderId:"direct",
    extract:true,deleteArchive:false};
 assert.equal((await post("/api/hydra/bridge/command",input)).status,200);
 approved=false;
 assert.equal((await post("/api/hydra/bridge/command",input)).status,409);
 assert.ok(called.some(row=>row.pathname==="/v1/downloads/command"&&row.payload.downloaderId==="direct"));
 hydraEnabled=false;
 assert.equal((await get("/api/hydra/bridge/options?gameId=game%3A1")).status,403);
});
