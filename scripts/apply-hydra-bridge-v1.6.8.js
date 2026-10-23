'use strict';
/**
 * Patch a SHA256-verified official v1.6.7 extracted application.
 * Adds capability-gated Hydra UI and authenticated bridge diagnostics,
 * but intentionally does not install a downloader or alter Hydra itself.
 */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.argv[2];if(!root)throw Error('Provide extracted official v1.6.7 application path');
const p=n=>path.join(root,'src',n);
const read=n=>fs.readFileSync(p(n),'utf8').replace(/\r\n/g,'\n');
const change=(name,from,to,label)=>{
 const original=read(name),count=original.split(from).length-1;
 if(count!==1)throw Error(label+': expected exactly one production anchor, found '+count);
 fs.writeFileSync(p(name),original.replace(from,to));
};
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(pkg.version!=='1.6.7'||pkg.updates?.github!=='ctrlaltandfix/RAMpage')
 throw Error('Refusing to patch any application except authentic v1.6.7 RAMpage');
if(read('remote-library.js').includes('/api/hydra/bridge/'))
 throw Error('Hydra bridge is already present: source patch is not idempotent');
const integrations=path.join(__dirname,'..','integrations','hydra');
const target=path.join(root,'src','hydra-bridge');
fs.mkdirSync(target,{recursive:true});
for(const f of ['bridge.js','routes.js','companion-client.js'])fs.copyFileSync(path.join(integrations,f),path.join(target,f));
const serverInit=[
 "    // Bridge is unavailable until an independently supported Hydra-side component",
 "    // is explicitly paired on the gaming PC. No external private IPC is invoked.",
 "    // Developer-only local companion pairing. Disabled in normal RAMpage launches.",
 "    // Stock Hydra Launcher does not implement this protocol.",
 "    this.hydraCompanion=null;",
 "    const hydraDevPort=Number(process.env.RAMPAGE_HYDRA_COMPANION_DEV_PORT);",
 "    if(process.env.RAMPAGE_HYDRA_COMPANION_DEV_ENABLED==='1' &&",
 "       Number.isSafeInteger(hydraDevPort) && hydraDevPort>0 && hydraDevPort<65536){",
 "      try{this.hydraCompanion=createHydraCompanionClient({",
 "        baseUrl:'http://127.0.0.1:'+hydraDevPort,token:process.env.RAMPAGE_HYDRA_COMPANION_DEV_TOKEN",
 "      });}catch{/* Stay disconnected; do not log local pairing tokens. */}",
 "    }",
 "    this.hydraBridgeRoute = createHydraRoutes({",
 "      bridge:createHydraBridge(this.hydraCompanion),",
 "      resolveSession:req=>{",
 "        const s=this.session(req);",
 "        return s?{authenticated:true,hydraEnabled:this.hydraDraftEnabled()===true,",
 "          canManageDownloads:this.hydraCompanion!==null,csrf:s.csrf}:null;",
 "      },",
 "      verifyOrigin:req=>{try{this.checkOrigin(req);return true;}catch{return false;}},",
 "      verifyCsrf:(req,session)=>req.headers['x-rampage-csrf']===session.csrf,",
 "      checkRateLimit:req=>{",
 "        const s=this.session(req);if(!s)return false;",
 "        const now=Date.now();s.hydraBridgeTimes=(s.hydraBridgeTimes||[]).filter(t=>now-t<60000);",
 "        if(s.hydraBridgeTimes.length>=60)return false;",
 "        s.hydraBridgeTimes.push(now);return true;",
 "      }",
 "    });"
].join('\n');
change('remote-library.js',
 "    this.hydraDraftEnabled=hydraDraftEnabled;this.createHydraDraft=createHydraDraft;this.getHydraDraftOptions=getHydraDraftOptions;",
 "    this.hydraDraftEnabled=hydraDraftEnabled;this.createHydraDraft=createHydraDraft;this.getHydraDraftOptions=getHydraDraftOptions;\n"+serverInit,
 'bridge constructor with existing Hydra opt-in');
change('remote-library.js',
 "      if(pathname==='/api/hydra/draft/status'&&method==='GET'){",
 "      if(pathname.startsWith('/api/hydra/bridge/'))return await this.hydraBridgeRoute(req,res);\n"+
 "      if(pathname==='/api/hydra/draft/status'&&method==='GET'){",
 'authenticated bridge route location');
fs.appendFileSync(p('remote-library.js'),
 "\n// Load guarded companion boundary only after the production module has initialised.\n"+
 "const {createHydraBridge}=require('./hydra-bridge/bridge');\n"+
 "const {createHydraRoutes}=require('./hydra-bridge/routes');\n"+
 "const {createHydraCompanionClient}=require('./hydra-bridge/companion-client');\n");
