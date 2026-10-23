'use strict';
// Upgrade checksum-pinned official RAMpage 1.6.6 with browser-only Hydra search
// and installer/queue status for user-created Hydra download placeholders.
// No remote game installer, shell execution, Hydra session token, source URL or
// user filesystem path is exposed or invoked.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.argv[2];if(!root)throw Error('Provide official unpacked app folder');
const file=n=>path.join(root,'src',n);
function edit(name,oldText,newText,label){
 const target=file(name),original=fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n');
 const count=original.split(oldText).length-1;
 if(count!==1)throw Error('Source compatibility guard '+label+' expected 1 anchor, found '+count);
 fs.writeFileSync(target,original.replace(oldText,newText));
}
const join=a=>a.join('\n');
const tools=[
 '  <section id="hydra-game-tools" hidden aria-label="Hydra download search and installer status" class="hydra-game-tools">',
 '    <div class="hydra-tools-title">Hydra Launcher · Downloads</div>',
 '    <p class="hydra-tools-note">This RAMpage game has not been installed. Search the locally indexed Hydra catalogue or check an existing Hydra download below.</p>',
 '    <div class="hydra-tools-actions">',
 '      <button type="button" id="hydra-game-search">Search for Downloads</button>',
 '      <button type="button" id="hydra-game-status" class="muted">Download / Installer Status</button>',
 '      <button type="button" id="hydra-game-steps" class="muted">Install Using Hydra</button>',
 '      <button type="button" id="hydra-game-copy" class="muted">Copy Title</button>',
 '    </div>',
 '    <div id="hydra-game-results" role="status" aria-live="polite" class="hydra-tools-results"></div>',
 '    <p class="hydra-tools-note">Available download choices and installation are controlled by Hydra on the gaming PC. RAMpage does not initiate Hydra downloads, run installers or grant access to unauthorised content.</p>',
 '  </section>',
 ''
].join('\n');
edit('remote/index.html','<form id="editform">',tools+'<form id="editform">','Hydra game editor toolkit');
edit('remote/index.html',
 '<button type="button" id="hydra-draft-copy" class="muted" hidden>Copy game title</button>',
 '<button type="button" id="hydra-draft-search" class="muted" hidden>Search for Downloads</button><button type="button" id="hydra-draft-copy" class="muted" hidden>Copy game title</button>',
 'Search directly after new web placeholder is created');
const css=join([
 '.hydra-game-tools{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:16px;margin:0 0 18px}',
 '.hydra-tools-title{font-weight:800;color:var(--accent);font-size:14px;margin-bottom:5px}',
 '.hydra-tools-note{color:var(--muted);font-size:12px;margin:7px 0 12px}',
 '.hydra-tools-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}',
 '.hydra-tools-actions button{font-size:12px;padding:8px 11px}',
 '.hydra-tools-results{overflow-wrap:anywhere;font-size:13px}',
 '.hydra-tools-results ul{margin:7px 0 12px;padding-left:19px}',
 '.hydra-tools-results li{margin:5px 0;color:var(--text)}',
 '.hydra-tools-results h3{font-size:13px;margin:12px 0 6px;color:var(--accent)}',
 '.hydra-tools-results p{margin:8px 0;color:var(--muted)}',
 '@media(max-width:650px){.hydra-game-tools{padding:12px}.hydra-tools-actions button{flex:1 1 43%}}',
 ''
]);
const cssFile=file('remote/style.css');
const originalCss=fs.readFileSync(cssFile,'utf8');
if(originalCss.includes('.hydra-game-tools'))throw Error('Hydra download CSS already installed');
fs.appendFileSync(cssFile,'\n'+css);
edit('remote/client.js',
 "  text(qs('edit-title'),g.name);text(qs('save-status'),'');",
 join([
 "  text(qs('edit-title'),g.name);text(qs('save-status'),'');",
 "  const hydraTools=qs('hydra-game-tools');",
 "  hydraTools.hidden=!(hydraDraftEnabled && g.hydraDownloadDraft===true && g.installed===false);",
 "  text(qs('hydra-game-results'),'');"
 ]),
 'show toolkit only when Hydra opt-in and not-installed Hydra draft');
