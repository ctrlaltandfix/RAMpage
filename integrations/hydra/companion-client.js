'use strict';
/**
 * Loopback-only client for a future opt-in Hydra-side companion.
 * A stock Hydra install currently has NO such endpoint. This adapter is
 * intentionally not activated by RAMpage until a compatible companion is
 * independently shipped, paired, user-enabled and verified.
 */
const { BridgeError } = require('./bridge');
const ACTIONS=new Set(['queue','pause','resume','cancel']);
function createHydraCompanionClient({baseUrl,token,fetchImpl=globalThis.fetch,timeoutMs=5000}={}){
 const u=new URL(baseUrl||'http://invalid');
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||
   (u.pathname!=='/'&&u.pathname!=='')||u.search||u.hash||!u.port){
   throw new BridgeError('INVALID_INPUT','Companion URL must be a dedicated 127.0.0.1 HTTP port');
 }
 if(typeof token!=='string'||token.length<32||token.length>256||
   !/^[A-Za-z0-9_-]+$/.test(token)){
   throw new BridgeError('INVALID_INPUT','Invalid local pairing token');
 }
 if(typeof fetchImpl!=='function')throw new BridgeError('INVALID_INPUT','Fetch unavailable');
 const origin=u.origin;
 const request=async(route,body)=>{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),Math.max(500,Math.min(15000,timeoutMs)));
   if(typeof timeout.unref==='function')timeout.unref();
   try{
     const response=await fetchImpl(origin+route,{
       method:body===undefined?'GET':'POST',
       headers:{'Authorization':'Bearer '+token,'Accept':'application/json',
         ...(body!==undefined?{'Content-Type':'application/json'}:{})},
       ...(body!==undefined?{body:JSON.stringify(body)}:{}),
       signal:controller.signal,redirect:'error',cache:'no-store',
     });
     if(!response.ok)throw new BridgeError('UNAVAILABLE','Hydra companion refused the request');
     const raw=await response.text();
     if(raw.length>262144)throw new BridgeError('BAD_RESPONSE','Companion response too large');
     const payload=JSON.parse(raw);
     if(!payload||typeof payload!=='object')throw new Error('Invalid companion reply');
     return payload;
   }catch(err){
     if(err instanceof BridgeError)throw err;
     throw new BridgeError('UNAVAILABLE','Hydra companion is not responding');
   }finally{clearTimeout(timeout);}
 };
 return Object.freeze({
   supported:true,
   async ping(){
     try{
       const status=await request('/v1/status');
       return status.protocol==='rampage-hydra-v1'&&status.ready===true&&status.userApproved===true;
     }catch{return false;}
   },
   async search({title}){
     const result=await request('/v1/games/search',{title});
     if(!Array.isArray(result.games))throw new BridgeError('BAD_RESPONSE','Invalid companion game list');
     return result.games;
   },
   async options({gameId}){
     const result=await request('/v1/games/options',{gameId});
     if(!Array.isArray(result.options))throw new BridgeError('BAD_RESPONSE','Invalid game download options');
     return result.options;
   },
   async downloaders({gameId,optionId}){
     const result=await request('/v1/downloaders',{gameId,optionId});
     if(!Array.isArray(result.downloaders))throw new BridgeError('BAD_RESPONSE','Invalid downloader options');
     return result;
   },
   async downloads(){
     const result=await request('/v1/downloads');
     if(!Array.isArray(result.downloads))throw new BridgeError('BAD_RESPONSE','Invalid companion queue');
     return result.downloads;
   },
   async command({action,gameId,downloadId,optionId,downloaderId,extract,deleteArchive}){
     if(!ACTIONS.has(action))throw new BridgeError('INVALID_INPUT','Unrecognised companion action');
     const result=await request('/v1/downloads/command',
       action==='queue'?{action,gameId,optionId,downloaderId,extract,deleteArchive}:{action,gameId,downloadId});
     return {accepted:result.accepted===true,
       localApproved:action==='queue' && result.localApproved===true};
   },
 });
}
module.exports={createHydraCompanionClient};
