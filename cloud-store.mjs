// Leave headroom under Firestore's 1 MiB document limit for metadata.
export const MAX_STATE_BYTES = 900000;
export function encodeState(state) {
  const json = JSON.stringify(state);
  if (new TextEncoder().encode(json).length > MAX_STATE_BYTES) {
    throw Object.assign(new Error('The table exceeds the online size limit. Export a backup before making more changes.'), {code:'table-too-large'});
  }
  return json;
}
export function createCloudStore(sdk, db) {
  const ref = sdk.doc(db, 'tables', 'main');
  let revision = null;
  return {
    async readState() {
      const snapshot = await sdk.getDocFromServer(ref);
      if (!snapshot.exists()) { revision = 0; return null; }
      const data = snapshot.data();
      const state = typeof data.stateJson === 'string' ? JSON.parse(data.stateJson) : data.state;
      if (!state || typeof state !== 'object') throw new Error('The saved online table is invalid. It has not been replaced.');
      revision = data.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('The online revision is invalid. No data has been replaced.');
      return state;
    },
    async writeState(state) {
      if (revision === null) throw new Error('Load the online table before saving.');
      const stateJson = encodeState(state);
      const expectedRevision = revision;
      await sdk.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const currentRevision = snapshot.exists() ? (snapshot.data().revision ?? 0) : 0;
        if (currentRevision !== expectedRevision) {
          throw Object.assign(new Error('Another tab saved a newer table. Export your unsaved copy, then reload to load the latest table.'), {code:'table-conflict'});
        }
        transaction.set(ref, {stateJson, revision: expectedRevision + 1, updatedAt: sdk.serverTimestamp()});
      });
      revision = expectedRevision + 1;
    }
  };
}