const functions=join([
 "function currentHydraDraft(){",
 " const g=state.games.find(x=>x.id===state.current);",
 " return hydraDraftEnabled && g?.hydraDownloadDraft===true && g.installed===false ? g:null;",
 "}",
 "function hydraHelp(element,message){element.replaceChildren();const p=node('p');text(p,message);element.append(p);}",
 "async function fetchHydraDownloads(){",
 " const g=currentHydraDraft();",
 " if(!g)throw Error('Enable Hydra integration on your gaming PC to search for downloads');",
 " const response=await call('/api/hydra/index?q='+encodeURIComponent(g.name));",
 " if(!response.enabled)throw Error('Hydra integration is disabled on your gaming PC');",
 " return {g,response};",
 "}",
 "async function searchHydraDownloads(){",
 " const out=qs('hydra-game-results');",
 " hydraHelp(out,'Searching Hydra’s locally cached download index…');",
 " try{",
 "   const {g,response}=await fetchHydraDownloads();",
 "   out.replaceChildren();",
 "   if(!response.sessionStored){hydraHelp(out,'No Hydra account session detected. Sign into Hydra on your PC and refresh Hydra games in RAMpage desktop Settings.');return;}",
 "   const title=node('h3');text(title,'Locally indexed matches for '+g.name);out.append(title);",
 "   const matches=(response.games||[]).slice(0,12);",
 "   if(!matches.length){",
 "      const p=node('p');text(p,'No locally cached matching downloads. This is not a live search of Hydra’s complete online catalogue. Search the title inside Hydra on your PC.');out.append(p);",
 "   }else{",
 "      const list=node('ul');",
 "      for(const match of matches){",
 "        const li=node('li');",
 "        const count=Number(match.newOptionsCount)||0;",
 "        text(li,match.title+' · '+(count?count+' newly indexed download option(s)':'No new option count cached')+(match.installed?' · Installed in Hydra':''));",
 "        list.append(li);",
 "      }",
 "      out.append(list);",
 "   }",
 "   const p=node('p');text(p,'Source links, torrents and installers are not supplied to the browser. Select an authorised download from Hydra’s own application.');out.append(p);",
 " }catch(e){hydraHelp(out,errorText(e));}",
 "}",
 "async function hydraDownloadStatus(){",
 " const out=qs('hydra-game-results');",
 " hydraHelp(out,'Reading Hydra’s last locally indexed download status…');",
 " try{",
 "   const {g,response}=await fetchHydraDownloads();",
 "   if(!response.sessionStored){hydraHelp(out,'Hydra signed-in records are unavailable. Sign into Hydra and refresh its local library in RAMpage Settings.');return;}",
 "   out.replaceChildren();",
 "   const h=node('h3');text(h,'Hydra download / installer status');out.append(h);",
 "   const items=(response.downloads||[]).slice(0,12);",
 "   if(!items.length){const p=node('p');text(p,'No matching active or historical download was found in Hydra’s cached records for '+g.name+'. Installation cannot be initiated by this web app.');out.append(p);}",
 "   else{",
 "     const list=node('ul');",
 "     for(const item of items){",
 "       const li=node('li');",
 "       const progress=Math.max(0,Math.min(100,Number(item.progress)||0));",
 "       text(li,item.title+' · '+item.status+' · '+progress+'%');",
 "       list.append(li);",
 "     }",
 "     out.append(list);",
 "   }",
 "   const p=node('p');text(p,'Last RAMpage Hydra sync: '+(response.lastSync?new Date(response.lastSync).toLocaleString():'not recorded')+'. Status is cached, not a live installer control. Refresh Hydra games in desktop Settings for newer data.');out.append(p);",
 " }catch(e){hydraHelp(out,errorText(e));}",
 "}",
 "function hydraInstallInstructions(){",
 " const out=qs('hydra-game-results'),g=currentHydraDraft();",
 " if(!g){hydraHelp(out,'Hydra integration must be enabled on the gaming PC.');return;}",
 " out.replaceChildren();",
 " const h=node('h3');text(h,'Install using Hydra on your gaming PC');out.append(h);",
 " const steps=node('ol');",
 " for(const instruction of [",
 "  'Open Hydra Launcher on the gaming PC and sign in.',",
 "  'Search for '+g.name+' in Hydra’s own catalogue.',",
 "  'Review the available download sources and choose only content you have rights to use.',",
 "  'Use Hydra’s own download/installer controls; nothing starts remotely from RAMpage.',",
 "  'After installation, open this game’s Properties in desktop RAMpage and link the installed executable.'",
 " ]){const li=node('li');text(li,instruction);steps.append(li)}",
 " out.append(steps);",
 "}",
 "async function copyHydraGameTitle(){",
 " const g=currentHydraDraft();if(!g)return;",
 " const out=qs('hydra-game-results');",
 " try{await navigator.clipboard.writeText(g.name);hydraHelp(out,'Game title copied. Search for it in Hydra Launcher on your gaming PC.');}",
 " catch{hydraHelp(out,'Copy this game title manually: '+g.name);}",
 "}",
 "function searchNewHydraDraft(){",
 " if(!lastCreatedHydraDraft)return;",
 " const id=lastCreatedHydraDraft.id;",
 " closeHydraDraft();",
 " openEditor(id);",
 " if(currentHydraDraft())void searchHydraDownloads();",
 "}",
 ""
]);
edit('remote/client.js',
 "async function init(){",
 functions+"async function init(){",
 'add authenticated game-level read-only Hydra search and installer help');
edit('remote/client.js',
 "  qs('hydra-draft-copy').onclick=copyHydraDraftTitle;",
 join([
 "  qs('hydra-draft-copy').onclick=copyHydraDraftTitle;",
 "  qs('hydra-draft-search').onclick=searchNewHydraDraft;",
 "  qs('hydra-game-search').onclick=searchHydraDownloads;",
 "  qs('hydra-game-status').onclick=hydraDownloadStatus;",
 "  qs('hydra-game-steps').onclick=hydraInstallInstructions;",
 "  qs('hydra-game-copy').onclick=copyHydraGameTitle;"
 ]),
 'wire game search and installer guidance controls');
edit('remote/client.js',
 "  qs('hydra-draft-copy').hidden=true;",
 "  qs('hydra-draft-copy').hidden=true;\n  qs('hydra-draft-search').hidden=true;",
 'hide create-time search action until draft exists');
edit('remote/client.js',
 "    qs('hydra-draft-copy').hidden=false;",
 "    qs('hydra-draft-copy').hidden=false;\n    qs('hydra-draft-search').hidden=false;",
 'offer search immediately after add a download');
for(const p of ['remote/client.js','remote-library.js','main.js'])cp.execFileSync(process.execPath,['--check',file(p)],{stdio:'inherit'});
console.log('PASS: after adding a Hydra game, web editor shows local indexed download search, cached status, PC installation instructions; no file/downloader control');
