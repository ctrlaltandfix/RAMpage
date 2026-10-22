'use strict';
const $=s=>document.querySelector(s);
const qs=id=>document.getElementById(id);
const state={csrf:null,games:[],current:null};
const arrayFields=['genres','developers','publishers','platforms','features'];
const singleFields=['name','description','about','releaseDate','website','notes'];
const errorText=e=>e.message||'Unable to complete request';
async function call(path,body){
  const opts={credentials:'same-origin',headers:{}};
  if(body!==undefined){opts.method='POST';opts.headers['Content-Type']='application/json';opts.headers['X-Rampage-CSRF']=state.csrf||'';opts.body=JSON.stringify(body);}
  const res=await fetch(path,opts);
  const payload=await res.json().catch(()=>({error:'Invalid server response'}));
  if(!res.ok)throw Error(payload.error||'Request failed');
  return payload;
}
function toggleLogin(auth){qs('login').hidden=auth;qs('dashboard').hidden=!auth;qs('logout').hidden=!auth;}
function text(el,s){el.textContent=s||'';return el;}
function node(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
function fmtSource(g){return g.systemName||({steam:'Steam',epic:'Epic Games',gog:'GOG',custom:'Added by you'}[g.source]||g.source||'Game');}
function render(){
  const query=qs('search').value.toLowerCase().trim(),source=qs('filter').value,installed=qs('installation').value;
  const filtered=state.games.filter(g=>{
    if(source!=='all'&&g.source!==source)return false;
    if(installed==='installed'&&!g.installed||installed==='uninstalled'&&g.installed)return false;
    return !query||[g.name,fmtSource(g),...(g.meta?.genres||[])].join(' ').toLowerCase().includes(query);
  });
  const el=qs('games');el.replaceChildren();
  for(const g of filtered){
    const tile=node('button','tile');tile.type='button';tile.setAttribute('aria-label','Edit '+g.name);tile.onclick=()=>openEditor(g.id);
    const img=node('div','cover');text(img,'▣');
    if(g.cover){const image=node('img');image.src=g.cover;image.alt='';image.loading='lazy';image.onerror=()=>image.remove();img.append(image);}
    if(g.favorite){const fav=node('span','favorite');text(fav,'★');img.append(fav)}
    const body=node('div','tile-body'),name=node('div','tile-title'),meta=node('div','tile-meta');text(name,g.name);text(meta,fmtSource(g)+(g.installed?'':' · Not installed'));
    body.append(name,meta);tile.append(img,body);el.append(tile);
  }
  qs('total').textContent=state.games.length.toLocaleString();
  text(qs('stats'),`${filtered.length} game${filtered.length===1?'':'s'} displayed · ${state.games.filter(g=>g.installed).length} installed`);
  qs('empty').hidden=filtered.length!==0;
}
async function reload(){const d=await call('/api/games');state.games=d.games.sort((a,b)=>a.name.localeCompare(b.name));render();}
function openEditor(id){
  const g=state.games.find(x=>x.id===id);if(!g)return;
  state.current=id;
  text(qs('edit-title'),g.name);text(qs('save-status'),'');
  for(const k of singleFields)qs('f-'+k).value=k==='name'||k==='notes'?g[k]||'':g.meta?.[k]||'';
  for(const k of arrayFields)qs('f-'+k).value=(g.meta?.[k]||[]).join(', ');
  qs('f-coverUrl').value=g.customArtCover||'';
  qs('f-favorite').checked=g.favorite;qs('f-hidden').checked=g.hidden;
  qs('editor').hidden=false;qs('f-name').focus();
}
function closeEditor(){qs('editor').hidden=true;state.current=null;}
async function save(e){
  e.preventDefault();const g=state.games.find(x=>x.id===state.current);if(!g)return;
  const patch={};
  for(const k of singleFields)patch[k]=qs('f-'+k).value.trim();
  for(const k of arrayFields)patch[k]=qs('f-'+k).value.split(',').map(v=>v.trim()).filter(Boolean);
  patch.coverUrl=qs('f-coverUrl').value.trim();
  patch.favorite=qs('f-favorite').checked;patch.hidden=qs('f-hidden').checked;
  const save=qs('save');save.disabled=true;text(qs('save-status'),'Saving…');
  try{
    const res=await call('/api/game/'+encodeURIComponent(g.id),{updatedAt:g.updatedAt,patch});
    Object.assign(g,res.game);state.games.sort((a,b)=>a.name.localeCompare(b.name));closeEditor();render();
  }catch(err){text(qs('save-status'),errorText(err));if(/changed elsewhere/.test(errorText(err)))await reload();}
  finally{save.disabled=false;}
}
async function init(){
  for(const id of ['search','filter','installation'])qs(id).addEventListener(id==='search'?'input':'change',render);
  qs('refresh').onclick=()=>reload().catch(e=>alert(errorText(e)));
  qs('close').onclick=qs('cancel').onclick=closeEditor;
  qs('shade').onclick=closeEditor;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!qs('editor').hidden)closeEditor()});
  qs('editform').addEventListener('submit',save);
  qs('loginform').addEventListener('submit',async e=>{
    e.preventDefault();text(qs('login-error'),'');const btn=qs('loginform').querySelector('button');btn.disabled=true;
    try{const d=await call('/api/login',{password:qs('pass').value});state.csrf=d.csrf;qs('pass').value='';toggleLogin(true);await reload();}
    catch(err){text(qs('login-error'),errorText(err));}finally{btn.disabled=false;}
  });
  qs('logout').onclick=async()=>{try{await call('/api/logout',{});}catch{}state.csrf=null;state.games=[];toggleLogin(false);};
  try{const d=await call('/api/session');state.csrf=d.csrf;if(d.authenticated){toggleLogin(true);await reload();}else toggleLogin(false);}
  catch{toggleLogin(false);text(qs('login-error'),'Unable to connect to RAMpage. Confirm the PC is running.');}
}
init();
