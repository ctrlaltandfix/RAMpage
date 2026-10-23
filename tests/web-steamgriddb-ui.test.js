'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.RAMPAGE_JSDOM_MODULE||'jsdom');
const root=process.env.RAMPAGE_APP_ROOT;
const tick=()=>new Promise(r=>setTimeout(r,15));
test('web users choose artwork for an existing game and a new download; missing integration stays optional',async t=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'src/remote/index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,d=w.document;w.scrollTo=()=>{};let configured=true,next=1;const edits=[];
 const games=[{id:'demo',name:'Demo',installed:false,meta:{},updatedAt:0,hydraDownloadDraft:true}];
 const cover='https://cdn2.steamgriddb.com/grid/demo.png';
 w.fetch=async(url,opts={})=>{
  const body=opts.body?JSON.parse(opts.body):{};let payload={};
  if(url==='/api/session')payload={authenticated:true,csrf:'token'};
  else if(url==='/api/games')payload={games};
  else if(url==='/api/hydra/draft/status')payload={enabled:true};
  else if(url==='/api/artwork/status')payload={enabled:configured};
  else if(url==='/api/artwork/search')payload={games:[{id:123,name:body.title,year:2025}]};
  else if(url==='/api/artwork/covers')payload={covers:[cover]};
  else if(url.includes('/bridge/status'))payload={data:{connected:false}};
  else if(url==='/api/hydra/draft'){const game={id:'new-'+next++,name:body.title,installed:false,hydraDownloadDraft:true,meta:{},updatedAt:0};games.push(game);payload={created:true,game};}
  else if(url.startsWith('/api/game/')){edits.push(body.patch);const game=games.find(g=>g.id===decodeURIComponent(url.slice(10)));if(body.patch.coverUrl)game.customArtCover=body.patch.coverUrl;payload={game};}
  return {ok:true,json:async()=>payload};
 };
 w.eval(fs.readFileSync(path.join(root,'src/remote/client.js'),'utf8'));await tick();
 d.querySelector('#installation').value='all';d.querySelector('#installation').dispatchEvent(new w.Event('change'));d.querySelector('.tile').click();await tick();
 assert.equal(d.querySelector('#game-art-picker').hidden,false);assert.equal(d.querySelector('#game-art-query').value,'Demo');
 d.querySelector('#game-art-search').click();await tick();d.querySelector('#game-art-results button').click();await tick();d.querySelector('#game-art-covers button').click();
 assert.equal(d.querySelector('#f-coverUrl').value,cover);assert.equal(d.querySelector('#game-art-covers button').getAttribute('aria-pressed'),'true');
 d.querySelector('#editform').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(edits[0].coverUrl,cover);
 d.querySelector('#close').click();d.querySelector('#hydra-add-download').click();await tick();
 d.querySelector('#hydra-draft-title').value='New Game';d.querySelector('#draft-art-search').click();await tick();d.querySelector('#draft-art-results button').click();await tick();d.querySelector('#draft-art-covers button').click();
 d.querySelector('#hydra-draft-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(edits[1].coverUrl,cover);assert.match(d.querySelector('#hydra-draft-result').textContent,/Selected artwork saved/);
 d.querySelector('#hydra-draft-done').click();configured=false;d.querySelector('#hydra-add-download').click();await tick();assert.equal(d.querySelector('#draft-art-picker').hidden,true);
 d.querySelector('#hydra-draft-title').value='No Artwork Game';d.querySelector('#hydra-draft-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(edits.length,2);assert(games.some(g=>g.name==='No Artwork Game'));
});
