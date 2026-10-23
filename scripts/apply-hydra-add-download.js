'use strict';
// Safe desktop-only Hydra handoff applied to checksum-pinned RAMpage v1.6.4.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.argv[2];if(!root)throw Error('Pass unpacked RAMpage app');
const file=n=>path.join(root,'src',n);
function patch(name,anchor,next,label){
 const fn=file(name),s=fs.readFileSync(fn,'utf8').replace(/\r\n/g,'\n');
 const count=s.split(anchor).length-1;
 if(count!==1)throw Error('Incompatible baseline '+label+': '+count+' anchors');
 fs.writeFileSync(fn,s.replace(anchor,next));
}
const lines=a=>a.join('\n');
fs.copyFileSync(path.join(__dirname,'..','src','hydra-download-draft.js'),file('hydra-download-draft.js'));
patch('main.js',"const { HydraRemoteProvider } = require('./hydra-remote-provider');",
 "const { HydraRemoteProvider } = require('./hydra-remote-provider');\n"+
 "const {cleanTitle,requireHydraEnabled,createHydraDownloadDraft,sanitizedOptions} = require('./hydra-download-draft');",'import');
patch('main.js',"ipcMain.handle('game:openFolder', (_e, id) => {",lines([
 "// Desktop IPC only: public remote library has no endpoint to create or download games.",
 "ipcMain.handle('hydra:draft-create', (_e, title) => {",
 "  requireHydraEnabled(hydraRemoteProvider.status().enabled);",
 "  const name=cleanTitle(title);",
 "  const existing=Object.values(store.games).find(g=>g?.hydraDownloadDraft && g.installed===false && g.name.toLowerCase()===name.toLowerCase());",
 "  if(existing)return {ok:true,id:existing.id,created:false,name:existing.name};",
 "  const draft=createHydraDownloadDraft(name);store.games[draft.id]=draft;",
 "  const ok=saveGame(draft.id);",
 "  if(!ok || !storage.verifyGameOnDisk(draft.id).ok){delete store.games[draft.id];throw Error('Could not save the game. Check RAMpage storage diagnostics.');}",
 "  push();return {ok:true,id:draft.id,created:true,name:draft.name};",
 "});",
 "ipcMain.handle('hydra:draft-options', (_e, title) => {",
 "  requireHydraEnabled(hydraRemoteProvider.status().enabled);",
 "  const term=cleanTitle(title);return sanitizedOptions(hydraRemoteProvider.getIndex(term),term);",
 "});",
 "ipcMain.handle('hydra:draft-open', async (_e, id) => {",
 "  requireHydraEnabled(hydraRemoteProvider.status().enabled);",
 "  const game=store.games[id];",
 "  if(!game?.hydraDownloadDraft || game.installed!==false)throw Error('This is not an uninstalled Hydra game entry');",
 "  // Hydra has no supported deep link for an individual game's download choices.",
 "  // Copy the search title and open/focus its registered custom-protocol handler.",
 "  require('electron').clipboard.writeText(game.name);",
 "  await shell.openExternal('hydralauncher://');",
 "  return {ok:true,message:'Hydra opened. Paste the copied title into Hydra search and select an available download.'};",
 "});",
 "ipcMain.handle('game:openFolder', (_e, id) => {"
]),'desktop Hydra IPC');
patch('preload.js',"  addGame: (payload) => ipcRenderer.invoke('game:add', payload),",lines([
 "  addGame: (payload) => ipcRenderer.invoke('game:add', payload),",
 "  createHydraDownloadDraft: (name) => ipcRenderer.invoke('hydra:draft-create',name),",
 "  hydraDraftOptions: (name) => ipcRenderer.invoke('hydra:draft-options',name),",
 "  openHydraDraft: (id) => ipcRenderer.invoke('hydra:draft-open',id),"
]),'Hydra preload functions');
patch('renderer/app.js',"const WIZ = { step: 'what', systemId: null, emulatorPath: null, systems: [], added: [] };",
 "const WIZ = { step: 'what', systemId: null, emulatorPath: null, systems: [], added: [], hydraEnabled:false, hydraDraft:null };",'wizard state');
patch('renderer/app.js',"  WIZ.step = 'what'; WIZ.systemId = null; WIZ.emulatorPath = null; WIZ.added = [];",
 "  WIZ.step = 'what'; WIZ.systemId = null; WIZ.emulatorPath = null; WIZ.added = []; WIZ.hydraEnabled=false; WIZ.hydraDraft=null;",'wizard reset');
