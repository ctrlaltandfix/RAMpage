'use strict';
// Apply an informational notice to the actual, checksum-pinned v1.6.2 app.
// No changes to Hydra permissions, the remote API, account data or saving logic.
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const root=process.argv[2];
if(!root)throw Error('Usage: node apply-hydra-disclaimer.js <unpacked-RAMpage>');
const settings=path.join(root,'src','renderer','app.js');
const html=path.join(root,'src','remote','index.html');
const web=path.join(root,'src','remote','client.js');
function once(input,from,to,label){
 const n=input.split(from).length-1;
 if(n!==1)throw Error('Incompatible baseline for '+label+': expected 1 anchor; got '+n);
 return input.replace(from,to);
}
const DISCLAIMER="Hydra Launcher is an alternative game launcher. RAMpage's optional Hydra integration only lets you view library information and edit RAMpage metadata. It does not provide, download, distribute, or grant access to pirated or otherwise unauthorised games or content.";
let app=fs.readFileSync(settings,'utf8');
app=once(app,
 '      <small>Disabled until you enable this option. No Hydra account, executable paths or download sources are sent to remote visitors.</small>',
 '      <small>Disabled until you enable this option. No Hydra account, executable paths or download sources are sent to remote visitors.</small>\n'
 +'      <small id="s-hydra-disclaimer" role="note" style="display:block;margin-top:9px;line-height:1.55;opacity:.85"><strong>Disclaimer:</strong> '+DISCLAIMER+'</small>',
 'desktop Settings disclaimer');
let site=fs.readFileSync(html,'utf8');
site=once(site,
 '<p id="stats" class="stats"></p>',
 '<p id="hydra-disclaimer" role="note" class="stats" style="padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.17);line-height:1.55" hidden><strong>Hydra Launcher disclaimer:</strong> '+DISCLAIMER+'</p>\n<p id="stats" class="stats"></p>',
 'authenticated web-library disclaimer');
let js=fs.readFileSync(web,'utf8');
js=once(js,
 "function render(){\n",
 [
 "function render(){",
 "  // Show the notice only for opt-in Hydra games in the authenticated catalogue.",
 "  const hydraDisclaimer=qs('hydra-disclaimer');",
 "  if(hydraDisclaimer)hydraDisclaimer.hidden=!state.games.some(g=>g.source==='hydra');",
 ""
 ].join('\n'),
 'conditional remote-library disclaimer');
fs.writeFileSync(settings,app);
fs.writeFileSync(html,site);
fs.writeFileSync(web,js);
for(const f of [settings,web])cp.execFileSync(process.execPath,['--check',f],{stdio:'inherit'});
if(!fs.readFileSync(settings,'utf8').includes(DISCLAIMER)||!fs.readFileSync(html,'utf8').includes(DISCLAIMER))throw Error('Disclaimer missing');
console.log('PASS: disclaimer appears in Hydra Settings and only for opted-in Hydra records in the remote library');
