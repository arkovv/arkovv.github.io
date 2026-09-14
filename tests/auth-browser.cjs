const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),work=fs.mkdtempSync(path.join(__dirname,'browser-auth-'));
const server=spawn('python',['-B',path.join(__dirname,'serve_fixture.py'),work],{cwd:root,windowsHide:true});
let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{const match=data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await require('./cloud-fixture.cjs')(page,JSON.parse(fs.readFileSync(path.join(__dirname,'fixture.json'),'utf8')));
 await page.goto(url);
 assert.equal(await page.locator('header').isVisible(),false);
 await page.locator('#loginUser').fill('arkov');
 await page.locator('#loginPassword').fill('wrong');
 await page.locator('#adminLogin button').click();
 await page.waitForFunction(()=>document.getElementById('loginMessage').textContent.includes('Incorrect'));
 await page.locator('#loginPassword').fill('fixture-password-only');
 await page.locator('#adminLogin button').click();
 await page.waitForFunction(()=>S&&backend==='cloud');
 for(const tab of ['setup','auction','shop','market','cards','players']){
   await page.locator('[data-tab="'+tab+'"]').click();
   assert.ok(await page.locator('main h1').count());
 }
 await page.waitForFunction(()=>!saveDirty&&!saveInFlight);
 await page.reload();await page.waitForFunction(()=>S&&backend==='cloud');
 assert.equal(await page.locator('header').isVisible(),true);
 await page.locator('#adminLogout').click();
 await page.locator('#adminLogin').waitFor();
 assert.equal(await page.evaluate(()=>S),null);
 assert.equal(await page.locator('header').isVisible(),false);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(work,'login-mobile.png')});
 // Incomplete config should report an actionable error, with no unhandled rejection.
 const missing=await browser.newPage();missing.on('pageerror',e=>errors.push(e.message));
 await missing.route('**/site-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.FC_FIREBASE_CONFIG={apiKey:"YOUR_API_KEY",appId:"YOUR_APP_ID"};'}));
 await missing.goto(url);await missing.locator('#loginUser').fill('arkov');await missing.locator('#loginPassword').fill('fixture-password-only');
 await missing.locator('#adminLogin button').click();
 await missing.waitForFunction(()=>document.getElementById('loginMessage').textContent.includes('setup is incomplete'));
 await missing.locator('#adminLogin button').click();
 assert.equal(await missing.locator('header').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: incorrect login, admin login, all tabs, saving, logout, mobile layout; no browser errors');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
