/* Connect on demand so a failed startup can be retried without reloading. */
let firebaseConnection = null;
let tabIdentityPromise=null;
function claimTabIdentity(){
  if(tabIdentityPromise)return tabIdentityPromise;
  tabIdentityPromise=new Promise(resolve=>{
    let id;try{id=sessionStorage.getItem('friendsCards.tabIdentity');}catch(_){}
    const claim=()=>{
      id=id||crypto.randomUUID();
      const accept=()=>{try{sessionStorage.setItem('friendsCards.tabIdentity',id);}catch(_){}resolve(id);};
      // Older browsers cannot detect a duplicated tab, but retaining the ID
      // still keeps a normal refresh signed in.
      if(!navigator.locks){accept();return;}
      navigator.locks.request('friendsCards.tab.'+id,{ifAvailable:true},lock=>{
        if(!lock){id=null;claim();return;}
        accept();return new Promise(()=>{}); // Browser releases the lock on unload.
      }).catch(()=>{id=crypto.randomUUID();accept();});
    };
    claim();
  });
  return tabIdentityPromise;
}
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
  // A named app plus a tab lock isolates even duplicated tabs (whose session
  // storage starts as a copy) while allowing a normal refresh to restore login.
  const name='table-'+await claimTabIdentity();
  const existing=getApps().find(app=>app.name===name);
  const firebaseApp = existing || initializeApp(config,name);
  const auth = existing?authSdk.getAuth(firebaseApp):authSdk.initializeAuth(firebaseApp, {persistence:authSdk.browserSessionPersistence});
  await auth.authStateReady();
  if (!auth.currentUser) await authSdk.signInAnonymously(auth);
  const db = firestoreSdk.getFirestore(firebaseApp);
  return {...createCloudStore(firestoreSdk, db), ...createSessionClient(firestoreSdk, db, auth.currentUser.uid)};
}
