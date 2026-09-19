// Leave headroom under Firestore's 1 MiB document limit for metadata.
export const MAX_STATE_BYTES = 900000;
export function encodeState(state) {
  const json = JSON.stringify(state);
  if (new TextEncoder().encode(json).length > MAX_STATE_BYTES) {
    throw Object.assign(new Error('The table exceeds the online size limit. Export a backup before making more changes.'), {code:'table-too-large'});
  }
  return json;
}
function decode(data) {
  const state = typeof data.stateJson === 'string' ? JSON.parse(data.stateJson) : data.state;
  if (!state || typeof state !== 'object' || !Number.isSafeInteger(data.revision) || data.revision < 0)
    throw new Error('The online table or revision is invalid.');
  return state;
}
// Rebase disjoint admin edits; never guess how to merge conflicting balances,
// item ownership, counters, or whole-table replacements.
export function mergeChanges(base, local, remote, path='') {
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(equal(base,local)) return structuredClone(remote);
  if(equal(base,remote)) return structuredClone(local);
  if(path==='ui') return structuredClone(local);
  if(base && local && remote && !Array.isArray(base) && !Array.isArray(local) && !Array.isArray(remote)
    && typeof base==='object' && typeof local==='object' && typeof remote==='object'){
    const merged={};
    for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
      const value=mergeChanges(base[key],local[key],remote[key],path?path+'.'+key:key);
      if(value!==undefined)merged[key]=value;
    }
    return merged;
  }
  if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)&&[...base,...local,...remote].every(v=>v&&v.id!=null)){
    const b=new Map(base.map(v=>[v.id,v])),l=new Map(local.map(v=>[v.id,v])),r=new Map(remote.map(v=>[v.id,v]));
    return [...new Set([...remote.map(v=>v.id),...local.map(v=>v.id)])].map(id=>mergeChanges(b.get(id),l.get(id),r.get(id),path+'.'+id)).filter(v=>v!==undefined);
  }
  throw Object.assign(new Error('The same game data changed on another device. Your edit was not saved; review the latest table and repeat it.'),{code:'table-conflict'});
}
export function createCloudStore(sdk, db) {
  const ref = sdk.doc(db, 'tables', 'main');
  let revision = null;
  let baseline = null;
  return {
    getBase(){return structuredClone(baseline);},
    getRevision(){return revision;},
    rebaseState:mergeChanges,
    // Mutations run against the transaction's latest state on EVERY retry.
    // Receipts also make retries after a lost response idempotent.
    async updateState(operation, mutate) {
      const committed = await sdk.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('The online table no longer exists.');
        const data = snapshot.data(), state = decode(data);
        const receipt = (state.operations || []).find(entry => entry.id === operation.id);
        if (receipt) return {state, result:receipt.result, revision:data.revision};
        if(!Number.isSafeInteger(operation.baseRevision)||data.revision-operation.baseRevision>=256||data.revision<operation.baseRevision)
          throw new Error('This action is too old to retry safely. Check the current inventory and history before starting another action.');
        const result = mutate(state);
        if (result && typeof result.then === 'function') throw new Error('Game mutations must be synchronous.');
        state.operations = [...(state.operations || []),
          {id:operation.id, at:operation.at, result:result ?? null}].slice(-256);
        const nextRevision = data.revision + 1;
        transaction.set(ref, {stateJson:encodeState(state), revision:nextRevision, updatedAt:sdk.serverTimestamp()});
        return {state, result, revision:nextRevision};
      });
      revision = committed.revision;
      baseline = structuredClone(committed.state);
      return committed;
    },
    watchState(next, error) {
      return sdk.onSnapshot(ref, {includeMetadataChanges:true}, snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        try { next(snapshot.exists() ? {state:decode(snapshot.data()), revision:snapshot.data().revision} : null); }
        catch (e) { error(e); }
      }, error);
    },
    adoptSnapshot(snapshot) {
      if (!snapshot || (revision !== null && snapshot.revision <= revision)) return null;
      revision = snapshot.revision;
      baseline = structuredClone(snapshot.state);
      return snapshot.state;
    },
    async readState() {
      const snapshot = await sdk.getDocFromServer(ref);
      if (!snapshot.exists()) { revision = 0; baseline=null; return null; }
      const data = snapshot.data();
      const state = typeof data.stateJson === 'string' ? JSON.parse(data.stateJson) : data.state;
      if (!state || typeof state !== 'object') throw new Error('The saved online table is invalid. It has not been replaced.');
      revision = data.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('The online revision is invalid. No data has been replaced.');
      baseline = structuredClone(state);
      return state;
    },
    async writeState(state, options={}) {
      if (revision === null) throw new Error('Load the online table before saving.');
      encodeState(state);
      const expectedRevision = revision;
      const original=structuredClone(baseline);
      const committed=await sdk.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const currentRevision = snapshot.exists() ? (snapshot.data().revision ?? 0) : 0;
        if (currentRevision !== expectedRevision && (!options.merge || options.replace)) {
          throw Object.assign(new Error('Another tab saved a newer table. Export your unsaved copy, then reload to load the latest table.'), {code:'table-conflict'});
        }
        const merged=currentRevision===expectedRevision?state:mergeChanges(original,state,decode(snapshot.data()));
        if(options.validate)options.validate(merged);
        transaction.set(ref, {stateJson:encodeState(merged), revision: currentRevision + 1, updatedAt: sdk.serverTimestamp()});
        return {state:merged,revision:currentRevision+1};
      });
      // Some lightweight legacy test adapters don't return the callback result.
      revision = committed?.revision ?? expectedRevision + 1;
      baseline = structuredClone(committed?.state ?? state);
      return structuredClone(baseline);
    }
  };
}
