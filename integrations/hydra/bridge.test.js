"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHydraBridge, BridgeError } = require("./bridge");

const allowed = { authenticated: true, hydraEnabled: true, canManageDownloads: true, csrfValidated: true };
const companion = {
  supported: true,
  async ping() { return true; },
  async search() {
    return [{ id: "steam:123", title: "Sample Game", optionCount: 2, magnet: "private", token: "secret" }];
  },
  async options() { return [{id:"option-1",title:"Official demo package",source:"Publisher",sizeBytes:1048576,publishedAt:"2026-10-23",magnet:"never-expose"}]; },
  async downloaders() { return {downloaders:[{id:"direct",label:"Authorized download",available:true,configured:true,token:"secret"}],availableBytes:2097152,destinationLabel:"PC downloads",path:"private"}; },
  async downloads() {
    return [{ id: "job-123", state: "downloading", progress: 52, path: "C:/secret", uri: "secret" }];
  },
  async command(input) { return { accepted: true, localApproved:true, echo: input, secret: "must not leak" }; },
};

test("no companion means commands are unavailable", async () => {
  const bridge = createHydraBridge(null);
  assert.deepEqual(await bridge.status(allowed), { connected: false, capabilities: [] });
  await assert.rejects(bridge.search(allowed, { title: "Sample Game" }), { code: "UNAVAILABLE" });
});

test("anonymous and disabled sessions cannot read the bridge", async () => {
  const bridge = createHydraBridge(companion);
  await assert.rejects(bridge.downloads({ ...allowed, authenticated: false }), { code: "FORBIDDEN" });
  await assert.rejects(bridge.downloads({ ...allowed, hydraEnabled: false }), { code: "FORBIDDEN" });
});

test("browser receives only redacted game and progress fields", async () => {
  const bridge = createHydraBridge(companion);
  assert.deepEqual(await bridge.search(allowed, { title: "Sample" }),
    [{ id: "steam:123", title: "Sample Game", optionCount: 2 }]);
  assert.deepEqual(await bridge.downloads(allowed),
    [{ id: "job-123", state: "downloading", progress: 52, gameId:null, title:"",
      downloadedBytes:null,totalBytes:null,speedBytesPerSecond:null,etaSeconds:null }]);
});

test("mutations need privileges and validated CSRF", async () => {
  const bridge = createHydraBridge(companion);
  const payload = { action: "queue", gameId: "steam:123", optionId: "option-1",
    downloaderId:"direct",extract:false,deleteArchive:false };
  await assert.rejects(bridge.command({ ...allowed, csrfValidated: false }, payload), { code: "FORBIDDEN" });
  await assert.rejects(bridge.command({ ...allowed, canManageDownloads: false }, payload), { code: "FORBIDDEN" });
  assert.deepEqual(await bridge.command(allowed, payload), { accepted: true });
});

test("invalid actions and untrusted IDs are rejected", async () => {
  const bridge = createHydraBridge(companion);
  await assert.rejects(bridge.command(allowed, { action: "execute", gameId: "abc", optionId: "xyz" }),
    { code: "INVALID_INPUT" });
  await assert.rejects(bridge.command(allowed, { action: "queue", gameId: "../game", optionId: "id" }),
    { code: "INVALID_INPUT" });
});

test("installer request never executes a binary", async () => {
  const bridge = createHydraBridge(companion);
  assert.deepEqual(await bridge.requestInstaller(allowed, { gameId: "steam:123" }),
    { accepted: false, requiresLocalApproval: true,
      message: "Confirm installation on the gaming PC in Hydra Launcher" });
});

test("game download options, downloader availability and disk info are redacted",async()=>{
 const bridge=createHydraBridge(companion);
 assert.deepEqual(await bridge.options(allowed,{gameId:"steam:123"}),[
   {id:"option-1",title:"Official demo package",source:"Publisher",sizeBytes:1048576,publishedAt:"2026-10-23"}]);
 assert.deepEqual(await bridge.downloaders(allowed,{gameId:"steam:123",optionId:"option-1"}),{
   downloaders:[{id:"direct",label:"Authorized download",available:true,configured:true}],
   availableBytes:2097152,destinationLabel:"Configured on gaming PC",requiresLocalDestinationApproval:true});
 await assert.rejects(bridge.command(allowed,{action:"queue",gameId:"steam:123",optionId:"option-1",
   downloaderId:"direct",extract:false,deleteArchive:true}),{code:"INVALID_INPUT"});
 await assert.rejects(bridge.options(allowed,{gameId:"../path"}),{code:"INVALID_INPUT"});
});

test("a queue command is rejected without independent PC-side job approval",async()=>{
 const adapter={...companion,async command(){return {accepted:true,localApproved:false};}};
 const bridge=createHydraBridge(adapter);
 await assert.rejects(bridge.command(allowed,{
  action:"queue",gameId:"steam:123",optionId:"option-1",
  downloaderId:"direct",extract:false,deleteArchive:false
 }),{code:"REJECTED"});
});
