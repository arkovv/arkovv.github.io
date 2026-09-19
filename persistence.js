/* Serialized saves: only the latest acknowledged state is marked saved. */
let storageOK = true;
let backend = 'loading';
let savePending = null, saveInFlight = false, saveDirty = false;
let saveRevision = 0, retryDelay = 1000, needsBackup = false;
let historyAction = 'TABLE_EVENT';
let RECOVERY_KEY = KEY + '.recovery';
let unsavedExportState=null;
function scopeRecovery(){
  let tab='tab';try{tab=sessionStorage.getItem('friendsCards.tabIdentity')||tab;}catch(_){}
  RECOVERY_KEY=KEY+'.recovery.'+accountSession.username+'.'+tab;
}
let replacementPending=false, liveUnsubscribe=null, liveTimer=null, liveSnapshot=null;
let syncCloud=null, accountCheckAt=0;
function rememberUi(){
  if(!S||!accountSession)return;
  try{sessionStorage.setItem(KEY+'.ui.'+accountSession.username,JSON.stringify(S.ui));}catch(_){}
}
function restoreUi(){
  try{S.ui={...S.ui,...JSON.parse(sessionStorage.getItem(KEY+'.ui.'+accountSession.username)||'{}')};}catch(_){}
}
function stopLiveSync(){
  if(liveUnsubscribe)liveUnsubscribe();liveUnsubscribe=null;
  clearInterval(liveTimer);liveTimer=null;liveSnapshot=null;syncCloud=null;
}
function drainLiveSnapshot(){
  if(!liveSnapshot||!syncCloud||backend!=='cloud'||saveDirty||saveInFlight||playerBusy||pendingPlayerOperation)return;
  // Don't destroy text being typed or an open inspection/reveal.
  if(document.querySelector('.modal')||document.activeElement?.matches('input,textarea,select'))return;
  const snapshot=liveSnapshot;liveSnapshot=null;
  try{
    validateTable(snapshot.state);
    const state=syncCloud.adoptSnapshot(snapshot);if(!state)return;
    const ui=S.ui;S=hydrate(state);S.ui=ui;
    if(isPlayer()){if(!player(accountSession.playerId)){requestReauthentication('Your player is no longer in this table.');return;}preparePlayerUi();}
    render();flash('Saved online');
  }catch(error){flash('Could not load the live update: '+error.message,true);}
}
async function verifyCurrentAccount(cloud){
  const profile=await cloud.currentSession();
  if(!profile||profile.username!==accountSession?.username||profile.role!==accountSession?.role||profile.playerId!==accountSession?.playerId)
    throw Object.assign(new Error('Your session expired or changed. Sign in again to continue.'),{code:'session-changed'});
}
function startLiveSync(cloud){
  stopLiveSync();syncCloud=cloud;accountCheckAt=Date.now();
  if(cloud.watchState)liveUnsubscribe=cloud.watchState(snapshot=>{liveSnapshot=snapshot;drainLiveSnapshot();},error=>{
    if(error.code==='permission-denied')requestReauthentication('Your session expired. Sign in again to continue.');
    else flash('Live updates unavailable: '+error.message,true);
  });
  liveTimer=setInterval(()=>{
    drainLiveSnapshot();
    if(Date.now()-accountCheckAt>30000&&!saveInFlight&&!playerBusy&&backend==='cloud'){
      accountCheckAt=Date.now();verifyCurrentAccount(cloud).catch(error=>{
        if(['session-changed','permission-denied','unauthenticated'].includes(error.code))requestReauthentication(error.message);
      });
    }
  },500);
}
function checkStorage(){
  try { localStorage.setItem(KEY+'.probe','1'); localStorage.removeItem(KEY+'.probe'); storageOK=true; }
  catch(e){ storageOK=false; }
  return storageOK;
}
function flash(text, bad=false){
  const el=document.getElementById('saveState');
  el.dataset.status=bad?'error':text.startsWith('Saved')?'saved':'pending';
  el.textContent=text; el.style.color=bad?'var(--bad)':'var(--muted)';
  document.getElementById('retrySave').hidden=!bad;
  document.getElementById('emergencyExport').hidden=!bad;
}
function keepRecovery(){
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({at:Date.now(),state:S,base:syncCloud?.getBase?.(),replace:replacementPending})); } catch(e){}
}
function save(){
  if(backend==='loading' || backend==='blocked' || backend==='conflict') return;
  saveRevision++; saveDirty=true;
  if(backend==='cloud'){ keepRecovery(); queueDbSave(); return; }
  try {
    localStorage.setItem(KEY,JSON.stringify(S)); storageOK=true; saveDirty=false;
    flash('Saved in this browser');
  } catch(e){ storageOK=false; flash('UNSAVED — browser storage failed. Export your table.',true); }
}
function queueDbSave(){
  saveDirty=true;
  flash('Unsaved changes — saving…');
  clearTimeout(savePending); savePending=setTimeout(pushToDb,300);
}
async function pushToDb(){
  if(saveInFlight || !saveDirty || backend!=='cloud') return;
  saveInFlight=true;
  const revision=saveRevision, snapshot=JSON.parse(JSON.stringify(S));
  let automaticRetry=true;
  const slowTimer=setTimeout(()=>flash('Save is taking longer than expected. Your changes are still unsaved; you can export now.',true),15000);
  try {
    validateTable(snapshot);
    const cloud=await connectFirebase();
    await verifyCurrentAccount(cloud);
    const committed=await cloud.writeState(snapshot,{merge:true,replace:replacementPending,validate:validateTable});
    retryDelay=1000;
    if(revision===saveRevision){
      saveDirty=false;
      replacementPending=false;
      if(committed){const ui=S.ui;S=hydrate(committed);S.ui=ui;}
      try { localStorage.removeItem(RECOVERY_KEY); } catch(e){}
      flash('Saved online');
    }else if(committed){const ui=S.ui;S=hydrate(cloud.rebaseState(snapshot,S,committed));S.ui=ui;}
  } catch(e){
    saveDirty=true;
    automaticRetry=!['table-conflict','table-too-large','permission-denied','invalid-argument'].includes(e.code);
    if(['permission-denied','session-changed','unauthenticated'].includes(e.code)){
      automaticRetry=false;requestReauthentication('Your session expired. Your pending edits are kept for sign-in.');return;
    }
    if(e.code==='table-conflict'){
      // Keep an exportable recovery copy, but don't strand the UI in conflict mode.
      keepRecovery();unsavedExportState=structuredClone(S);
      try{
        const cloud=await connectFirebase(),ui=S.ui,latest=await cloud.readState();validateTable(latest);
        S=hydrate(latest);S.ui=ui;saveDirty=false;replacementPending=false;
        say(e.message+' Use Export unsaved table to keep a copy of that edit.','err');render();
      }catch(_){backend='conflict';}
    }
    flash('UNSAVED — '+e.message+(automaticRetry?' Retrying; you can export now.':''),true);
  } finally {
    clearTimeout(slowTimer);
    saveInFlight=false;
    flushReauthentication();
    drainLiveSnapshot();
    if(saveDirty && automaticRetry){ clearTimeout(savePending); savePending=setTimeout(pushToDb,retryDelay); retryDelay=Math.min(30000,retryDelay*2); }
  }
}
function hydrate(data){
  const fresh=blankState();
  return {...fresh,...data,config:{...DEFAULTS,...data.config},ui:{...fresh.ui,...data.ui},ids:{...fresh.ids,...data.ids}};
}
function load(){
  const raw=localStorage.getItem(KEY);
  if(!raw) return false;
  const parsed=JSON.parse(raw); validateTable(parsed); S=hydrate(parsed); return true;
}
function logEvent(text){
  S.log.unshift({at:Date.now(),text,setId:currentSet()?.id || null,playerId:S.ui.acting || null,type:historyAction});
  if(S.log.length>600) S.log.length=600;
}
