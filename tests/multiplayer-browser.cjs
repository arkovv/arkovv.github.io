const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const fixture=require('./cloud-fixture.cjs'),root=path.resolve(__dirname,'..'),work=fs.mkdtempSync(path.join(__dirname,'browser-multiplayer-'));
const server=spawn('python',['-B',path.join(__dirname,'serve_fixture.py'),work],{cwd:root,windowsHide:true});
let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=d.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const initial=JSON.parse(fs.readFileSync(path.join(__dirname,'fixture.json'),'utf8')),errors=[];
 const a=await browser.newPage(),b=await browser.newPage(),admin=await browser.newPage();
 for(const p of [a,b,admin]){p.on('pageerror',e=>errors.push(e.message));await p.emulateMedia({reducedMotion:'reduce'});}
 const shared=await fixture(a,initial,{username:'p2',role:'player',playerId:2});
 await fixture(b,initial,{username:'p3',role:'player',playerId:3},shared);await fixture(admin,initial,{username:'host',role:'admin'},shared);
 async function signIn(page,name,navigate=true){if(navigate)await page.goto(url);await page.locator('#loginUser').fill(name);await page.locator('#loginPassword').fill('fixture-password-only');await page.locator('#adminLogin button').click();await page.waitForFunction(()=>S&&backend==='cloud');}
 const settled=p=>p.waitForFunction(()=>!playerBusy&&!saveDirty&&!saveInFlight&&!pendingPlayerOperation);
 await Promise.all([signIn(a,'p2'),signIn(b,'p3'),signIn(admin,'host')]);
 const beforeNavigation=shared.commits;for(const tab of ['cards','shop','players'])await admin.locator('[data-tab="'+tab+'"]').click();
 assert.equal(shared.commits,beforeNavigation,'admin navigation must not write the game');
 await Promise.all([a.locator('[data-tab="packs"]').click(),b.locator('[data-tab="packs"]').click()]);
 shared.delay=100;
 await Promise.all([a.locator('[data-player-act="open"][data-id="2"]').click(),b.locator('[data-player-act="open"][data-id="3"]').click()]);
 await Promise.all([settled(a),settled(b)]);shared.delay=0;
 assert.equal(shared.value.packs.find(p=>p.id===2).opened,true);assert.equal(shared.value.packs.find(p=>p.id===3).opened,true);
 await a.keyboard.press('Escape');await b.keyboard.press('Escape');
 await admin.waitForFunction(()=>S.packs.find(p=>p.id===2).opened&&S.packs.find(p=>p.id===3).opened);
 // A live offer appears on an idle recipient without Refresh.
 await Promise.all([a.locator('[data-tab="trading"]').click(),b.locator('[data-tab="trading"]').click()]);
 await a.locator('[data-player-filter="tradePartner"]').selectOption('3');await a.locator('#giveCredits').fill('5');await a.locator('[data-player-act="offer"]').click();await settled(a);
 await b.locator('[data-player-act="accept"]').waitFor();await b.locator('[data-player-act="accept"]').click();await settled(b);
 await a.waitForFunction(()=>S.trades[0].status==='ACCEPTED');
 // A committed purchase with a lost response retries the same ID, not the charge.
 await a.locator('[data-tab="packs"]').click();shared.lostResponse=true;
 await a.locator('[data-player-act="buy"]').click();await a.waitForFunction(()=>!playerBusy&&pendingPlayerOperation);
 const afterLost=JSON.stringify(shared.value),commits=shared.commits;
 await a.locator('#retrySave').click();await settled(a);assert.equal(shared.commits,commits);assert.equal(JSON.stringify(shared.value),afterLost);
 await a.keyboard.press('Escape');
 // An expired admin session keeps pending edits and resumes after login.
 await admin.waitForFunction(()=>S.operations.length>=3);
 shared.expired=true;
 await admin.evaluate(()=>{S.players[0].name='Recovered edit';save();pushToDb();});
 await admin.locator('#adminLogin').waitFor();await signIn(admin,'host',false);await settled(admin);
 assert.equal(shared.value.players[0].name,'Recovered edit');
 // The former admin browser now sees the current table after a true conflict.
 await admin.evaluate(()=>{stopLiveSync();S.players[1].credits+=10;save();clearTimeout(savePending);});
 await b.locator('[data-tab="packs"]').click();await b.locator('[data-player-act="buy"]').click();await settled(b);await b.keyboard.press('Escape');
 // Change the same balance remotely to force a genuine overlapping field edit.
 shared.value.players[1].credits+=1;shared.revision++;
 await admin.evaluate(()=>pushToDb());await settled(admin);assert.equal(await admin.evaluate(()=>backend),'cloud');
 assert.ok(await admin.locator('.notice.err').count());
 assert.deepEqual(errors,[]);console.log('PASS: shared browsers, overlapping actions, live offers, idempotent retry, admin UI isolation, session recovery and conflict recovery');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
