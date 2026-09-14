/* Connect on demand so a failed startup can be retried without reloading. */
let firebaseConnection = null;
function connectFirebase() {
  if (!firebaseConnection) {
    firebaseConnection = initializeFirebase().catch(error => {
      firebaseConnection = null;
      throw error;
    });
  }
  return firebaseConnection;
}
async function initializeFirebase() {
  const config = window.FC_FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.appId || /YOUR_/.test(config.apiKey + config.appId)) {
    throw new Error('Firebase setup is incomplete. Add apiKey and appId in site-config.js.');
  }
  if (!window.isSecureContext) throw new Error('Open this app over HTTPS or on localhost.');
  const [{initializeApp, getApps}, authSdk, firestoreSdk, {createCloudStore}, {createSessionClient}] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js'),
    import('./cloud-store.mjs'),
    import('./session-client.mjs')
  ]);
  const firebaseApp = getApps()[0] || initializeApp(config);
  const auth = authSdk.getAuth(firebaseApp);
  await auth.authStateReady();
  if (!auth.currentUser) await authSdk.signInAnonymously(auth);
  const db = firestoreSdk.getFirestore(firebaseApp);
  return {...createCloudStore(firestoreSdk, db), ...createSessionClient(firestoreSdk, db, auth.currentUser.uid)};
}
