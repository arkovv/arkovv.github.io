/* Admin identity is verified by Firestore rules, never by a local role flag. */
let adminSession = false;
function showLogin(message = '') {
  backend = 'blocked'; S = null; adminSession = false;
  document.body.classList.add('signed-out');
  document.getElementById('overlayHost').replaceChildren();
  document.getElementById('view').innerHTML = `<section class="login-panel">
    <p class="login-eyebrow">FRIENDS CARDS</p><h1>Admin sign in</h1>
    <p>Manage your table, players, and cards.</p>
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
      if (profile.role !== 'admin') {
        await cloud.logout();
        throw new Error('This account is not an administrator. The player view is not available yet.');
      }
      adminSession = true;
      await boot();
    } catch (error) {
      document.getElementById('loginMessage').textContent = error.code === 'permission-denied'
        ? 'Login was rejected. Check your username/password, or ask the host to check the account and rules.' : error.message;
    } finally { button.disabled = false; button.textContent = 'Sign in'; }
  });
}
async function restoreLogin() {
  try {
    const profile = await (await connectFirebase()).currentSession();
    if (profile?.role !== 'admin') { showLogin(); return; }
    adminSession = true;
    await boot();
  } catch (_) { showLogin(); }
}
document.getElementById('adminLogout').addEventListener('click', async () => {
  if (saveDirty || saveInFlight) { flash('Wait for your changes to save before signing out.', true); return; }
  try {
    await (await connectFirebase()).logout();
    showLogin();
  } catch (_) { flash('Could not sign out online. Check your connection and retry.', true); }
});
