/* Host guidance, recovery, history, and accessible interaction. */
function hudIcon(name){
  const paths={
    setup:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/>',
    auction:'<path d="m14 3 7 7-4 4-7-7zM12 9 4 17M2 21h11M3 17l4 4"/>',
    shop:'<path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10M8 5l8 4"/>',
    market:'<path d="M4 3v17h17M8 15l4-5 4 2 5-7M17 5h4v4"/>',
    cards:'<rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7H3v14h13v-1M13.5 7l3 4-3 4-3-4z"/>',
    players:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>'
  };
  return '<svg class="hud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.cards)+'</svg>';
}
function protectReplacement(){
  // A failed recovery write cancels replacement rather than discarding the old table.
  try { localStorage.setItem(KEY+'.previous',JSON.stringify(S)); }
  catch(e){ if(backend!=='db') throw new Error('Browser storage cannot preserve the previous table. Free browser storage and retry; export a backup now to keep your data.'); }
  needsBackup++;
}
ACTIONS.restorePrevious=()=>{
  try {
    const raw=localStorage.getItem(KEY+'.previous');
    if(!raw){say('No previous table is stored in this browser. You can also import a JSON backup.','info');return;}
    const previous=JSON.parse(raw);validateTable(previous);
    if(!confirm('Restore the previous table?\n'+tableSummary(previous)+'\n\nReplaces: '+tableSummary(S))) return;
    protectReplacement();S=hydrate(previous);say('Previous table restored.');
  }catch(e){say(e.message,'err');}
};
function offerRecovery(){
  try {
    const raw=localStorage.getItem(RECOVERY_KEY);if(!raw)return;
    const recovery=JSON.parse(raw);validateTable(recovery.state);
    if(JSON.stringify(recovery.state)===JSON.stringify(S)){localStorage.removeItem(RECOVERY_KEY);return;}
    showModal('<h1>Unsaved table found</h1><p>A local recovery copy from '+esc(when(recovery.at))+' contains '+esc(tableSummary(recovery.state))+'.</p><p>The database currently contains '+esc(tableSummary(S))+'. You can download the recovery copy before deciding.</p><div class="row"><button data-act="downloadRecovery">Download recovery JSON</button><button data-act="applyRecovery">Restore recovery copy</button><button data-act="discardRecovery">Keep database table</button></div>');
    ACTIONS.downloadRecovery=()=>{downloadFile('friends-cards-recovery.json',JSON.stringify(recovery.state,null,2),'application/json');return 'skipRender';};
    ACTIONS.applyRecovery=()=>{if(!confirm('Replace the database table with this recovery copy?\n'+tableSummary(recovery.state)))return 'skipRender';protectReplacement();S=hydrate(recovery.state);closeOverlay();say('Recovery restored.');};
    ACTIONS.discardRecovery=()=>{if(!confirm('Discard the unsaved recovery copy and keep the database table?'))return 'skipRender';localStorage.removeItem(RECOVERY_KEY);closeOverlay();};
  }catch(e){say('Recovery copy could not be read: '+e.message,'err');render();}
}
function revealPreview(set){
  const demand=demandMap(set), authors={};let packs=0;
  for(const id of set.participants) authors[id]=set.designs.filter(d=>d.authorId===id).reduce((n,d)=>n+(demand[d.id]||0),0);
  for(const bidder of set.participants) for(const author of set.participants){
    if(bidder!==author&&set.designs.some(d=>d.authorId===author&&effectiveBid((set.bids[bidder]||{})[d.id]||0,set.defense[d.id]||0)>0))packs++;
  }
  const rewards=largestRemainder(authors,set.config.avgSetReward);
  return 'Reveal Set '+set.ordinal+' — '+set.name+'?\n\n'+Object.entries(rewards).map(([id,n])=>playerName(id)+': +'+n+' C').join('\n')+'\n\n'+packs+' bidder packs will be issued. Demand, rewards and odds are frozen permanently. This reveal pays only once.';
}
function stageGuide(){
  const set=currentSet();let message,tab='setup',next='Go to Setup';
  if(!set)message='Start by adding your friends and creating a set.';
  else if(set.state==='DRAFT')message='Add '+set.config.cardsPerPlayer+' requests per player, then open the auction in Setup.';
  else if(['BIDDING','DEFENSE'].includes(set.state)){
    const locks=set.state==='BIDDING'?set.locked:set.defLocked;
    const pending=set.participants.filter(id=>!locks[id]);
    message=pending.length?'Waiting for '+pending.map(playerName).join(', ')+'.': 'Everyone has locked in. '+(set.state==='BIDDING'?'Close bidding to begin defense.':'Review and reveal the market.');
    tab='auction';next='Go to Auction';
  }else if(set.state==='LIVE'){message='The market is frozen. Open packs, trade cards, or redeem promises. Close the set in Setup when the group is finished.';tab='shop';next='Go to Shop';}
  else message='This set is closed and can supply Legacy Packs. Create the next set in Setup.';
  const stages=[['DRAFT','Setup'],['BIDDING','Bidding'],['DEFENSE','Defense'],['LIVE','Reveal'],['CLOSED','Closed']];
  const stage=stages.findIndex(([key])=>key===(set?.state||'DRAFT'));
  const tracker='<ol class="stage-track">'+stages.map(([key,label],i)=>'<li class="'+(i===stage?'current':i<stage?'complete':'upcoming')+'" '+(i===stage?'aria-current="step"':'')+'><span class="step-node" aria-hidden="true">'+(i<stage?'✓':String(i+1).padStart(2,'0'))+'</span><span>'+label+'</span></li>').join('')+'</ol>';
  return '<aside class="stage-guide" aria-label="Set progress">'+tracker+'<div class="stage-detail"><div><b>'+esc(set?'Set '+set.ordinal+' · '+set.name:'Your next step')+'</b><p>'+esc(message)+'</p></div><button data-act="guide" data-id="'+tab+'">'+next+'<span aria-hidden="true"> ↗</span></button></div></aside>';
}
ACTIONS.guide=tab=>{S.ui.tab=tab;};
const historyFilter={player:'',set:'',type:'',from:'',to:'',query:''};
function historySet(row){
  if(row.setId!=null)return row.setId;
  const match=(row.note||row.text||'').match(/\bSet\s+(\d+)\b/i);
  return match ? S.sets.find(s=>s.ordinal===Number(match[1]))?.id : null;
}
function filteredHistory(kind){
  return S[kind].filter(row=>{
    const f=historyFilter;
    if(f.player&&String(row.playerId)!==f.player)return false;
    if(f.set&&String(historySet(row))!==f.set)return false;
    if(f.type&&(row.type||'TABLE_EVENT')!==f.type)return false;
    const day=new Date(row.at);const local=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
    if(f.from&&local<f.from||f.to&&local>f.to)return false;
    return !f.query||[row.note,row.text,row.type,playerName(row.playerId)].join(' ').toLowerCase().includes(f.query.toLowerCase());
  });
}
function historyControls(){
  const select=(key,label,rows)=>'<label>'+label+'<select data-history="'+key+'"><option value="">All</option>'+rows.map(([value,text])=>'<option value="'+esc(value)+'" '+(String(value)===historyFilter[key]?'selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';
  const types=[...new Set([...S.ledger,...S.log].map(r=>r.type||'TABLE_EVENT'))].sort();
  return '<section class="panel"><h2>History filters</h2><div class="history-filters">'+
    select('player','Player',S.players.map(p=>[p.id,p.name]))+select('set','Set',S.sets.map(s=>[s.id,'Set '+s.ordinal+' · '+s.name]))+select('type','Action',types.map(t=>[t,t]))+
    ['from','to','query'].map(k=>'<label>'+({from:'From date',to:'Through date',query:'Search notes'})[k]+'<input data-history="'+k+'" type="'+(k==='query'?'search':'date')+'" value="'+esc(historyFilter[k])+'"></label>').join('')+
    '</div><p><small>'+filteredHistory('ledger').length+' ledger entries · '+filteredHistory('log').length+' log entries. Older log entries have no player or action metadata; use note search to find them.</small></p><div class="row"><button data-act="clearHistoryFilters">Clear filters</button><button data-act="exportHistory" data-id="ledger">Export filtered ledger CSV</button><button data-act="exportHistory" data-id="log">Export filtered log CSV</button></div></section>';
}
ACTIONS.clearHistoryFilters=()=>{for(const key in historyFilter)historyFilter[key]='';};
function csvCell(value){
  let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
function downloadFile(name,text,type){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
ACTIONS.exportHistory=kind=>{
  const columns=kind==='ledger'?['id','at','player','set','delta','after','type','note']:['at','player','set','type','text'];
  const rows=filteredHistory(kind).map(r=>({...r,at:new Date(r.at).toISOString(),player:r.playerId?playerName(r.playerId):'',set:historySet(r)||'',type:r.type||'TABLE_EVENT'}));
  downloadFile('friends-cards-'+kind+'.csv','\uFEFF'+[columns,...rows.map(r=>columns.map(k=>r[k]))].map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  return 'skipRender';
};
document.addEventListener('change',e=>{
  const key=e.target.dataset.history;if(!key)return;
  historyFilter[key]=e.target.value;render();document.querySelector('[data-history="'+key+'"]').focus();
});
let dialogReturnFocus=null;
function activateDialog(){
  if(!dialogReturnFocus)dialogReturnFocus=document.activeElement;
  const modal=document.querySelector('.modal');if(!modal)return;
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',modal.querySelector('h1,h2,.eyebrow')?.textContent||'Card details');modal.tabIndex=-1;
  for(const selector of ['header','main','footer'])document.querySelector(selector).inert=true;
  improveAccessibility(modal);modal.focus();
}
function releaseDialog(){
  for(const selector of ['header','main','footer'])document.querySelector(selector).inert=false;
  if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus();else document.getElementById('view').focus();
  dialogReturnFocus=null;
}
function improveAccessibility(root){
  root.querySelectorAll('[data-act]:not(button):not(input):not(select)').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');});
  root.querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.labels?.length||el.hasAttribute('aria-label'))return;
    const card=el.closest('.alloc');
    const label=el.previousElementSibling?.tagName==='LABEL'?el.previousElementSibling.textContent:null;
    el.setAttribute('aria-label',label || (card?card.querySelector('h3')?.textContent+' '+(el.dataset.bid?'bid':'defense'):el.placeholder||el.id||'Choose an option'));
  });
  root.querySelectorAll('button.x').forEach(el=>el.setAttribute('aria-label',el.dataset.act==='delDesign'?'Delete request':'Close details'));
  root.querySelectorAll('.notice').forEach(el=>el.setAttribute('role',el.classList.contains('err')?'alert':'status'));
  root.querySelectorAll('.tablewrap').forEach(el=>{el.tabIndex=0;el.setAttribute('role','region');el.setAttribute('aria-label',el.closest('.panel')?.querySelector('h2')?.textContent||'Scrollable table');});
  document.querySelectorAll('#nav button').forEach(b=>{if(b.classList.contains('on'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
document.addEventListener('keydown',e=>{
  const modal=document.querySelector('.modal');
  if(modal&&e.key==='Tab'){
    const items=[...modal.querySelectorAll('button:not([disabled]),input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.hidden && el.getClientRects().length);
    if(!items.length){e.preventDefault();modal.focus();return;}
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===modal)){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===modal)){e.preventDefault();first.focus();}
  }
  const target=e.target.closest('[role="button"][data-act]');
  if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();target.click();}
});
