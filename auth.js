/* Admin identity is verified by Firestore rules, never by a local role flag. */
let adminSession = false;
let reauthMessage=null, suspendedAdmin=null;
function requestReauthentication(message){
  reauthMessage=message;
  if(saveInFlight||playerBusy)return;
  flushReauthentication();
}
function flushReauthentication(){
  if(!reauthMessage||saveInFlight||playerBusy)return;
  const message=reauthMessage;reauthMessage=null;
  if(saveDirty&&S&&accountSession){keepRecovery();suspendedAdmin={username:accountSession.username,state:structuredClone(S),base:syncCloud?.getBase?.(),replace:replacementPending};}
  clearTimeout(savePending);saveDirty=false;replacementPending=false;
  showLogin(message);
}
function showLogin(message = '') {
  stopLiveSync();clearTimeout(savePending);
  closeOverlay();
  backend = 'blocked'; S = null; adminSession = false; accountSession = null;
  playerTradeDraft=emptyTradeDraft();pendingPlayerOperation=null;
  document.body.classList.remove('player-mode');
  document.body.classList.add('signed-out');
  document.getElementById('overlayHost').replaceChildren();
  document.getElementById('view').innerHTML = `<section class="login-panel">
    <p class="login-eyebrow">FRIENDS CARDS</p><h1>Welcome to the table</h1>
    <p>Your cards. Your packs. Your next trade.</p>
    <form id="adminLogin"><label for="loginUser">Username</label>
    <input id="loginUser" name="username" autocomplete="username" required>
    <label for="loginPassword">Password</label>
    <input id="loginPassword" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button><p id="loginMessage" role="status"></p></form></section>`;
  document.getElementById('loginMessage').textContent = message;
  document.getElementById('adminLogin').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button');
    button.disabled = true; button.textContent = 'Connecting…';
    try {
      const cloud = await connectFirebase();
      const profile = await cloud.login(form.username.value, form.password.value);
      form.password.value = '';
      if (!validAccountProfile(profile)) {
        await cloud.logout();
        throw new Error('This account does not have a valid player or admin profile.');
      }
      accountSession = profile;
      scopeRecovery();
      adminSession = true;
      await boot();
    } catch (error) {
      const message=document.getElementById('loginMessage');if(message)message.textContent = error.code === 'permission-denied'
        ? 'Login was rejected. Check your username/password, or ask the host to check the account and rules.' : error.message;
    } finally { button.disabled = false; button.textContent = 'Sign in'; }
  });
}
async function restoreLogin() {
  try {
    const profile = await (await connectFirebase()).currentSession();
    if (!validAccountProfile(profile)) { showLogin(); return; }
    accountSession = profile;
    scopeRecovery();
    adminSession = true;
    await boot();
  } catch (_) { showLogin(); }
}
document.getElementById('adminLogout').addEventListener('click', async () => {
  if (saveDirty || saveInFlight || playerBusy || pendingPlayerOperation) { flash('Finish or retry your pending action before signing out.', true); return; }
  try {
    await (await connectFirebase()).logout();
    showLogin();
  } catch (_) { flash('Could not sign out online. Check your connection and retry.', true); }
});
function validAccountProfile(profile){
  return profile?.role === 'admin' || (profile?.role === 'player' && Number.isSafeInteger(profile.playerId) && profile.playerId > 0);
}
