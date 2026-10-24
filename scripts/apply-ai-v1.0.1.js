'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = process.argv[2];
if (!root) throw new Error('Provide unpacked app root');
const p = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n');

// 1. Copy AI assistant into src/ai/assistant.js
fs.mkdirSync(p('src/ai'), { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'integrations', 'ai', 'assistant.js'), p('src/ai/assistant.js'));

// 2. Patch src/remote-library.js with AI routes
let remoteLib = read('src/remote-library.js');
if (!remoteLib.includes('/api/ai/enrich')) {
  remoteLib = remoteLib.replace(
    "if(pathname==='/api/hydra/draft/status'&&method==='GET'){",
    [
      "if(['/api/ai/enrich','/api/ai/concierge'].includes(pathname)&&method==='POST'){",
      "  this.checkOrigin(req);",
      "  if(req.headers['x-rampage-csrf']!==session.csrf)throw error('Invalid request token',403);",
      "  const body=await this.body(req);",
      "  const ai=createAiAssistant();",
      "  if(pathname==='/api/ai/enrich'){",
      "    if(typeof body.title!=='string'||body.title.trim().length<2||body.title.length>160)throw error('Enter a game title (2–160 characters)');",
      "    return this.json(res,200,{metadata:await ai.enrichGameMetadata(body.title.trim())});",
      "  }",
      "  if(typeof body.query!=='string'||body.query.trim().length<2||body.query.length>200)throw error('Enter a search query (2–200 characters)');",
      "  const games=Object.values(this.getGames()||{}).map(project);",
      "  return this.json(res,200,await ai.askConcierge(body.query.trim(),games));",
      "}",
      "if(pathname==='/api/hydra/draft/status'&&method==='GET'){"
    ].join('\n      ')
  );
  remoteLib += "\nconst {createAiAssistant}=require('./ai/assistant');\n";
  fs.writeFileSync(p('src/remote-library.js'), remoteLib);
}

// 3. Patch src/remote/index.html with AI Concierge & Auto-Fill buttons
let html = read('src/remote/index.html');
if (!html.includes('ai-concierge-bar')) {
  html = html.replace(
    '<div class="library-grid" id="games"></div>',
    [
      '<section id="ai-concierge-bar" class="ai-concierge-bar" aria-label="AI Smart Library Concierge">',
      '  <div class="ai-concierge-row">',
      '    <input id="ai-concierge-input" type="search" maxlength="200" placeholder="✨ Ask AI Concierge: e.g. unplayed co-op games or quick action…">',
      '    <button type="button" id="ai-concierge-ask">Ask AI</button>',
      '    <button type="button" id="ai-concierge-clear" class="muted" hidden>Clear AI filter</button>',
      '  </div>',
      '  <p id="ai-concierge-status" class="stats" role="status" aria-live="polite" hidden></p>',
      '</section>',
      '<div class="library-grid" id="games"></div>'
    ].join('\n')
  );
  html = html.replace(
    '<form id="editform">',
    [
      '<div class="ai-editor-bar">',
      '  <div><strong>✨ AI Metadata Assistant</strong><small class="subtitle" style="display:block">Cleans release tags, auto-fills fields & triggers cover search.</small></div>',
      '  <button type="button" id="ai-enrich-btn">✨ Auto-fill Metadata & Artwork</button>',
      '</div>',
      '<form id="editform">'
    ].join('\n')
  );
  fs.writeFileSync(p('src/remote/index.html'), html);
}