patch('renderer/app.js',"    drawWizard();\n  });\n}\n\nconst wizHead",lines([
 "    drawWizard();",
 "    api.hydraRemoteStatus?.().then(s=>{",
 "      if(!WIZ.root?.isConnected)return;",
 "      WIZ.hydraEnabled=s?.enabled===true;",
 "      if(WIZ.step==='what')drawWizard();",
 "    }).catch(()=>{WIZ.hydraEnabled=false;});",
 "  });",
 "}",
 "",
 "const wizHead"
]),'async settings check');
patch('renderer/app.js',"  else if (WIZ.step === 'working') el.innerHTML = wizWorking();",lines([
 "  else if (WIZ.step === 'working') el.innerHTML = wizWorking();",
 "  else if (WIZ.step === 'hydra-download') el.innerHTML = wizHydraDownload();",
 "  else if (WIZ.step === 'hydra-created') el.innerHTML = wizHydraCreated();"
]),'step registration');
patch('renderer/app.js',"  el.onclick = onWizardClick;",lines([
 "  if(WIZ.step==='what' && WIZ.hydraEnabled){",
 "    const rom=el.querySelector('[data-wiz=\"rom\"]');",
 "    if(rom){const button=document.createElement('button');",
 "      button.className='wiz-choice';button.dataset.wiz='hydra-download';",
 "      button.innerHTML='<span class=\"wiz-ico\"><svg><use href=\"#i-plus\"/></svg></span>'+",
 "        '<span class=\"wiz-copy\"><b>Download a Game</b><small>Create an uninstalled entry, then open Hydra to choose a download. No files are downloaded automatically.</small></span>'+",
 "        '<span class=\"wiz-go\"><svg style=\"transform:scaleX(-1)\"><use href=\"#i-back\"/></svg></span>';",
 "      rom.parentNode.insertBefore(button,rom);}",
 "  }",
 "  el.onclick = onWizardClick;",
 "  if(WIZ.step==='hydra-created')void showHydraOptionPreview();"
]),'conditionally visible wizard choice');
const views=lines([
 "function wizHydraDownload(){",
 " return wizHead('Download a Game','Create an empty entry, then select the download in Hydra Launcher.','what')+",
 " '<div class=\"add-card\" style=\"padding:16px\"><label for=\"wiz-hydra-title\"><b>Game title</b></label>'+",
 " '<input id=\"wiz-hydra-title\" class=\"key-input\" style=\"width:100%;margin-top:8px\" maxlength=\"160\" autocomplete=\"off\" placeholder=\"Enter game title\">'+",
 " '<p class=\"hint\">This creates a Not installed entry, without a game executable. Link the installed file through Properties after downloading.</p>'+",
 " '<p class=\"hint\">Hydra handles all download selection. RAMpage never obtains Hydra credentials or game downloads. Only choose content you have rights to use.</p></div>'+",
 " '<div id=\"wiz-hydra-message\" class=\"hint\" aria-live=\"polite\"></div>'+",
 " '<div class=\"modal-actions\"><button class=\"btn\" data-wiz=\"what\">Back</button><button class=\"btn primary\" data-wiz=\"hydra-create\">Create empty game entry</button></div>';",
 "}",
 "function wizHydraCreated(){",
 " const game=WIZ.hydraDraft;",
 " return wizHead('Game added — not installed','The library entry is saved. Continue in Hydra Launcher.','what')+",
 " '<div class=\"add-card\" style=\"padding:16px\"><b>'+esc(game?.name||'Game')+'</b>'+",
 " '<p class=\"hint\">The game title will be copied to your clipboard. Paste it into the Hydra search to see available downloads.</p>'+",
 " '<div id=\"wiz-hydra-options\" class=\"hint\">Checking locally cached download-option counts…</div>'+",
 " '<p class=\"hint\">Hydra itself starts and manages downloads. RAMpage does not initiate them.</p></div>'+",
 " '<div class=\"modal-actions\"><button class=\"btn\" data-wiz=\"cancel\">Done</button>'+",
 " '<button class=\"btn primary\" data-wiz=\"hydra-open\">Open Hydra available downloads</button></div>';",
 "}",
 "async function showHydraOptionPreview(){",
 " if(!WIZ.hydraDraft||!WIZ.root?.isConnected)return;",
 " const el=WIZ.root.querySelector('#wiz-hydra-options');if(!el)return;",
 " try{const data=await api.hydraDraftOptions(WIZ.hydraDraft.name);",
 "   if(!el.isConnected)return;",
 "   if(!data.storedSession){el.textContent='Hydra account not detected. Sign into Hydra and refresh Hydra games in Settings.';return;}",
 "   const game=(data.matches||[]).find(x=>x.title.toLowerCase()===WIZ.hydraDraft.name.toLowerCase());",
 "   el.textContent=game?.newOptionsCount ? game.newOptionsCount+' newly cached download options. Open Hydra to see the actual choices.' :",
 "     'No new-option count cached. Open Hydra and search for current available downloads.';",
 " }catch{if(el.isConnected)el.textContent='Preview unavailable. You can still search inside Hydra.';}",
 "}",
 ""
]);
patch('renderer/app.js',"function wizSystem() {",views+"function wizSystem() {",'Hydra wizard content');
patch('renderer/app.js',"    case 'restart': WIZ.step = 'what'; WIZ.systemId = null; WIZ.emulatorPath = null; WIZ.added = []; return drawWizard();",lines([
 "    case 'restart': WIZ.step = 'what'; WIZ.systemId = null; WIZ.emulatorPath = null; WIZ.added = []; return drawWizard();",
 "    case 'hydra-download':",
 "      if(!WIZ.hydraEnabled)return toast('Enable Hydra integration in Settings first',true);",
 "      WIZ.step='hydra-download';return drawWizard();",
 "    case 'hydra-create': {",
 "      if(!WIZ.hydraEnabled)return toast('Hydra integration is disabled',true);",
 "      const name=WIZ.root.querySelector('#wiz-hydra-title')?.value?.trim()||'';",
 "      const msg=WIZ.root.querySelector('#wiz-hydra-message');",
 "      b.disabled=true;",
 "      try{const res=await api.createHydraDownloadDraft(name);",
 "        if(!res?.ok)throw Error(res?.error||'Game could not be saved');",
 "        WIZ.hydraDraft={id:res.id,name:res.name};WIZ.step='hydra-created';drawWizard();",
 "        toast(res.created?'Empty game entry saved':'Existing uninstalled placeholder selected');",
 "      }catch(err){if(msg)msg.textContent=err.message||'Could not save game';}",
 "      finally{b.disabled=false;}return;",
 "    }",
 "    case 'hydra-open': {",
 "      if(!WIZ.hydraDraft)return;",
 "      b.disabled=true;",
 "      try{const r=await api.openHydraDraft(WIZ.hydraDraft.id);toast(r.message||'Hydra opened');}",
 "      catch(err){toast('Unable to open Hydra. '+(err.message||''),true);}",
 "      finally{b.disabled=false;}return;",
 "    }"
]),'wizard game create/open click');
const dollar=String.fromCharCode(36);
patch('renderer/app.js',
 '            <button data-act="editmeta"><svg><use href="#i-edit"/></svg>Edit game info</button>',
 '            <button data-act="editmeta"><svg><use href="#i-edit"/></svg>Edit game info</button>\n'+
 '            '+dollar+"{g.hydraDownloadDraft && g.installed === false ? '<button data-act=\"hydra-download\"><svg><use href=\"#i-plus\"/></svg>Open Hydra available downloads</button>' : ''}",
 'persistent Hydra access from detail view');
