'use strict';
// RAMpage remote library: opt-in, password-gated, loopback-only web server.
// Tailscale Serve can publish the localhost listener to a private tailnet over HTTPS.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const DEFAULT_PORT = 43681;
const MAX_BODY = 48 * 1024;
const TTL = 12 * 60 * 60 * 1000;
const IDLE = 30 * 60 * 1000;
const EDIT_FIELDS = ['description','about','releaseDate','website','genres','developers','publishers','platforms','features'];
const ARRAYS = new Set(['genres','developers','publishers','platforms','features']);
const isOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj,k);
function error(message,status=400) { const e = new Error(message); e.status=status; return e; }
function cleanText(value,max=4000) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw error('Invalid text field');
  return value.trim();
}
function cleanArray(value) {
  if (!Array.isArray(value) || value.length > 32) throw error('Invalid list');
  return value.map(x=>cleanText(x,100)).filter(Boolean);
}
function cover(g) {
  const c = g.customArt?.cover || g.art?.cover || '';
  return typeof c==='string' && /^https:\/\//i.test(c) && c.length<=2048 ? c : null;
}
function project(g) {
  // NEVER disclose paths, shell commands, emulator settings, store keys, or library settings.
  return {
    id:g.id, name:g.name, source:g.source, systemName:g.systemName||null,
    installed:g.installed!==false, favorite:!!g.favorite, hidden:!!g.hidden,
    notes:typeof g.notes==='string'?g.notes:'', playtimeSec:g.playtimeSec||0,
    lastPlayed:g.lastPlayed||null, updatedAt:Number(g._u)||0,
    meta:Object.fromEntries(EDIT_FIELDS.map(k=>[k,g.meta?.[k]??(ARRAYS.has(k)?[]:'')])),
    customArtCover: typeof g.customArt?.cover === 'string' && /^https:\/\//.test(g.customArt.cover) ? g.customArt.cover : '',
    cover:cover(g)
  };
}
class RemoteLibraryService {
  constructor({ dataDir, getGames, saveGame, publish=()=>{}, rebuildMeta, log=()=>{}, port=DEFAULT_PORT }={}) {
    if (!dataDir || !getGames || !saveGame || !rebuildMeta) throw Error('Remote library persistence callbacks required');
    this.file = path.join(dataDir,'remote-library-auth.json');
    this.getGames=getGames; this.saveGame=saveGame; this.publish=publish; this.rebuildMeta=rebuildMeta; this.log=log;
    this.port=port; this.server=null; this.auth=null; this.sessions=new Map(); this.attempts=new Map();
    try { const j=JSON.parse(fs.readFileSync(this.file,'utf8')); if(j?.salt&&j?.hash&&typeof j.enabled==='boolean')this.auth=j; }
    catch {/* no credentials yet */}
  }
  status() {return {enabled:!!this.auth?.enabled && !!this.server?.listening,
    configured:!!this.auth?.hash,port:this.server?.address()?.port||this.port,
    localUrl:this.server?.listening?`http://127.0.0.1:${this.server.address().port}/`:null,
    remoteInstructions:'For a private HTTPS URL, run tailscale serve --bg '+this.port+' on this PC and use the URL Tailscale displays. Never use Tailscale Funnel.'};}
  async start() {
    if (this.server?.listening || !this.auth?.enabled) return this.status();
    const server=http.createServer((req,res)=>this.handle(req,res));
    server.requestTimeout=15000;
    server.headersTimeout=10000;
    server.maxHeadersCount=48;
    return new Promise((resolve,reject)=>{
      server.once('error',(e)=>{this.log(`Remote library listener failed: ${e.message}`);reject(e);});
      server.listen(this.port,'127.0.0.1',()=>{
        this.server=server;
        this.log(`Remote library enabled on loopback port ${server.address().port}`);
        resolve(this.status());
      });
    });
  }
  async stop() {
    this.sessions.clear();this.attempts.clear();
    if (!this.server)return this.status();
    const s=this.server;this.server=null;
    await new Promise(resolve=>s.close(()=>resolve()));
    return this.status();
  }
  async configure({enabled,password}={}) {
    if(typeof enabled!=='boolean')throw error('Invalid enabled state');
    if(typeof password==='string' && password.length){
      if(password.length<16 || password.length>256)throw error('Use a password of at least 16 characters (maximum 256)');
      const salt=crypto.randomBytes(24);
      const hash=crypto.scryptSync(password,salt,64);
      this.auth={enabled:false,salt:salt.toString('base64'),hash:hash.toString('base64')};
      this.sessions.clear();
    }
    if(enabled && !this.auth?.hash)throw error('Set a password before enabling remote access');
    const old=this.auth?{...this.auth}:null;
    this.auth={...this.auth,enabled};
    const tmp=this.file+'.tmp-'+crypto.randomBytes(5).toString('hex');
    try{
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      fs.writeFileSync(tmp,JSON.stringify(this.auth),{encoding:'utf8',mode:0o600,flag:'wx'});
      fs.renameSync(tmp,this.file);
      if(!enabled)await this.stop(); else await this.start();
      return this.status();
    }catch(e){
      try{fs.unlinkSync(tmp)}catch{}
      this.auth=old;
      if(old)try{fs.writeFileSync(this.file,JSON.stringify(old),{mode:0o600})}catch{}
      throw e;
    }
  }
  json(res,code,obj,extra={}) {this.send(res,code,'application/json; charset=utf-8',JSON.stringify(obj),extra);}
  send(res,code,type,text,extra={}) {
    res.writeHead(code,{
      'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      ...extra});res.end(text);
  }
  async body(req) {
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw error('JSON content type required',415);
    let bytes=0;const buffers=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY)throw error('Request too large',413);buffers.push(chunk)}
    try{const j=JSON.parse(Buffer.concat(buffers).toString('utf8'));if(!j || typeof j!=='object' || Array.isArray(j))throw Error();return j;}catch{throw error('Malformed JSON')}
  }
  session(req) {
    const raw=String(req.headers.cookie||'').match(/(?:^|;\s*)rampage_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if(!raw)return null;
    const s=this.sessions.get(raw);
    if(!s)return null;
    const t=Date.now();if(t>s.expires||t-s.last>IDLE){this.sessions.delete(raw);return null;}
    s.last=t;return s;
  }
  requireSession(req) {const s=this.session(req);if(!s)throw error('Sign in required',401);return s;}
  checkOrigin(req){
    // Prevent cross-site POSTs / DNS rebinding: require same URL host from browser.
    const origin=req.headers.origin;
    if(!origin)throw error('Origin required',403);
    try{const u=new URL(origin);if(!['http:','https:'].includes(u.protocol)||u.host!==req.headers.host)throw Error();}
    catch{throw error('Invalid request origin',403)}
  }
  loginAllowed(ip){const now=Date.now();const r=this.attempts.get(ip)||{failures:0,until:0};if(now<r.until)throw error('Too many attempts; try again later',429);return r;}
  verifyPassword(pass){
    if(typeof pass!=='string'||pass.length>256||!this.auth?.hash)return false;
    const actual=crypto.scryptSync(pass,Buffer.from(this.auth.salt,'base64'),64);
    const expected=Buffer.from(this.auth.hash,'base64');
    return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
  }
  edit(id,input){
    const g=this.getGames()[id];if(!g)throw error('Game not found',404);
    if(!Number.isSafeInteger(input.updatedAt))throw error('Reload game before editing',409);
    if(Number(g._u||0)!==input.updatedAt)throw error('Game was changed elsewhere; reload before saving',409);
    const patch=input.patch;
    if(!patch || typeof patch!=='object'||Array.isArray(patch))throw error('Invalid changes');
    const permitted=new Set(['name','notes','favorite','hidden','coverUrl',...EDIT_FIELDS]);
    if(Object.keys(patch).length===0||Object.keys(patch).some(k=>!permitted.has(k)))throw error('Unsupported metadata field');
    // Validate EVERYTHING before mutating the game's live record.
    const clean={};
    for(const [key,value] of Object.entries(patch)) {
      if(key==='favorite'||key==='hidden'){if(typeof value!=='boolean')throw error('Expected boolean');clean[key]=value;}
      else if(ARRAYS.has(key))clean[key]=cleanArray(value);
      else if(key==='coverUrl'||key==='website'){
        if(value!==''){const v=cleanText(value,2048);try{const u=new URL(v);if(u.protocol!=='https:')throw Error();}catch{throw error('Use an HTTPS URL for artwork and websites');}clean[key]=v;}
        else clean[key]='';
      }
      else clean[key]=cleanText(value,key==='about'?6000:4000);
    }
    if(isOwn(clean,'name')&&!clean.name)throw error('Game name cannot be empty');
    if(isOwn(clean,'name')){g.name=clean.name;g.customName=true;}
    if(isOwn(clean,'favorite'))g.favorite=clean.favorite;
    if(isOwn(clean,'hidden'))g.hidden=clean.hidden;
    if(isOwn(clean,'notes'))g.notes=clean.notes;
    if(isOwn(clean,'coverUrl')){
      g.customArt={...(g.customArt||{})};
      if(clean.coverUrl)g.customArt.cover=clean.coverUrl; else delete g.customArt.cover;
      g.art={...(g.art||{})};
      if(clean.coverUrl)g.art.cover=clean.coverUrl;
      // Original downloaded cover remains when the custom override is cleared;
      // a future metadata refresh can restore it if necessary.
    }
    const metaFields=Object.keys(clean).filter(k=>EDIT_FIELDS.includes(k));
    if(metaFields.length){
      const edits={...(g.metaEdits||{})};
      for(const key of metaFields){const val=clean[key];if(val===''||(Array.isArray(val)&&!val.length))delete edits[key];else edits[key]=val;}
      g.metaEdits=edits;
      if(!g.metaBase && g.meta && !g.meta.edited)g.metaBase=g.meta;
      this.rebuildMeta(g);
      if(Object.keys(edits).length&&g.metaStatus!=='ok')g.metaStatus='ok';
    }
    const ok=this.saveGame(id);
    if(!ok)throw error('Unable to save library change to disk; check RAMpage storage diagnostics',503);
    this.publish();return project(g);
  }
  async handle(req,res) {
    try {
      if(!this.auth?.enabled){return this.json(res,503,{error:'Remote library is disabled'});}
      if(typeof req.headers.host!=='string'||req.headers.host.length>255||/[\s\\]/.test(req.headers.host))throw error('Invalid host',400);
      const method=req.method;
      const url=new URL(req.url,'http://localhost');
      const pathname=url.pathname;
      if(!['GET','POST'].includes(method))throw error('Method not allowed',405);
      // No credential or library info in unauthenticated responses.
      if(method==='GET'&&pathname==='/')return this.send(res,200,'text/html; charset=utf-8',fs.readFileSync(path.join(__dirname,'remote','index.html')));
      if(method==='GET'&&pathname==='/client.js')return this.send(res,200,'application/javascript; charset=utf-8',fs.readFileSync(path.join(__dirname,'remote','client.js')));
      if(method==='GET'&&pathname==='/style.css')return this.send(res,200,'text/css; charset=utf-8',fs.readFileSync(path.join(__dirname,'remote','style.css')));
      if(pathname==='/api/session'&&method==='GET'){
        const s=this.session(req);return this.json(res,200,{authenticated:!!s,csrf:s?.csrf||null});
      }
      if(pathname==='/api/login'&&method==='POST'){
        this.checkOrigin(req);
        const ip=req.socket.remoteAddress||'?';const attempts=this.loginAllowed(ip);
        const {password}=await this.body(req);
        if(!this.verifyPassword(password)){
          attempts.failures++;attempts.until=Date.now()+Math.min(5*60*1000,1000*Math.pow(2,Math.min(attempts.failures,8)));
          this.attempts.set(ip,attempts);
          throw error('Invalid password',401);
        }
        this.attempts.delete(ip);
        const token=crypto.randomBytes(32).toString('hex');
        const csrf=crypto.randomBytes(24).toString('hex');
        this.sessions.set(token,{csrf,expires:Date.now()+TTL,last:Date.now()});
        for(const [id,s] of this.sessions)if(Date.now()>s.expires||Date.now()-s.last>IDLE)this.sessions.delete(id);
        return this.json(res,200,{authenticated:true,csrf},{'Set-Cookie':`rampage_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${req.socket.encrypted||req.headers['x-forwarded-proto']==='https' ? '; Secure':''}`});
      }
      const session=this.requireSession(req);
      if(pathname==='/api/games'&&method==='GET'){
        const games=Object.values(this.getGames()).filter(g=>g&&g.id&&!g.probe).map(project);
        return this.json(res,200,{games,updatedAt:Date.now()});
      }
      if(pathname==='/api/logout'&&method==='POST'){
        this.checkOrigin(req);
        if(req.headers['x-rampage-csrf']!==session.csrf)throw error('Invalid request token',403);
        const token=String(req.headers.cookie||'').match(/rampage_session=([a-f0-9]{64})/)?.[1];
        this.sessions.delete(token);
        return this.json(res,200,{ok:true},{'Set-Cookie':'rampage_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
      }
      if(pathname.startsWith('/api/game/')&&method==='POST'){
        this.checkOrigin(req);
        if(req.headers['x-rampage-csrf']!==session.csrf)throw error('Invalid request token',403);
        const id=decodeURIComponent(pathname.slice('/api/game/'.length));
        if(!id||id.length>500)throw error('Invalid game ID');
        return this.json(res,200,{game:this.edit(id,await this.body(req))});
      }
      throw error('Not found',404);
    }catch(e){if(!res.headersSent)this.json(res,e.status||500,{error:e.status?e.message:'Unexpected error'});this.log(`Remote library request ${req.method}: ${e.status||500} ${e.message}`);}
  }
}
module.exports={RemoteLibraryService,project};