change('remote/index.html',
 '<div id="hydra-game-results" role="status" aria-live="polite" class="hydra-tools-results"></div>',
 '<div id="hydra-game-results" role="status" aria-live="polite" class="hydra-tools-results"></div>'+
 '<div id="hydra-bridge-panel" aria-label="Hydra companion connection"></div>',
 'mount point in existing game editor');
const browserClient=fs.readFileSync(path.join(integrations,'web-client.js'),'utf8');
const browserPanel=fs.readFileSync(path.join(integrations,'web-panel.js'),'utf8');
if(!browserClient.includes('window.RAMpageHydraWebClient')||
   !browserPanel.includes('window.RAMpageHydraDownloadPanel')) throw Error('Missing browser-compatible bridge UI');
change('remote/client.js',
 "async function init(){",
 browserClient+'\n'+browserPanel+'\nasync function init(){',
 'initialize development panel methods before web UI startup');
change('remote/client.js',
 "  text(qs('hydra-game-results'),'');",
 [
 "  text(qs('hydra-game-results'),'');",
 "  if(window.rampageHydraBridgePanel){window.rampageHydraBridgePanel.destroy();window.rampageHydraBridgePanel=null;}",
 "  if(!hydraTools.hidden){",
 "    window.rampageHydraBridgePanel=mountHydraDownloadPanel(qs('hydra-bridge-panel'),{",
 "      client:createHydraWebClient({csrfToken:state.csrf}),gameId:g.id,gameTitle:g.name,pollMs:10000",
 "    });",
 "  }"
 ].join('\n'),
 'embed gated companion panel beside legacy cached search');
change('remote/client.js',
 "function closeEditor(){qs('editor').hidden=true;state.current=null;}",
 "function closeEditor(){if(window.rampageHydraBridgePanel){window.rampageHydraBridgePanel.destroy();window.rampageHydraBridgePanel=null;}qs('editor').hidden=true;state.current=null;}",
 'stop poller when game editor closes');
const css=[
 ".hydra-download-panel{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}",
 ".hydra-download-panel h3{font-size:14px;margin:0 0 8px}",
 ".hydra-download-panel h4{font-size:12px;margin:10px 0}",
 ".hydra-download-panel .hydra-actions{display:flex;gap:8px;flex-wrap:wrap}",
 ".hydra-download-panel .hydra-actions button,.hydra-transfer button{font-size:12px;padding:7px 10px;margin:5px}",
 ".hydra-transfer,.hydra-result{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:7px 0}",
 ".hydra-transfer progress{width:120px;max-width:100%}",
 ".hydra-download-panel .hydra-status{font-size:12px;color:var(--muted)}",
 ".hydra-download-panel .hydra-filter-row{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}",
 ".hydra-download-panel .hydra-filter-row input{min-width:160px;flex:1}",
 ".hydra-download-panel .hydra-filter-row select{min-width:135px;flex:0 1 auto}",
 ".hydra-download-panel .hydra-option{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin:8px 0;display:flex;flex-direction:column;align-items:flex-start;gap:6px}",
 ".hydra-download-panel .hydra-option-title{font-weight:650;color:var(--text);overflow-wrap:anywhere}",
 ".hydra-download-panel .hydra-option small{color:var(--muted);font-size:12px}",
 ".hydra-download-panel .hydra-settings{padding:12px 0}",
 ".hydra-download-panel .hydra-settings select{width:100%;margin:8px 0}",
 ".hydra-download-panel .hydra-check{display:flex;align-items:center;gap:9px;margin:12px 0;font-size:12px}",
 ".hydra-download-panel .hydra-check input{width:auto;flex:0 0 auto}",
 ".hydra-download-panel .hydra-transfer{display:block;background:var(--card);border-radius:10px;border:1px solid var(--line);padding:12px;margin:10px 0}",
 ".hydra-download-panel .hydra-transfer progress{display:block;width:100%;height:8px;margin:10px 0}",
 "@media(max-width:600px){.hydra-download-panel .hydra-filter-row{flex-direction:column}.hydra-download-panel .hydra-filter-row>*{width:100%}}"
].join('\n');
fs.appendFileSync(p('remote/style.css'),'\n'+css+'\n');
for(const name of ['remote-library.js','remote/client.js','hydra-bridge/bridge.js','hydra-bridge/routes.js']){
 cp.execFileSync(process.execPath,['--check',p(name)],{stdio:'inherit'});
}
console.log('PASS: Official RAMpage v1.6.7 patched with Hydra workflow. Stock Hydra has no external control API. Development companion requires explicit local opt-in.');