patch('renderer/app.js',"        case 'editmeta': return g && openMetaEdit(g);",
 "        case 'editmeta': return g && openMetaEdit(g);\n"+
 "        case 'hydra-download': return g && api.openHydraDraft(g.id).then(r=>toast(r.message||'Hydra opened')).catch(err=>toast(err.message||'Could not open Hydra',true));",
 'detail view click action');
// A downloaded entry becomes playable only when the user explicitly links a real game executable.
patch('main.js',
 "  for (const k of allowed) if (k in patch) g[k] = patch[k];",
 lines([
 "  for (const k of allowed) if (k in patch) g[k] = patch[k];",
 "  if(g.hydraDownloadDraft && typeof patch.exePath==='string' &&",
 "     /\\.(exe|lnk)$/i.test(patch.exePath) && fs.existsSync(patch.exePath) &&",
 "     fs.statSync(patch.exePath).isFile()){",
 "    g.installed=true;g.hydraDownloadStatus='installed';",
 "  }"
 ]),'user links downloaded executable in Properties');
patch('renderer/app.js',
 "  // Already playing: don't start a second copy — put the one that's running back in",
 lines([
 "  if(g.hydraDownloadDraft && g.installed===false){",
 "    try{const r=await api.openHydraDraft(id);toast(r.message||'Hydra opened');}",
 "    catch(e){toast(e.message||'Could not open Hydra',true);}",
 "    return;",
 "  }",
 "  // Already playing: don't start a second copy — put the one that's running back in"
 ]),'uninstalled placeholder Play action opens Hydra instead of trying missing .exe');
patch('renderer/app.js',
 "function playBtn(g) {\n",
 lines([
 "function playBtn(g) {",
 "  if(g.hydraDownloadDraft && g.installed===false){",
 "    return '<button class=\"play-btn\" data-play=\"'+esc(g.id)+'\"><svg><use href=\"#i-plus\"/></svg>Download in Hydra</button>';",
 "  }",
 ""
 ]),'download action instead of Play on uninstalled entry');
for(const p of ['main.js','preload.js','renderer/app.js','hydra-download-draft.js'])
 cp.execFileSync(process.execPath,['--check',file(p)],{stdio:'inherit'});
console.log('PASS: Hydra option gated by desktop Settings, uninstalled placeholder saved and Hydra handoff added');
