'use strict';
// Add authenticated, strictly opt-in web "Add a Download" to official RAMpage 1.6.5.
// This creates only RAMpage placeholders; NO Hydra login, launch or download commands
// are exposed to the public HTTPS server.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.argv[2];if(!root)throw Error('Pass unpacked official RAMpage app');
const file=n=>path.join(root,'src',n);
function patch(name,from,to,label){
 const p=file(name),s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
 const n=s.split(from).length-1;
 if(n!==1)throw Error(label+': expected exactly one anchor, found '+n);
 fs.writeFileSync(p,s.replace(from,to));
}
function lines(v){return v.join('\n')}
const mainFile=file('main.js');
let main=fs.readFileSync(mainFile,'utf8').replace(/\r\n/g,'\n');
const handlerStart=main.indexOf("ipcMain.handle('hydra:draft-create', (_e, title) => {");
const handlerEnd=main.indexOf("ipcMain.handle('hydra:draft-options', (_e, title) => {",handlerStart);
if(handlerStart<0||handlerEnd<0||handlerEnd-handlerStart>2500)throw Error('Original Hydra desktop draft handler unavailable');
const shared=lines([
 "function createHydraDownloadDraftInLibrary(title){",
 "  requireHydraEnabled(hydraRemoteProvider.status().enabled);",
 "  const name=cleanTitle(title);",
 "  const existing=Object.values(store.games).find(g=>g?.hydraDownloadDraft && g.installed===false && g.name.toLowerCase()===name.toLowerCase());",
 "  if(existing)return {ok:true,id:existing.id,created:false,name:existing.name};",
 "  // Limit web-created library items before making RAMpage larger or slower.",
 "  if(Object.values(store.games).filter(g=>g?.hydraDownloadDraft).length>=500)throw Error('Hydra download placeholder limit reached');",
 "  const draft=createHydraDownloadDraft(name);store.games[draft.id]=draft;",
 "  const ok=saveGame(draft.id);",
 "  if(!ok || !storage.verifyGameOnDisk(draft.id).ok){",
 "    delete store.games[draft.id];",
 "    throw Error('Could not save game to RAMpage library');",
 "  }",
 "  push();return {ok:true,id:draft.id,created:true,name:draft.name};",
 "}",
 "ipcMain.handle('hydra:draft-create', (_e, title) => createHydraDownloadDraftInLibrary(title));",
 ""
]);
main=main.slice(0,handlerStart)+shared+main.slice(handlerEnd);
const existingCb="  getHydraIndex: (query) => hydraRemoteProvider.getIndex(query)";
if(main.split(existingCb).length!==2)throw Error('Remote library callback anchor changed');
main=main.replace(existingCb,lines([
 "  getHydraIndex: (query) => hydraRemoteProvider.getIndex(query),",
 "  hydraDraftEnabled: () => hydraRemoteProvider.status().enabled===true,",
 "  createHydraDraft: (title) => createHydraDownloadDraftInLibrary(title),",
 "  getHydraDraftOptions: (term) => sanitizedOptions(hydraRemoteProvider.getIndex(term),term)"
]));
fs.writeFileSync(mainFile,main);
patch('remote-library.js',
 "constructor({ dataDir, getGames, saveGame, publish=()=>{}, rebuildMeta, log=()=>{}, getHydraIndex=()=>null, port=DEFAULT_PORT }={}) {",
 "constructor({ dataDir, getGames, saveGame, publish=()=>{}, rebuildMeta, log=()=>{}, getHydraIndex=()=>null, hydraDraftEnabled=()=>false, createHydraDraft=()=>{throw Error('Hydra download unavailable')}, getHydraDraftOptions=()=>({storedSession:false,matches:[]}), port=DEFAULT_PORT }={}) {",
 'safe default callbacks for remote service');
patch('remote-library.js',
 "this.port=port; this.server=null; this.auth=null; this.sessions=new Map(); this.attempts=new Map(); this.getHydraIndex=getHydraIndex;",
 "this.port=port; this.server=null; this.auth=null; this.sessions=new Map(); this.attempts=new Map(); this.getHydraIndex=getHydraIndex;\n"+
 "    this.hydraDraftEnabled=hydraDraftEnabled;this.createHydraDraft=createHydraDraft;this.getHydraDraftOptions=getHydraDraftOptions;",
 'server callback setup');
