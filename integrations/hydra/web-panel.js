"use strict";

/**
 * RAMpage Hydra download workflow, rendered beside the existing read-only
 * index inside the authenticated remote game editor.
 * No magnets, direct URLs, credentials, paths or executables leave the PC.
 * The companion must confirm local approval BEFORE it accepts a queue request.
 */
function mountHydraDownloadPanel(root,{client,gameId,gameTitle,pollMs=10000}={}){
  if(!root || !root.ownerDocument)throw new TypeError("A DOM root is required");
  if(!client || typeof client.status!=="function")throw new TypeError("Bridge client required");
  const doc=root.ownerDocument;
  let destroyed=false,timer=null,busy=false,connected=false,caps=new Set();
  let choices=[],selected=null,chosenDownloader=null,downloaderChoices=[];
  let filterText="",sourceFilter="all",availableBytes=null,destinationLabel="";
  const elem=(tag,content,parent,cls)=>{
    const el=doc.createElement(tag);
    if(content!==undefined)el.textContent=String(content);
    if(cls)el.className=cls;
    (parent||root).appendChild(el);return el;
  };
  const clear=el=>{while(el.firstChild)el.removeChild(el.firstChild);};
  const wrapper=elem("section",undefined,root,"hydra-download-panel");
  wrapper.setAttribute("aria-label","Hydra download manager");
  elem("h3","Hydra Launcher · Download manager",wrapper);
  const status=elem("p","Checking Hydra companion connection…",wrapper,"hydra-status");
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  const controls=elem("div",undefined,wrapper,"hydra-actions");
  const catalogue=elem("div",undefined,wrapper,"hydra-catalogue");
  const settings=elem("div",undefined,wrapper,"hydra-settings");
  const transfers=elem("div",undefined,wrapper,"hydra-transfers");
  const setStatus=message=>{if(!destroyed)status.textContent=message;};
  const perform=async action=>{
    if(destroyed||busy)return;
    busy=true;
    try{await action();}
    catch(e){setStatus("Hydra: "+(e && (e.code||e.message) ? (e.code||e.message) : "Request failed"));}
    finally{busy=false;}
  };
  function button(label,parent,action){
    const b=elem("button",label,parent);
    b.type="button";b.addEventListener("click",()=>perform(action));
    return b;
  }
  const bytes=n=>typeof n==="number"&&Number.isFinite(n)
    ?(n>=1073741824?(n/1073741824).toFixed(1)+" GB":(n/1048576).toFixed(1)+" MB"):"Unknown size";
  const speed=n=>typeof n==="number"&&Number.isFinite(n)?bytes(n)+"/s":"—";
  const time=n=>typeof n==="number"&&Number.isFinite(n)
    ?(n<60?Math.ceil(n)+"s":n<3600?Math.ceil(n/60)+"m":Math.ceil(n/3600)+"h"):"—";
  const compare=(a,b)=>String(a||"").localeCompare(String(b||""));
  function drawOptions(){
    clear(catalogue);
    elem("h4","Download options",catalogue);
    if(!choices.length){
      elem("p","No selectable download options returned by your paired Hydra companion.",catalogue);return;
    }
    const filters=elem("div",undefined,catalogue,"hydra-filter-row");
    const query=elem("input",undefined,filters);query.type="search";
    query.placeholder="Filter downloads";query.setAttribute("aria-label","Filter download versions");
    query.value=filterText;
    query.addEventListener("input",()=>{filterText=query.value;drawOptions();});
    const sources=[...new Set(choices.map(x=>x.source||"Other"))].sort(compare);
    const select=elem("select",undefined,filters);
    select.setAttribute("aria-label","Filter by download source");
    let opt=elem("option","All sources",select);opt.value="all";
    for(const name of sources){opt=elem("option",name,select);opt.value=name;}
    select.value=sourceFilter;
    select.addEventListener("change",()=>{sourceFilter=select.value;drawOptions();});
    const list=elem("div",undefined,catalogue,"hydra-option-list");
    const filtered=choices.filter(x=>
      (sourceFilter==="all"||(x.source||"Other")===sourceFilter)&&
      (x.title||"").toLowerCase().includes(filterText.toLowerCase()));
    if(!filtered.length)elem("p","No matching options.",list);
    for(const row of filtered){
      const item=elem("div",undefined,list,"hydra-option");
      elem("div",row.title,item,"hydra-option-title");
      elem("small",[bytes(row.sizeBytes),row.source,row.publishedAt].filter(Boolean).join(" · "),item);
      button("Select download",item,async()=>{
        selected=row;chosenDownloader=null;
        await chooseDownloader();
      });
    }
  }
  async function search(){
    setStatus("Searching Hydra’s connected game catalogue…");
    const rows=await client.search(gameTitle);
    clear(catalogue);
    elem("h4","Game matches",catalogue);
    if(!Array.isArray(rows)||!rows.length)elem("p","No matches found. Verify Hydra is signed in and sources are configured.",catalogue);
    for(const row of Array.isArray(rows)?rows:[]){
      const item=elem("div",undefined,catalogue,"hydra-option");
      elem("span",row.title+" · "+row.optionCount+" cached option(s)",item);
    }
    setStatus("Search completed. Open download options to select an available version.");
  }
  async function openOptions(){
    if(!caps.has("options")){setStatus("Live download choices are unavailable. Search Hydra on the gaming PC.");return;}
    setStatus("Loading available download options…");
    const rows=await client.options(gameId);
    if(destroyed)return;
    choices=Array.isArray(rows)?rows:[];selected=null;
    clear(settings);drawOptions();
    setStatus(choices.length+" download option(s) returned. Choose a version to continue.");
  }
  async function chooseDownloader(){
    if(!selected)return;
    clear(settings);
    setStatus("Checking compatible downloaders and PC storage…");
    const result=await client.downloaders(gameId,selected.id);
    if(destroyed)return;
    downloaderChoices=Array.isArray(result.downloaders)?result.downloaders:[];
    availableBytes=result.availableBytes;destinationLabel=result.destinationLabel||"Configured on the gaming PC";
    clear(settings);
    elem("h4","Download settings",settings);
    const detail=elem("p",selected.title,settings);
    detail.className="hydra-option-title";
    elem("p","Free space: "+bytes(availableBytes),settings,"hydra-status");
    const dropdown=elem("select",undefined,settings);
    dropdown.setAttribute("aria-label","Choose downloader");
    const ready=downloaderChoices.filter(x=>x.available && x.configured);
    for(const entry of downloaderChoices){
      const option=elem("option",entry.label+(entry.available&&entry.configured?" · Ready":" · Unavailable"),dropdown);
      option.value=entry.id;option.disabled=!(entry.available&&entry.configured);
    }
    if(ready.length)dropdown.value=ready[0].id;
    chosenDownloader=ready[0]||null;
    dropdown.addEventListener("change",()=>{chosenDownloader=ready.find(x=>x.id===dropdown.value)||null;});
    elem("p","Download location: "+destinationLabel,settings,"hydra-status");
    elem("small","Change the destination locally in Hydra on the gaming PC. RAMpage does not expose paths remotely.",settings);
    const extractRow=elem("label",undefined,settings,"hydra-check");
    const extract=elem("input",undefined,extractRow);extract.type="checkbox";extract.checked=false;
    elem("span","Extract downloaded archive when supported",extractRow);
    const cleanupRow=elem("label",undefined,settings,"hydra-check");
    const cleanup=elem("input",undefined,cleanupRow);cleanup.type="checkbox";cleanup.checked=false;cleanup.disabled=true;
    elem("span","Delete archive after successful extraction",cleanupRow);
    extract.addEventListener("change",()=>{cleanup.disabled=!extract.checked;if(!extract.checked)cleanup.checked=false;});
    const action=button("Request download on gaming PC",settings,async()=>{
      if(!chosenDownloader){setStatus("No configured, available downloader. Configure one in Hydra Settings.");return;}
      if(availableBytes!==null && selected.sizeBytes!==null && availableBytes<selected.sizeBytes){
        setStatus("Insufficient reported free space on the gaming PC.");return;
      }
      const ask="Request this download? The gaming PC must approve the source and destination before it begins.";
      if(typeof globalThis.confirm==="function"&&!globalThis.confirm(ask))return;
      const result=await client.queue(gameId,selected.id,chosenDownloader.id,extract.checked,cleanup.checked);
      setStatus(result && result.accepted?
        "Download request accepted by the paired PC. Check its queue.":
        "The gaming PC has not approved the download.");
      await refresh();
    });
    action.disabled=ready.length===0||(availableBytes!==null&&selected.sizeBytes!==null&&availableBytes<selected.sizeBytes);
    if(!ready.length)elem("p","Configure a compatible downloader in Hydra Launcher first.",settings);
  }
  async function refresh(){
    const items=await client.downloads();
    if(destroyed)return;
    clear(transfers);elem("h4","Downloads",transfers);
    // Never mix another game's transfer into the active game editor.
    const own=Array.isArray(items)?items.filter(x=>x.gameId===gameId):[];
    if(!own.length)elem("p","No active transfers for this game.",transfers);
    for(const job of own){
      const item=elem("div",undefined,transfers,"hydra-transfer");
      elem("strong",job.title||gameTitle,item);
      elem("p",job.state+" · "+(job.progress===null?"—":job.progress+"%")+
        " · "+speed(job.speedBytesPerSecond)+" · ETA "+time(job.etaSeconds),item);
      elem("p",bytes(job.downloadedBytes)+" / "+bytes(job.totalBytes),item,"hydra-status");
      const progress=elem("progress",undefined,item);
      progress.max=100;progress.value=typeof job.progress==="number"?job.progress:0;
      progress.setAttribute("aria-label","Download progress for "+(job.title||gameTitle));
      if(job.state==="downloading")button("Pause",item,async()=>{await client.pause(gameId,job.id);await refresh();});
      if(job.state==="paused")button("Resume",item,async()=>{await client.resume(gameId,job.id);await refresh();});
      if(["queued","downloading","paused"].includes(job.state))
        button("Cancel",item,async()=>{
          if(typeof globalThis.confirm==="function"&&!globalThis.confirm("Cancel this download?"))return;
          await client.cancel(gameId,job.id);await refresh();
        });
    }
  }
  async function initialize(){
    const result=await client.status();
    if(destroyed)return;
    connected=result?.connected===true;
    caps=new Set(Array.isArray(result?.capabilities)?result.capabilities:[]);
    clear(controls);
    if(!connected){
      setStatus("Hydra download companion not connected. Use the existing cached search and install through Hydra on your PC.");
      return;
    }
    setStatus("Hydra companion connected. PC approval is required to start downloads.");
    if(caps.has("search"))button("Search for Downloads",controls,search);
    if(caps.has("options"))button("Open download options",controls,openOptions);
    if(caps.has("readStatus"))button("Refresh downloads",controls,refresh);
    button("Installation instructions",controls,async()=>{
      const result=await client.requestInstall(gameId);
      setStatus(result?.message||"Confirm installation locally in Hydra Launcher.");
    });
    if(caps.has("readStatus"))await refresh();
  }
  const ready=perform(initialize);
  if(pollMs>0&&Number.isFinite(pollMs)){
    timer=setInterval(()=>{if(!destroyed&&connected&&caps.has("readStatus")&&!busy)perform(refresh);},
      Math.max(2000,pollMs));
    if(typeof timer?.unref==="function")timer.unref();
  }
  return Object.freeze({
    ready,refresh:()=>perform(refresh),
    openOptions:()=>perform(openOptions),
    destroy(){destroyed=true;if(timer!==null)clearInterval(timer);wrapper.remove();}
  });
}
if(typeof module!=="undefined"&&module.exports)module.exports={mountHydraDownloadPanel};
if(typeof window!=="undefined")window.RAMpageHydraDownloadPanel=mountHydraDownloadPanel;