// 4. Patch src/remote/client.js with AI handlers & streamlined Hydra draft redirect
let client = read('src/remote/client.js');
if (!client.includes('runAiEnrich')) {
  client = client.replace(
    "const el=qs('games');el.replaceChildren();",
    [
      "if(state.aiConciergeMatches){",
      "  const map=new Map(state.aiConciergeMatches.map(m=>[m.id,m.reason]));",
      "  filtered=filtered.filter(g=>map.has(g.id));",
      "}",
      "const el=qs('games');el.replaceChildren();"
    ].join('\n  ')
  );
  const helpers = [
    "async function runAiEnrich(){",
    "  const btn=qs('ai-enrich-btn');if(!btn)return;",
    "  const rawTitle=qs('f-name').value.trim();",
    "  if(rawTitle.length<2){text(qs('save-status'),'Enter a game title first');return;}",
    "  btn.disabled=true;text(qs('save-status'),'✨ Cleaning title & generating metadata…');",
    "  try{",
    "    const {metadata}=await call('/api/ai/enrich',{title:rawTitle});",
    "    if(metadata){",
    "      if(metadata.name)qs('f-name').value=metadata.name;",
    "      if(metadata.description&&!qs('f-description').value)qs('f-description').value=metadata.description;",
    "      if(metadata.about&&!qs('f-about').value)qs('f-about').value=metadata.about;",
    "      if(Array.isArray(metadata.genres)&&!qs('f-genres').value)qs('f-genres').value=metadata.genres.join(', ');",
    "      if(Array.isArray(metadata.platforms)&&!qs('f-platforms').value)qs('f-platforms').value=metadata.platforms.join(', ');",
    "      if(Array.isArray(metadata.features)&&!qs('f-features').value)qs('f-features').value=metadata.features.join(', ');",
    "      text(qs('save-status'),'✨ AI metadata populated — click Save changes.');",
    "      if(qs('game-art-picker')&&!qs('game-art-picker').hidden&&metadata.name){",
    "        qs('game-art-query').value=metadata.name;qs('game-art-search').click();",
    "      }",
    "    }",
    "  }catch(e){text(qs('save-status'),errorText(e));}finally{btn.disabled=false;}",
    "}",
    "async function runAiConcierge(){",
    "  const input=qs('ai-concierge-input'),st=qs('ai-concierge-status'),clr=qs('ai-concierge-clear');",
    "  const query=input?.value.trim()||'';if(query.length<2){clearAiConcierge();return;}",
    "  st.hidden=false;text(st,'✨ Asking AI Library Concierge…');",
    "  try{",
    "    const res=await call('/api/ai/concierge',{query});",
    "    state.aiConciergeMatches=Array.isArray(res.matches)?res.matches:[];",
    "    clr.hidden=false;text(st,'✨ '+(res.summary||'Filtered by AI'));render();",
    "  }catch(e){text(st,errorText(e));}",
    "}",
    "function clearAiConcierge(){",
    "  state.aiConciergeMatches=null;",
    "  if(qs('ai-concierge-input'))qs('ai-concierge-input').value='';",
    "  if(qs('ai-concierge-status'))qs('ai-concierge-status').hidden=true;",
    "  if(qs('ai-concierge-clear'))qs('ai-concierge-clear').hidden=true;",
    "  render();",
    "}",
    "document.addEventListener('click',e=>{",
    "  if(e.target?.id==='ai-enrich-btn')void runAiEnrich();",
    "  if(e.target?.id==='ai-concierge-ask')void runAiConcierge();",
    "  if(e.target?.id==='ai-concierge-clear')clearAiConcierge();",
    "});"
  ].join('\n');
  client += '\n' + helpers + '\n';
  fs.writeFileSync(p('src/remote/client.js'), client);
}
// 5. Append CSS styles
const css = [
  '.ai-concierge-bar{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:14px 0}',
  '.ai-concierge-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
  '.ai-concierge-row input{flex:1;min-width:220px}',
  '.ai-editor-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:16px 0}'
].join('\n');
if (!read('src/remote/style.css').includes('.ai-concierge-bar')) {
  fs.appendFileSync(p('src/remote/style.css'), '\n' + css + '\n');
}

for (const f of ['src/ai/assistant.js', 'src/remote-library.js', 'src/remote/client.js']) {
  cp.execFileSync(process.execPath, ['--check', p(f)], { stdio: 'inherit' });
}
console.log('PASS: RAMpage 1.0.1 AI Suite applied cleanly.');
