/* ============================================================
   15. WIRING
   ============================================================ */

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if(!el || !S || backend!=="cloud") return;
  if(el.tagName === "SELECT" || el.tagName === "INPUT") return;
  const act = el.getAttribute("data-act");
  const fn = ACTIONS[act];
  if(!fn) return;
  e.preventDefault();
  const before = JSON.stringify(S);
  let out;
  try { historyAction=act; out = fn(el.getAttribute("data-id"), el); }
  catch(error){ say(error.message, "err"); }
  finally { historyAction='TABLE_EVENT'; }
  if(JSON.stringify(S) !== before) save();
  if(out !== "skipRender") render();
});

document.addEventListener("change", e => {
  if(!S || backend!=="cloud") return;
  const t = e.target;

  const act = t.getAttribute && t.getAttribute("data-act");
  if(act && ACTIONS[act]){ ACTIONS[act](t.getAttribute("data-id"), t); save(); render(); return; }

  const cfgKey = t.getAttribute && t.getAttribute("data-cfg");
  if(cfgKey){
    const v = Number(t.value);
    if(isFinite(v)) S.config[cfgKey] = v;
    save(); render(); return;
  }
  const filterKey = t.getAttribute && t.getAttribute("data-filter");
  if(filterKey){
    S.ui.cardFilter = S.ui.cardFilter || {};
    S.ui.cardFilter[filterKey] = t.value;
    save(); render(); return;
  }
});

// live allocation inputs: keep the paired range/number in sync without a full re-render
document.addEventListener("input", e => {
  if(!S || backend!=="cloud") return;
  const t = e.target;
  const bidId = t.getAttribute && t.getAttribute("data-bid");
  const defId = t.getAttribute && t.getAttribute("data-def");
  if(!bidId && !defId) return;
  const set = currentSet();
  if(!set) return;
  const id = Number(bidId || defId);
  const budget = bidId ? set.config.desireBudget : set.config.defenseBudget;
  let v = Math.floor(Number(t.value) || 0);
  if(v < 0) v = 0;

  if(bidId){
    const who = S.ui.acting;
    set.bids[who] = set.bids[who] || {};
    const others = Object.keys(set.bids[who]).reduce((a, k) => a + (Number(k) === id ? 0 : set.bids[who][k]), 0);
    if(v + others > budget) v = Math.max(0, budget - others);
    set.bids[who][id] = v;
    set.locked[who] = false;
  } else {
    const who = S.ui.acting;
    const own = set.designs.filter(d => d.authorId === who);
    let others = 0;
    for(const d of own) if(d.id !== id) others += set.defense[d.id] || 0;
    if(v + others > budget) v = Math.max(0, budget - others);
    set.defense[id] = v;
    set.defLocked[who] = false;
  }

  // sync the sibling control + the sticky bar without rebuilding the list
  const attr = bidId ? "data-bid" : "data-def";
  document.querySelectorAll("[" + attr + '="' + id + '"]').forEach(inp => { if(inp !== t) inp.value = v; });
  t.value = v;
  const card = t.closest(".alloc");
  if(card) card.classList.toggle("set", v > 0);
  refreshAllocBar(set);
  save();
});

function refreshAllocBar(set){
  const bar = document.querySelector(".allocbar");
  if(!bar) return;
  const who = S.ui.acting;
  let spent = 0, budget;
  if(set.state === "BIDDING"){
    budget = set.config.desireBudget;
    spent = sumBids(set, who);
  } else {
    budget = set.config.defenseBudget;
    for(const d of set.designs.filter(x => x.authorId === who)) spent += set.defense[d.id] || 0;
  }
  const ns = bar.querySelectorAll(".n b");
  if(ns[0]) ns[0].textContent = spent;
  if(ns[1]) ns[1].textContent = budget - spent;
  const fill = bar.querySelector(".track i");
  if(fill) fill.style.width = Math.min(100, spent / budget * 100) + "%";
  const lock = bar.querySelector('[data-act="lockBid"],[data-act="lockDefense"]');
  if(lock) lock.disabled = spent !== budget;
}

document.getElementById("nav").addEventListener("click", e => {
  const b = e.target.closest("[data-tab]");
  if(b) go(b.getAttribute("data-tab"));
});
document.getElementById("actingSel").addEventListener("change", e => {
  if(!S || backend!=='cloud') return;
  S.ui.acting = Number(e.target.value);
  save(); render();
});
document.getElementById("blurTgl").addEventListener("change", e => {
  if(!S || backend!=='cloud') return;
  S.ui.blur = e.target.checked; save(); render();
});
document.getElementById("soundTgl").addEventListener("change", e => {
  if(!S || backend!=='cloud') return;
  S.ui.sound = e.target.checked; save();
});
document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeOverlay();
});

/* Loading a server table must finish before any edits are allowed. */
async function boot(){
  if(!adminSession){ showLogin(); return; }
  document.body.classList.remove('signed-out');
  checkStorage();
  backend='loading';
  document.getElementById('view').innerHTML='<div class="notice info" role="status">Loading your saved table…</div>';
  document.getElementById('actingSel').disabled=true;
  try {
    const cloud=await connectFirebase();
    const data=await cloud.readState();
    if(data !== null) validateTable(data);
    S=data !== null ? hydrate(data) : blankState(); backend='cloud';
    const empty=!S.players.length&&!S.sets.length;
    if(empty){
      try {
        const raw=localStorage.getItem(KEY);
        if(raw){const local=JSON.parse(raw);validateTable(local);if((local.players.length||local.sets.length)&&confirm('Copy your browser table into the empty online table?\n'+tableSummary(local))){S=hydrate(local);save();}}
      } catch(e){say('Browser migration was skipped: '+e.message,'err');}
    }
    document.getElementById('actingSel').disabled=false;
    render(); if(!saveDirty) flash(data === null ? 'Online table is empty — add players or import a backup' : 'Saved online');
    offerRecovery();
  } catch(e){
    backend='blocked';
    document.getElementById('view').innerHTML='<div class="notice err">The online table could not be loaded: '+esc(e.message)+'. Check Firebase setup and your connection, then retry. No table has been replaced.</div>';
    flash('Online storage unavailable — editing paused',true);
  }
}
document.getElementById('retrySave').addEventListener('click',()=>{
  if(backend==='conflict'){ flash('Export your unsaved copy, then reload this page to load the latest online table.',true); return; }
  if(backend==='blocked') boot(); else if(backend==='cloud'){clearTimeout(savePending);pushToDb();} else save();
});
document.getElementById('emergencyExport').addEventListener('click',()=>{if(S) ACTIONS.exportJson();});
window.addEventListener('beforeunload',e=>{
  if(!saveDirty&&!saveInFlight) return;
  if(backend==='cloud') keepRecovery();
  e.preventDefault();e.returnValue='';
});
window.addEventListener('online',()=>{if(saveDirty&&backend==='cloud')pushToDb();});
restoreLogin();