patch('remote-library.js',
 "    id:g.id, name:g.name, source:g.source, systemName:g.systemName||null,",
 "    id:g.id, name:g.name, source:g.source, systemName:g.systemName||null,\n"+
 "    hydraDownloadDraft:g.hydraDownloadDraft===true,",
 'flag pending Hydra placeholders in sanitized game list');
const routes=lines([
 "      // All these routes occur AFTER requireSession, unlike the public login assets.",
 "      if(pathname==='/api/hydra/draft/status'&&method==='GET'){",
 "        return this.json(res,200,{enabled:this.hydraDraftEnabled()===true});",
 "      }",
 "      if(pathname==='/api/hydra/draft/options'&&method==='GET'){",
 "        if(!this.hydraDraftEnabled())throw error('Enable Hydra integration in desktop RAMpage Settings first',403);",
 "        const title=String(url.searchParams.get('q')||'');",
 "        if(title.trim().length<2||title.length>160)throw error('Enter a valid game title (2–160 characters)',400);",
 "        return this.json(res,200,this.getHydraDraftOptions(title));",
 "      }",
 "      if(pathname==='/api/hydra/draft'&&method==='POST'){",
 "        // A public Quick Tunnel only grants metadata access to authenticated users.",
 "        // Cross-origin and missing CSRF requests cannot create library entries.",
 "        this.checkOrigin(req);",
 "        if(req.headers['x-rampage-csrf']!==session.csrf)throw error('Invalid request token',403);",
 "        if(!this.hydraDraftEnabled())throw error('Hydra Launcher integration is disabled in desktop Settings',403);",
 "        const now=Date.now();",
 "        session.hydraDraftTimes=(session.hydraDraftTimes||[]).filter(t=>now-t<3600000);",
 "        if(session.hydraDraftTimes.length>=12)throw error('Hourly add-a-download limit reached; try again later',429);",
 "        const body=await this.body(req);",
 "        if(typeof body.title!=='string'||body.title.trim().length<2||body.title.length>160||",
 "           /[\\u0000-\\u001f\\u007f]/.test(body.title))throw error('Enter a valid game title (2–160 characters)',400);",
 "        let result;",
 "        try{result=this.createHydraDraft(body.title)}",
 "        catch(e){",
 "          if(/Enable Hydra/.test(e.message))throw error('Hydra integration is disabled',403);",
 "          if(/save|disk/i.test(e.message))throw error('Could not save game to the RAMpage library',503);",
 "          throw error('Unable to create this game entry',400);",
 "        }",
 "        if(!result?.ok||typeof result.id!=='string')throw error('Could not save game to the RAMpage library',503);",
 "        if(result.created)session.hydraDraftTimes.push(now);",
 "        const game=this.getGames()[result.id];",
 "        if(!game?.hydraDownloadDraft||game.installed!==false)throw error('Saved entry is not a pending Hydra download',503);",
 "        return this.json(res,result.created?201:200,{created:!!result.created,game:project(game),",
 "          notice:'Saved as Not installed. Open Hydra Launcher on your gaming PC to select an available download. RAMpage does not start downloads remotely.'});",
 "      }",
 ""
]);
patch('remote-library.js',
 "      if(pathname==='/api/hydra/index'&&method==='GET'){",
 routes+"      if(pathname==='/api/hydra/index'&&method==='GET'){",
 'authenticated Hydra web draft routes');
