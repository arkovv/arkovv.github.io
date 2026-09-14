import {mkdir, copyFile, readFile, writeFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '_site');
const assets = ['index.html','styles.css','state.js','validation.js','persistence.js','engine.js','views.js','actions.js','enhancements.js','card-visuals.js','app.js','auth.js','player-view.js','firebase-client.js','cloud-store.mjs','session-client.mjs','site-config.js','alik-emblem.png','ART-CREDITS.md'];
if (process.argv.includes('--require-config')) {
  const context = {window:{}};
  vm.runInNewContext(await readFile(path.join(root,'site-config.js'),'utf8'),context);
  const config = context.window.FC_FIREBASE_CONFIG;
  if (!config?.apiKey || !config?.appId || /YOUR_/.test(config.apiKey + config.appId)) {
    throw new Error('Fill in the Firebase apiKey and appId in site-config.js before publishing.');
  }
}
await mkdir(output,{recursive:true});
// Refuse stale extra files rather than accidentally deploying them or deleting user files.
for (const name of await readdir(output)) {
  if (![...assets,'.nojekyll'].includes(name)) throw new Error(`Unexpected output file: ${name}. Move it out of _site before building.`);
}
for (const asset of assets) await copyFile(path.join(root,asset),path.join(output,asset));
await writeFile(path.join(output,'.nojekyll'),'');
console.log(`Prepared ${assets.length} public assets in _site. No databases, exports, tests, or Python backend included.`);
