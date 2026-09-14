export async function credentialHash(username, password) {
  const input = new TextEncoder().encode(username.trim().toLowerCase() + '\n' + password);
  const bytes = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
}
export function createSessionClient(sdk, db, uid) {
  const ref = sdk.doc(db, 'sessions', uid);
  return {
    async login(username, password) {
      username = username.trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,32}$/.test(username)) throw new Error('Use a username containing letters, numbers, underscores or hyphens.');
      const passwordHash = await credentialHash(username, password);
      // Rules compare these values with privateAccounts/<username> before accepting.
      await sdk.setDoc(ref, {username, passwordHash, createdAt:sdk.serverTimestamp()});
      const profile = await this.currentSession();
      if (!profile) throw new Error('The login session could not be verified.');
      return profile;
    },
    async currentSession() {
      const snapshot = await sdk.getDocFromServer(ref);
      if (!snapshot.exists()) return null;
      const {username, createdAt} = snapshot.data();
      if (!createdAt || Date.now() >= createdAt.toMillis() + 12*60*60*1000) return null;
      // Rules permit this profile only while the credential is still valid.
      const account = await sdk.getDocFromServer(sdk.doc(db,'accountProfiles',username));
      if (!account.exists()) return null;
      return {username, ...account.data()};
    },
    async logout() { await sdk.deleteDoc(ref); }
  };
}