const htmlModal=lines([
 '<div id="hydra-draft-modal" class="modal" hidden>',
 '  <div class="shade" id="hydra-draft-shade"></div>',
 '  <section class="panel" role="dialog" aria-modal="true" aria-labelledby="hydra-draft-heading" style="max-width:540px">',
 '    <div class="panel-head"><div><p class="eyebrow">HYDRA LAUNCHER</p><h2 id="hydra-draft-heading">Add a Download</h2></div><button id="hydra-draft-close" class="close" type="button" aria-label="Close">✕</button></div>',
 '    <p class="subtitle">Create a game entry in RAMpage now and select its download later in Hydra on your gaming PC.</p>',
 '    <form id="hydra-draft-form" style="margin-top:20px">',
 '      <label for="hydra-draft-title">Game title</label>',
 '      <input id="hydra-draft-title" required minlength="2" maxlength="160" autocomplete="off" placeholder="Enter a game title" style="margin:7px 0 12px">',
 '      <div class="modal-actions" style="flex-wrap:wrap"><button class="muted" id="hydra-draft-preview" type="button">Check cached options</button><button id="hydra-draft-submit" type="submit">Create empty game entry</button></div>',
 '    </form>',
 '    <p id="hydra-draft-preview-result" class="stats" role="status"></p>',
 '    <p id="hydra-draft-result" role="status" style="margin-top:12px;overflow-wrap:anywhere"></p>',
 '    <div class="modal-actions" style="flex-wrap:wrap"><button type="button" id="hydra-draft-copy" class="muted" hidden>Copy game title</button><button type="button" id="hydra-draft-done" class="muted">Done</button></div>',
 '    <small class="subtitle">RAMpage does not download files or control Hydra remotely. Only obtain games you are authorised to use; Hydra handles download selection and installation.</small>',
 '  </section>',
 '</div>',
 ''
]);
patch('remote/index.html',
 '<div id="editor" class="modal" hidden>',
 htmlModal+'<div id="editor" class="modal" hidden>',
 'remote download draft modal');
patch('remote/index.html',
 '<button id="refresh" class="muted">↻ Refresh</button>',
 '<div style="display:flex;gap:8px;flex-wrap:wrap"><button id="hydra-add-download" hidden>+ Add a Download</button><button id="refresh" class="muted">↻ Refresh</button></div>',
 'authenticated remote top bar');
patch('remote/index.html',
 '<p id="stats" class="stats"></p>',
 '<p id="hydra-draft-feedback" class="stats" role="status" hidden></p><p id="stats" class="stats"></p>',
 'web draft creation feedback');
const web=lines([
 "let hydraDraftEnabled=false;",
 "let lastCreatedHydraDraft=null;",
 "async function refreshHydraDraftStatus(){",
 "  try{const status=await call('/api/hydra/draft/status');hydraDraftEnabled=status.enabled===true;}",
 "  catch{hydraDraftEnabled=false;}",
 "  qs('hydra-add-download').hidden=!hydraDraftEnabled;",
 "  if(!hydraDraftEnabled)closeHydraDraft();",
 "}",
 "function openHydraDraft(){",
 "  if(!hydraDraftEnabled)return;",
 "  lastCreatedHydraDraft=null;",
 "  qs('hydra-draft-form').reset();",
 "  text(qs('hydra-draft-preview-result'),'');",
 "  text(qs('hydra-draft-result'),'');",
 "  qs('hydra-draft-copy').hidden=true;",
 "  qs('hydra-draft-modal').hidden=false;",
 "  qs('hydra-draft-title').focus();",
 "}",
 "function closeHydraDraft(){qs('hydra-draft-modal').hidden=true;}",
 "async function previewHydraDraftOptions(){",
 "  const title=qs('hydra-draft-title').value.trim();",
 "  const output=qs('hydra-draft-preview-result');",
 "  if(title.length<2){text(output,'Enter a game title first.');return;}",
 "  text(output,'Checking the locally cached Hydra index…');",
 "  try{",
 "    const r=await call('/api/hydra/draft/options?q='+encodeURIComponent(title));",
 "    if(!r.storedSession){text(output,'Hydra account not detected locally. Sign into Hydra and refresh its library in desktop RAMpage Settings.');return;}",
 "    const matching=(r.matches||[]).find(g=>g.title.toLowerCase()===title.toLowerCase());",
 "    text(output,matching?.newOptionsCount ? matching.newOptionsCount+' newly indexed option(s) for this title. Check Hydra for actual download choices.' :",
 "      'No cached new-option count for this title. Hydra may have current options that are not in its local game index.');",
 "  }catch(e){text(output,errorText(e));}",
 "}",
 "async function submitHydraDraft(e){",
 "  e.preventDefault();",
 "  const btn=qs('hydra-draft-submit');",
 "  const output=qs('hydra-draft-result');",
 "  const title=qs('hydra-draft-title').value.trim();",
 "  if(title.length<2){text(output,'Please enter a game title.');return;}",
 "  btn.disabled=true;text(output,'Saving uninstalled game entry to RAMpage…');",
 "  try{",
 "    const res=await call('/api/hydra/draft',{title});",
 "    lastCreatedHydraDraft=res.game;",
 "    text(output,(res.created?'Created ':'Already added ')+res.game.name+' as Not installed. Open Hydra on your gaming PC to search for an available download.');",
 "    qs('hydra-draft-copy').hidden=false;",
 "    const feedback=qs('hydra-draft-feedback');",
 "    text(feedback,'Hydra download placeholder: '+res.game.name+' · Not installed. Open Hydra on your gaming PC to continue.');",
 "    feedback.hidden=false;",
 "    qs('installation').value='all';qs('filter').value='all';qs('search').value='';",
 "    await reload();",
 "  }catch(err){text(output,errorText(err));",
 "    if(/disabled|enable Hydra/i.test(errorText(err)))await refreshHydraDraftStatus();}",
 "  finally{btn.disabled=false;}",
 "}",
 "async function copyHydraDraftTitle(){",
 "  if(!lastCreatedHydraDraft)return;",
 "  try{await navigator.clipboard.writeText(lastCreatedHydraDraft.name);",
 "    text(qs('hydra-draft-result'),'Title copied. Continue in Hydra Launcher on your gaming PC.');",
 "  }catch{",
 "    text(qs('hydra-draft-result'),'Select and copy the game title above, then search for it in Hydra on your gaming PC.');",
 "  }",
 "}",
 ""
]);
patch('remote/client.js',
 'async function init(){',
 web+'async function init(){',
 'web draft actions');
