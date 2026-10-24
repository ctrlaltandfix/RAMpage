"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {mountHydraDownloadPanel}=require("./web-panel");

class FakeNode {
 constructor(tag,doc) {this.tagName=tag;this.ownerDocument=doc;this.children=[];this.handlers={};this.textContent="";this.value="";this.checked=false;this.disabled=false;this.attrs={};}
 appendChild(node){this.children.push(node);node.parentNode=this;return node;}
 removeChild(node){const index=this.children.indexOf(node);if(index>=0)this.children.splice(index,1);node.parentNode=null;}
 get firstChild(){return this.children[0];}
 addEventListener(name,callback){this.handlers[name]=callback;}
 setAttribute(k,v){this.attrs[k]=v;}
 remove(){if(this.parentNode)this.parentNode.removeChild(this);}
}
const tree=()=>{const doc={createElement(tag){return new FakeNode(tag,doc);}};return new FakeNode("main",doc);};
const nodes=(root,all=[])=>{all.push(root);for(const child of root.children)nodes(child,all);return all;};
const find=(root,tag,text)=>nodes(root).find(n=>n.tagName===tag && (text===undefined || n.textContent===text));
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};

test("full Hydra workflow: options → source → downloader → queue → progress/pause",async()=>{
 const root=tree(),requests=[],title="Test game";
 const client={
  async status(){return {connected:true,capabilities:["search","options","downloaders","queue","readStatus","pause","resume","cancel"]};},
  async search(){return [{id:"game:1",title,optionCount:1}];},
  async options(){return [{id:"opt:1",title:"Publisher demo",source:"Publisher",sizeBytes:1024,publishedAt:"2026-10-20"}];},
  async downloaders(){return {downloaders:[{id:"direct",label:"Direct download",available:true,configured:true}],availableBytes:20000,destinationLabel:"PC downloads"};},
  async downloads(){return [{id:"job:1",gameId:"game:1",state:"downloading",title:"Publisher demo",progress:33,downloadedBytes:330,totalBytes:1000,speedBytesPerSecond:100,etaSeconds:7}];},
  async queue(...args){requests.push(args);return {accepted:true};},
  async pause(){requests.push(["pause"]);},async resume(){},async cancel(){},
  async requestInstall(){return {requiresLocalApproval:true,message:"Confirm on PC"};}
 };
 const ui=mountHydraDownloadPanel(root,{client,gameId:"game:1",gameTitle:title,pollMs:0});
 await ui.ready;
 assert.ok(find(root,"button","Open download options"));
 assert.ok(find(root,"button","Pause"));
 find(root,"button","Open download options").handlers.click();
 await flush();
 assert.ok(find(root,"button","Select download"));
 find(root,"button","Select download").handlers.click();
 await flush();
 assert.ok(find(root,"button","Request download on gaming PC"));
 find(root,"button","Request download on gaming PC").handlers.click();
 await flush();
 assert.deepEqual(requests[0],["game:1","opt:1","direct",false,false]);
 assert.ok(nodes(root).some(n=>n.textContent.includes("request accepted")));
 find(root,"button","Pause").handlers.click();
 await flush();
 assert.deepEqual(requests[1],["pause"]);
 ui.destroy();
 assert.equal(root.children.length,0);
});

test("disconnected Hydra never renders download controls",async()=>{
 const root=tree();
 const ui=mountHydraDownloadPanel(root,{client:{status:async()=>({connected:false,capabilities:[]})},gameId:"game:1",gameTitle:"Demo",pollMs:0});
 await ui.ready;
 assert.equal(find(root,"button","Request download on gaming PC"),undefined);
 assert.ok(nodes(root).some(n=>n.textContent.includes("not connected")));
 ui.destroy();
});

test("download options are DOM text, not HTML even with markup in titles",async()=>{
 const root=tree();
 const ui=mountHydraDownloadPanel(root,{
  client:{
   status:async()=>({connected:true,capabilities:["options"]}),
   options:async()=>[{id:"opt:1",title:'<script>alert(1)</script>',source:"Publisher",sizeBytes:500}],
   downloaders:async()=>({downloaders:[],availableBytes:2000}),
  },gameId:"game:1",gameTitle:"Demo",pollMs:0
 });
 await ui.ready;
 find(root,"button","Open download options").handlers.click();
 await flush();
 assert.ok(nodes(root).some(n=>n.textContent.includes("<script>")));
 assert.equal(nodes(root).filter(n=>n.tagName==="script").length,0);
 ui.destroy();
});
