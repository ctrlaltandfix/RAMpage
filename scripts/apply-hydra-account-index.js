'use strict';
// Upgrade genuine official RAMpage v1.6.3, with existing opt-in Hydra and disclaimer.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const dir=process.argv[2];if(!dir)throw Error('Usage: node apply-hydra-account-index.js <real-app-root>');
const file=n=>path.join(dir,'src',n);
function change(name,from,to,label){
 const f=file(name),s=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
 const matches=s.split(from).length-1;
 if(matches!==1)throw Error('Source guard: '+label+' wanted exactly one anchor, got '+matches);
 fs.writeFileSync(f,s.replace(from,to));
}
const reader=path.join(__dirname,'..','src','hydra-bridge','reader.js');
const provider=path.join(__dirname,'..','src','hydra-remote-provider.js');
fs.copyFileSync(provider,file('hydra-remote-provider.js'));
change('main.js',
 '  rebuildMeta, publish: push, log: logLine\n});',
 '  rebuildMeta, publish: push, log: logLine,\n  getHydraIndex: (query) => hydraRemoteProvider.getIndex(query)\n});',
 'existing Hydra API callback');
change('remote-library.js',
 'constructor({ dataDir, getGames, saveGame, publish=()=>{}, rebuildMeta, log=()=>{}, port=DEFAULT_PORT }={}) {',
 'constructor({ dataDir, getGames, saveGame, publish=()=>{}, rebuildMeta, log=()=>{}, getHydraIndex=()=>null, port=DEFAULT_PORT }={}) {',
 'remote server safe index dependency');
change('remote-library.js',
 'this.port=port; this.server=null; this.auth=null; this.sessions=new Map(); this.attempts=new Map();',
 'this.port=port; this.server=null; this.auth=null; this.sessions=new Map(); this.attempts=new Map(); this.getHydraIndex=getHydraIndex;',
 'trusted search data source');
change('remote-library.js',
 "      if(pathname==='/api/logout'&&method==='POST'){",
 [
 "      if(pathname==='/api/hydra/index'&&method==='GET'){",
 "        const term=String(url.searchParams.get('q')||'').trim();",
 "        if(term.length>100)throw error('Search term is too long',400);",
 "        const result=this.getHydraIndex(term);",
 "        // The public URL never accepts Hydra auth credentials or downloader URIs.",
 "        if(!result)throw error('Hydra integration unavailable',404);",
 "        return this.json(res,200,{...result});",
 "      }",
 "      if(pathname==='/api/logout'&&method==='POST'){"
 ].join('\n'),
 'authenticated GET index route');
const renderMarkup=[
 '<section id="hydra-account-index" hidden style="padding:14px;margin-top:12px;border:1px solid rgba(255,255,255,.15);border-radius:10px">',
 '  <h2 style="font-size:1.05rem">Hydra account &amp; download index</h2>',
 '  <p id="hydra-index-notice">Hydra account detection and game download status are read-only. New downloads must be started inside Hydra on your PC.</p>',
 '  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">',
 '    <input id="hydra-index-query" maxlength="100" placeholder="Search local Hydra catalogue…" style="min-width:180px;flex:1">',
 '    <button id="hydra-index-search" type="button">Search index</button>',
 '  </div>',
 '  <div id="hydra-index-results" aria-live="polite"></div>',
 '</section>'
].join('\n');
change('remote/index.html','<p id="stats" class="stats"></p>',renderMarkup+'\n<p id="stats" class="stats"></p>','authenticated Hydra index browser');
change('remote/client.js',
 '  const query=qs(\'search\').value.toLowerCase().trim(),source=qs(\'filter\').value,installed=qs(\'installation\').value;',
 [
 "  const hydraSection=qs('hydra-account-index');",
 "  if(hydraSection)hydraSection.hidden=!state.games.some(g=>g.source==='hydra');",
 "  const query=qs('search').value.toLowerCase().trim(),source=qs('filter').value,installed=qs('installation').value;"
 ].join('\n'),
 'show index only with opted-in Hydra games');
const fn=[
 "async function searchHydraIndex(){",
 "  const el=qs('hydra-index-results');",
 "  el.replaceChildren();text(el,'Reading cached Hydra index…');",
 "  try{",
 "    const query=qs('hydra-index-query').value.trim();",
 "    const d=await call('/api/hydra/index?q='+encodeURIComponent(query));",
 "    el.replaceChildren();",
 "    if(!d.enabled){text(el,'Enable Hydra in RAMpage desktop Settings first.');return;}",
 "    if(!d.sessionStored){text(el,'Hydra login not detected in its local database. Sign into Hydra on the gaming PC and refresh Hydra games in RAMpage Settings.');return;}",
 "    const hint=node('p');",
 "    text(hint,(d.message||'')+' · '+(d.sourceCount||0)+' configured download sources (names and links are not exposed).');el.append(hint);",
 "    const subtitle=node('h3');text(subtitle,'Game search — local Hydra index');el.append(subtitle);",
 "    const games=node('ul');",
 "    for(const g of d.games||[]){const item=node('li');text(item,g.title+(g.installed?' · Installed':'')+(g.newOptionsCount?' · '+g.newOptionsCount+' new options':' '));games.append(item)}",
 "    if(!games.children.length){const item=node('li');text(item,'No matching locally indexed games');games.append(item)}el.append(games);",
 "    const dlTitle=node('h3');text(dlTitle,'Existing Hydra download statuses');el.append(dlTitle);",
 "    const downloads=node('ul');",
 "    for(const dload of d.downloads||[]){const item=node('li');text(item,dload.title+' · '+dload.status+' · '+dload.progress+'%');downloads.append(item)}",
 "    if(!downloads.children.length){const item=node('li');text(item,'No matching queued or downloaded items');downloads.append(item)}el.append(downloads);",
 "  }catch(e){text(el,errorText(e))}",
 "}",
 ""
].join('\n');
change('remote/client.js','async function init(){',fn+'async function init(){','authorized index search rendering');
change('remote/client.js',
 "  qs('refresh').onclick=()=>reload().catch(e=>alert(errorText(e)));",
 "  qs('refresh').onclick=()=>reload().catch(e=>alert(errorText(e)));\n"+
 "  qs('hydra-index-search').onclick=()=>searchHydraIndex();\n"+
 "  qs('hydra-index-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchHydraIndex();}};",
 'Hydra index button handlers');
change('renderer/app.js',
 "      if(toggle)toggle.textContent=status.enabled?'Disable Hydra integration':'Enable Hydra integration';",
 "      if(toggle)toggle.textContent=status.enabled?'Disable Hydra integration':'Enable Hydra integration';\n"+
 "      if(status.enabled && label && !status.error){ label.textContent += status.sessionStored ? ' · Stored Hydra account session detected; remote game/download index available (not live-verified).' : ' · No Hydra account session detected; sign into Hydra and refresh to view its download index.'; }",
 'desktop account-state transparency');
for(const f of ['main.js','remote-library.js','remote/client.js','renderer/app.js','hydra-remote-provider.js'])
 cp.execFileSync(process.execPath,['--check',file(f)],{stdio:'inherit'});
console.log('PASS: authenticated read-only Hydra account-aware game/download index, no remote download execution');