patch('remote/client.js',
 "  qs('refresh').onclick=()=>reload().catch(e=>alert(errorText(e)));",
 lines([
 "  qs('refresh').onclick=()=>Promise.all([reload(),refreshHydraDraftStatus()]).catch(e=>alert(errorText(e)));",
 "  qs('hydra-add-download').onclick=openHydraDraft;",
 "  qs('hydra-draft-close').onclick=qs('hydra-draft-done').onclick=qs('hydra-draft-shade').onclick=closeHydraDraft;",
 "  qs('hydra-draft-preview').onclick=previewHydraDraftOptions;",
 "  qs('hydra-draft-copy').onclick=copyHydraDraftTitle;",
 "  qs('hydra-draft-form').addEventListener('submit',submitHydraDraft);"
 ]),
 'web draft buttons');
patch('remote/client.js',
 "try{const d=await call('/api/login',{password:qs('pass').value});state.csrf=d.csrf;qs('pass').value='';toggleLogin(true);await reload();",
 "try{const d=await call('/api/login',{password:qs('pass').value});state.csrf=d.csrf;qs('pass').value='';toggleLogin(true);await reload();await refreshHydraDraftStatus();",
 'auth state refetch on login');
patch('remote/client.js',
 "qs('logout').onclick=async()=>{try{await call('/api/logout',{});}catch{}state.csrf=null;state.games=[];toggleLogin(false);};",
 "qs('logout').onclick=async()=>{try{await call('/api/logout',{});}catch{}state.csrf=null;state.games=[];hydraDraftEnabled=false;qs('hydra-add-download').hidden=true;closeHydraDraft();toggleLogin(false);};",
 'web logout hides and clears draft access');
patch('remote/client.js',
 "if(d.authenticated){toggleLogin(true);await reload();}else toggleLogin(false);",
 "if(d.authenticated){toggleLogin(true);await reload();await refreshHydraDraftStatus();}else{hydraDraftEnabled=false;toggleLogin(false);}",
 'existing session refreshes opt-in gating');
for(const f of ['main.js','remote-library.js','remote/client.js','remote/index.html']){
 if(!f.endsWith('.html'))cp.execFileSync(process.execPath,['--check',file(f)],{stdio:'inherit'});
}
console.log('PASS: Authenticated, CSRF-guarded, rate-limited Add a Download web UI and shared persistent desktop draft path');
