const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.join(root,'_site');
execFileSync(process.execPath,[path.join(root,'scripts/build.mjs')]);
const server=http.createServer((request,response)=>{
 const prefix='/friends-cards/';
 const url=new URL(request.url,'http://localhost');
 if(!url.pathname.startsWith(prefix)){response.writeHead(404);response.end();return;}
 const name=url.pathname.slice(prefix.length)||'index.html';
 if(!fs.readdirSync(output).includes(name)){response.writeHead(404);response.end();return;}
 response.setHeader('Content-Type',name.endsWith('.html')?'text/html':/\.(js|mjs)$/.test(name)?'application/javascript':name.endsWith('.css')?'text/css':'application/octet-stream');
 response.end(fs.readFileSync(path.join(output,name)));
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await require('./cloud-fixture.cjs')(page,JSON.parse(fs.readFileSync(path.join(__dirname,'fixture.json'),'utf8')));
 const url=`http://127.0.0.1:${server.address().port}/friends-cards/`;
 await page.goto(url);await page.locator('#loginUser').fill('arkov');await page.locator('#loginPassword').fill('fixture-password-only');await page.locator('#adminLogin button').click();
 await page.waitForFunction(()=>S&&backend==='cloud');
 assert.equal(await page.evaluate(async()=>typeof(await import('./cloud-store.mjs')).createCloudStore),'function');
 assert.equal((await page.request.get(url+'friends-cards.db')).status(),404);
 assert.equal((await page.request.get(url+'server.py')).status(),404);
 assert.equal((await page.request.get(url+'ART-CREDITS.md')).status(),200);
 assert.deepEqual(errors,[]);
 console.log('PASS: built Pages artifact loads at a repository subpath, imports the cloud module, and excludes private/backend files');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
