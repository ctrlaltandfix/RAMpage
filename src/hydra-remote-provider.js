'use strict';
// Opt-in Hydra source for RAMpage's authenticated web library.
// Hydra's LevelDB is READ ONLY. Metadata overrides live in RAMpage's journal area.
// No Hydra session/account/credentials, executable paths or download history exposed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');

function safeHydraPaths(appData){
 if(!appData)return [];
 return ['hydralauncher','hydra','Hydra'].map(n=>path.join(appData,n,'hydra-db'));
}
class HydraRemoteProvider {
 constructor({dataDir,appData=process.env.APPDATA,readerExe,readerScript,exec=execFile,log=()=>{}}={}){
   if(!dataDir)throw Error('Hydra integration needs RAMpage data directory');
   this.dataDir=dataDir;this.appData=appData;this.log=log;this.exec=exec;
   this.exe=readerExe||path.join(path.dirname(process.execPath),'tools','hydra-bridge','node.exe');
   this.script=readerScript||path.join(path.dirname(process.execPath),'tools','hydra-bridge','reader.js');
   this.settingsPath=path.join(dataDir,'hydra-remote-config.json');
   this.overridesPath=path.join(dataDir,'hydra-remote-overrides.json');
   this.enabled=false;this.games={};this.error=null;this.lastSync=null;this.timer=null;
   this.overrides=this.readJson(this.overridesPath,{});
   const settings=this.readJson(this.settingsPath,{enabled:false});
   this.enabled=settings.enabled===true;
 }
 readJson(file,fallback){
   try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback;}catch{return fallback;}
 }
 atomicSave(file,obj){
   fs.mkdirSync(this.dataDir,{recursive:true});
   const tmp=file+'.tmp-'+crypto.randomBytes(5).toString('hex');
   try{fs.writeFileSync(tmp,JSON.stringify(obj),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
   finally{try{fs.unlinkSync(tmp)}catch{}}
 }
 status(){
   // Returned through desktop IPC only, never the remote unauthenticated API.
   const installed=safeHydraPaths(this.appData).some(p=>fs.existsSync(path.join(p,'CURRENT')));
   return {enabled:this.enabled,detected:installed,count:this.enabled?Object.keys(this.games).length:0,
     lastSync:this.lastSync,error:this.error};
 }
 getGames(){return this.enabled?this.games:{}}
 applyOverride(g){
   const edits=this.overrides[g.id];
   if(!edits||typeof edits!=='object')return g;
   const val={...g,art:{...g.art},meta:{...g.meta}};
   for(const key of ['name','notes','favorite','hidden','customName']){
     if(Object.prototype.hasOwnProperty.call(edits,key))val[key]=edits[key];
   }
   if(edits.customArtCover && /^https:\/\//i.test(edits.customArtCover)){
     val.customArt={cover:edits.customArtCover};val.art.cover=edits.customArtCover;
   }
   if(edits.metaEdits && typeof edits.metaEdits==='object'){
     val.metaEdits=edits.metaEdits;
     Object.assign(val.meta,edits.metaEdits);
   }
   return val;
 }
 sync(){
   if(!this.enabled)return Promise.reject(Error('Enable Hydra integration first'));
   const located=safeHydraPaths(this.appData).find(p=>fs.existsSync(path.join(p,'CURRENT')));
   if(!located){this.error='Hydra database not found in AppData';return Promise.resolve(this.status());}
   if(!fs.existsSync(this.exe)||!fs.existsSync(this.script)){
     this.error='Hydra reader component missing; reinstall RAMpage';
     return Promise.resolve(this.status());
   }
   if(this.inflight)return this.inflight;
   this.inflight=new Promise((resolve)=>{
     this.exec(this.exe,[this.script,located],
       {windowsHide:true,timeout:60000,maxBuffer:12*1024*1024},(err,stdout)=>{
         if(!this.enabled)return resolve(this.status());
         if(err){this.error='Hydra sync unavailable. Close Hydra briefly and retry if the database is busy.';
           this.log('Hydra sync failed (database may be busy): '+err.message);
           return resolve(this.status());}
         try{
           const data=JSON.parse(stdout);
           if(!Array.isArray(data.games)||data.games.length>5000)throw Error('Unexpected reader output');
           const next={};
           for(const row of data.games){
             if(!row||!/^hydra:[a-z0-9_-]{1,40}:[a-zA-Z0-9:._-]{1,180}$/.test(row.id)||
                typeof row.name!=='string'||row.name.length>250)continue;
             const previous=this.games[row.id];
             const game={
               id:row.id,name:row.name,source:'hydra',systemName:'Hydra Launcher',
               installed:row.installed===true,art:row.cover?{cover:row.cover}:{},
               favorite:false,hidden:false,notes:'',playtimeSec:Number(row.playtimeSec)||0,
               lastPlayed:row.lastPlayed||null,meta:{title:row.name,description:'',about:'',
                 releaseDate:'',website:'',genres:[],developers:[],publishers:[],
                 platforms:row.platform?[row.platform]:[],features:[]},
               _u:previous?Number(previous._u)||1:1,
               launch:{type:'uri',target:''}
             };
             next[row.id]=this.applyOverride(game);
           }
           this.games=next;this.lastSync=new Date().toISOString();this.error=null;
           this.log('Hydra integration refreshed '+Object.keys(next).length+' library records');
         }catch(e){this.error='Unable to understand Hydra library records';
           this.log('Hydra snapshot parse error: '+e.message);}
         resolve(this.status());
       });
   }).finally(()=>{this.inflight=null;});
   return this.inflight;
 }
 configure(enabled){
   if(typeof enabled!=='boolean')throw Error('Hydra enabled state must be boolean');
   this.enabled=enabled;
   this.atomicSave(this.settingsPath,{enabled});
   if(this.timer){clearInterval(this.timer);this.timer=null;}
   if(!enabled){this.games={};this.error=null;return Promise.resolve(this.status());}
   this.timer=setInterval(()=>this.sync().catch(e=>this.log('Hydra periodic sync: '+e.message)),10*60*1000);
   this.timer.unref?.();
   return this.sync();
 }
 async start(){if(this.enabled)return this.configure(true);return this.status();}
 save(id){
   if(!this.enabled||!/^hydra:/.test(id)||!this.games[id])return false;
   const g=this.games[id];
   // Only the same metadata fields validated by RemoteLibraryService.edit.
   const copy={name:g.name,notes:g.notes,favorite:!!g.favorite,hidden:!!g.hidden,
     customName:!!g.customName,
     customArtCover:typeof g.customArt?.cover==='string'?g.customArt.cover:'',
     metaEdits:g.metaEdits&&typeof g.metaEdits==='object'?g.metaEdits:{}};
   this.overrides[id]=copy;
   try{
     this.atomicSave(this.overridesPath,this.overrides);
     g._u=Math.max(Date.now(),(Number(g._u)||0)+1);
     return true;
   }catch(e){this.log('Hydra metadata override persistence failed: '+e.message);return false;}
 }
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.games={};}
}
module.exports={HydraRemoteProvider,safeHydraPaths};
