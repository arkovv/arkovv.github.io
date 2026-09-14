/* Serialized saves: only the latest acknowledged state is marked saved. */
let storageOK = true;
let backend = 'loading';
let savePending = null, saveInFlight = false, saveDirty = false;
let saveRevision = 0, retryDelay = 1000, needsBackup = false;
let historyAction = 'TABLE_EVENT';
const RECOVERY_KEY = KEY + '.recovery';
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
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({at:Date.now(),state:S})); } catch(e){}
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
    await cloud.writeState(snapshot);
    retryDelay=1000;
    if(revision===saveRevision){
      saveDirty=false;
      try { localStorage.removeItem(RECOVERY_KEY); } catch(e){}
      flash('Saved online');
    }
  } catch(e){
    saveDirty=true;
    automaticRetry=!['table-conflict','table-too-large','permission-denied','invalid-argument'].includes(e.code);
    if(e.code==='table-conflict') backend='conflict';
    flash('UNSAVED — '+e.message+(automaticRetry?' Retrying; you can export now.':''),true);
  } finally {
    clearTimeout(slowTimer);
    saveInFlight=false;
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
