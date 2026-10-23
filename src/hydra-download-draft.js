'use strict';
// RAMpage placeholders only: never install, fetch or execute game binaries.
// Hydra itself owns its authenticated catalogue and download-selection screens.
const crypto=require('node:crypto');
function cleanTitle(value){
 if(typeof value!=='string')throw Error('Enter a game title');
 const title=value.trim().replace(/\s+/g,' ');
 if(title.length<2||title.length>160||/[\u0000-\u001f\u007f]/.test(title))
   throw Error('Use a game title between 2 and 160 characters');
 return title;
}
function requireHydraEnabled(enabled){
 if(enabled!==true)throw Error('Enable Hydra Launcher integration in RAMpage Settings first');
}
function createHydraDownloadDraft(raw,{now=Date.now(),random=()=>crypto.randomBytes(5).toString('hex')}={}){
 const title=cleanTitle(raw);
 const id='custom:hydra-download-'+Number(now).toString(36)+'-'+random();
 return {id,source:'custom',name:title,installed:false,
   hydraDownloadDraft:true,hydraDownloadStatus:'awaiting-install',
   addedAt:now,art:{},favorite:false,hidden:false,playtimeSec:0,lastPlayed:null,
   notes:'Not downloaded yet. Use Hydra Launcher to search and select an available download.',
   launch:{type:'exe',target:'',args:'',cwd:''},exePath:null,installDir:null};
}
function sanitizedOptions(result,term){
 const title=cleanTitle(term).toLowerCase();
 if(!result||result.sessionStored!==true)return {storedSession:false,matches:[],notice:'Sign in to Hydra and refresh its library in RAMpage to see locally cached availability.'};
 const matches=(Array.isArray(result.games)?result.games:[])
  .filter(g=>g&&typeof g.title==='string'&&g.title.toLowerCase().includes(title))
  .slice(0,8).map(g=>({title:g.title.slice(0,160),
    newOptionsCount:Math.max(0,Math.min(999,Number(g.newOptionsCount)||0)),
    installed:g.installed===true}));
 return {storedSession:true,matches,
   notice:'Only locally cached new-option counts are shown here. Hydra shows the current available downloads after you open it.'};
}
module.exports={cleanTitle,requireHydraEnabled,createHydraDownloadDraft,sanitizedOptions};
