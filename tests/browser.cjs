const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),work=fs.mkdtempSync(path.join(__dirname,'browser-'));
const env={...process.env,TEMP:work,TMP:work,PYTHONDONTWRITEBYTECODE:'1'};
const server=spawn('python',['-B',path.join(__dirname,'serve_fixture.py'),work],{cwd:root,env,windowsHide:true});
let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const match=d.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});server.on('error',reject);server.on('exit',code=>reject(Error('Server exited '+code)));});
 browser=await chromium.launchPersistentContext(path.join(work,'profile'),{headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',env,downloadsPath:work,artifactsDir:work,viewport:{width:1440,height:1000},args:['--disable-breakpad','--disable-crash-reporter','--no-first-run']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const cloud=await require('./cloud-fixture.cjs')(page,JSON.parse(fs.readFileSync(path.join(__dirname,'fixture.json'),'utf8')));
 async function signIn(target){await target.locator('#loginUser').fill('arkov');await target.locator('#loginPassword').fill('fixture-password-only');await target.locator('#adminLogin button').click();await target.waitForFunction(()=>S&&backend==='cloud');}
 await page.goto(url);await signIn(page);
 for(const tab of ['setup','auction','shop','market','cards','players']){
   await page.locator('[data-tab="'+tab+'"]').click();await page.waitForTimeout(30);assert.ok(await page.locator('main h1').count());
   if(['shop','cards','market'].includes(tab)){
     await page.waitForFunction(()=>!saveDirty&&!saveInFlight);
     await page.screenshot({path:path.join(__dirname,'hud-'+tab+'.png'),animations:'disabled'});
   }
   if(tab==='cards'){
     const before=await page.evaluate(()=>JSON.stringify(S));
     await page.locator('.coll').first().click();
     assert.equal(await page.locator('#inspectFront').isVisible(),true);
     assert.equal(await page.locator('#inspectBack').isVisible(),false);
     const surface=page.locator('.inspect-collectible'),box=await surface.boundingBox();
     await page.mouse.move(box.x+box.width*.7,box.y+box.height*.3);
     assert.equal(await surface.evaluate(el=>el.classList.contains('foil-active')),true);
     await page.screenshot({path:path.join(__dirname,'card-inspection.png'),animations:'disabled'});
     if(await page.locator('.amaterasu-art').count()){
       const originalName=await page.evaluate(()=>player(2).name);
       await page.evaluate(()=>{player(2).name='Azat';inspectCard(S.instances[0].id);});
       await page.screenshot({path:path.join(__dirname,'azat-style-preview.png'),animations:'disabled'});
       await page.evaluate(name=>{player(2).name=name;inspectCard(S.instances[0].id);},originalName);
       await page.evaluate(()=>{
         const original=S.instances[0];
         showModal('<h1>Azat · Float finishes</h1><p>Visual samples only — existing card data is unchanged.</p><div class="float-preview-grid">'+[80000,35000,10000,100].map(floatValue=>{
           const sample={...original,floatValue};
           return '<div class="collectible celestial" data-foil style="'+visualStyle(sample)+'">'+collectibleFront(sample)+'</div>';
         }).join('')+'</div>');
         document.querySelector('.modal').style.maxWidth='1320px';
       });
       await page.screenshot({path:path.join(__dirname,'azat-float-finishes.png'),animations:'disabled'});
       assert.equal(await page.locator('#overlayHost .effect-leaves').count(),1);
       assert.equal(await page.locator('#overlayHost .effect-akatsuki').count(),1);
       assert.equal(await page.locator('#overlayHost .effect-amaterasu').count(),2);
       assert.equal(await page.locator('#overlayHost .itachi-eye').count(),4);
       await page.evaluate(()=>inspectCard(S.instances[0].id));
     }
     await page.evaluate(()=>{
       const design=S.sets[0].designs.find(d=>d.authorId===1),sample={...S.instances[0],designId:design.id};
       showModal('<h1>Alik · Cyberpunk base</h1><p>Emblem preview on a sample card.</p><div class="collectible celestial inspect-collectible" data-foil style="'+visualStyle(sample)+'">'+collectibleFront(sample)+'</div>');
     });
     await page.locator('#overlayHost .alik-emblem').evaluate(img=>img.decode());
     assert.equal(await page.locator('#overlayHost .alik-emblem').evaluate(img=>img.naturalWidth),4500);
     const centered=await page.locator('#overlayHost .alik-emblem').evaluate(img=>{const a=img.getBoundingClientRect(),b=img.parentElement.getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1&&Math.abs(a.y+a.height/2-b.y-b.height/2)<1;});
     assert.equal(centered,true,'Alik emblem must be centered inside its badge');
     const numericCard=page.locator('#overlayHost .collectible'),numericLayer=numericCard.locator(':scope > .cyber-display');
     const fullBounds=await numericCard.boundingBox(),layerBounds=await numericLayer.boundingBox();
     assert.ok(Math.abs(fullBounds.height-layerBounds.height)<3,'numeric foil must cover the full card');
     const readLight=()=>numericCard.evaluate(el=>({mask:getComputedStyle(el.querySelector('.pixel-numbers')).maskImage,foil:getComputedStyle(el.querySelector('.cyber-holo')).backgroundPosition}));
     await numericCard.dispatchEvent('pointermove',{pointerType:'mouse',clientX:fullBounds.x+30,clientY:fullBounds.y+30});
     const lightA=await readLight();
     await numericCard.dispatchEvent('pointermove',{pointerType:'mouse',clientX:fullBounds.x+fullBounds.width-30,clientY:fullBounds.y+fullBounds.height-30});
     const lightB=await readLight();
     assert.notEqual(lightA.mask,lightB.mask,'numbers must respond to pointer light');
     assert.notEqual(lightA.foil,lightB.foil,'holo must respond to pointer light');
     await numericCard.dispatchEvent('pointermove',{pointerType:'touch',buttons:1,clientX:fullBounds.x+40,clientY:fullBounds.y+80});
     assert.notEqual((await readLight()).mask,lightB.mask,'numbers must respond to touch');
     await page.screenshot({path:path.join(__dirname,'alik-cyberpunk-preview.png'),animations:'disabled'});
     await page.evaluate(()=>{
       const design=S.sets[0].designs.find(d=>d.authorId===1),sample={...S.instances[0],designId:design.id};
       showModal('<h1>Alik · Catalog terminal</h1><div class="float-preview-grid">'+[0,500,998,999].map(catalog=>{const card={...sample,catalog,floatValue:catalog===0?50000:catalog===500?20000:1000};return '<div class="collectible celestial" data-foil style="'+visualStyle(card)+'">'+collectibleFront(card)+'</div>';}).join('')+'</div>');
       document.querySelector('.modal').style.maxWidth='1320px';
     });
     const silent=page.locator('#overlayHost .collectible:has(.silent-card)');
     assert.equal(await silent.locator('.silent-card').textContent(),'silence is deafening?');
     assert.equal(await silent.locator('.alik-emblem').count(),1);
     assert.equal(await silent.locator('.ser,.state,h3').count(),3);
     assert.equal(await silent.locator('svg,.terminal-field,.terminal-scroll,.cyber-holo').count(),0);
     assert.equal(await silent.locator('.typed-letter').last().evaluate(el=>getComputedStyle(el).opacity),'0');
     await page.waitForTimeout(4200);
     assert.equal(await silent.locator('.typed-letter').last().evaluate(el=>getComputedStyle(el).opacity),'1');
     await silent.hover();
     assert.equal(await silent.evaluate(el=>getComputedStyle(el).transform),'none');
     assert.equal(await silent.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
     await page.screenshot({path:path.join(__dirname,'alik-terminal-preview.png'),animations:'disabled'});
     await page.emulateMedia({reducedMotion:'reduce'});
     assert.equal(await silent.locator('.typed-letter').last().evaluate(el=>getComputedStyle(el).opacity),'1');
     assert.equal(await page.locator('#overlayHost .cyber-holo').first().evaluate(el=>getComputedStyle(el).animationName),'none');
     await page.setViewportSize({width:390,height:844});
     assert.ok(await page.evaluate(()=>document.querySelector('.modal').scrollWidth<=document.querySelector('.modal').clientWidth+1),'Alik mobile preview overflow');
     await page.setViewportSize({width:1440,height:1000});
     await page.emulateMedia({reducedMotion:'no-preference'});
     await page.evaluate(()=>{
       const design=S.sets[0].designs.find(d=>d.authorId===5),sample={...S.instances[0],designId:design.id};
       showModal('<h1>Kadyr · Doppler catalogue finishes</h1><p>000: 0% green · 500: 25% · 998: 49.9% · 999: emerald. Float does not affect the finish.</p><div class="float-preview-grid">'+[0,500,998,999].map(catalog=>{const card={...sample,catalog};return '<div class="collectible celestial" data-foil style="'+visualStyle(card)+'">'+collectibleFront(card)+'</div>';}).join('')+'</div>');
       document.querySelector('.modal').style.maxWidth='1320px';
     });
     assert.equal(await page.locator('#overlayHost .doppler-surface').count(),4);
     assert.equal(await page.locator('#overlayHost .author-sigil').count(),4);
     const doppler=page.locator('#overlayHost .collectible').nth(2),dopplerBox=await doppler.boundingBox();
     const lightBefore=await doppler.locator('.doppler-light').evaluate(el=>getComputedStyle(el).backgroundImage);
     await doppler.dispatchEvent('pointermove',{pointerType:'mouse',clientX:dopplerBox.x+50,clientY:dopplerBox.y+90});
     assert.notEqual(await doppler.locator('.doppler-light').evaluate(el=>getComputedStyle(el).backgroundImage),lightBefore);
     assert.equal(await doppler.evaluate(el=>getComputedStyle(el).transform),'none','Doppler must only react through lighting');
     assert.equal(await doppler.evaluate(el=>el.getAnimations({subtree:true}).length),0,'Doppler must have no idle animations');
     const fixedPattern=await doppler.locator('.doppler-marble').first().innerHTML();
     const reflectionA=await doppler.locator('.doppler-reflection').evaluate(el=>getComputedStyle(el).maskImage);
     await doppler.dispatchEvent('pointermove',{pointerType:'mouse',clientX:dopplerBox.x+dopplerBox.width-30,clientY:dopplerBox.y+dopplerBox.height-40});
     assert.notEqual(await doppler.locator('.doppler-reflection').evaluate(el=>getComputedStyle(el).maskImage),reflectionA);
     assert.equal(await doppler.locator('.doppler-marble').first().innerHTML(),fixedPattern,'light must not alter the pigment pattern');
     await page.screenshot({path:path.join(__dirname,'kadyr-doppler-preview.png'),animations:'disabled'});
     await page.setViewportSize({width:390,height:844});
     assert.ok(await page.evaluate(()=>document.querySelector('.modal').scrollWidth<=document.querySelector('.modal').clientWidth+1),'Doppler mobile overflow');
     await page.emulateMedia({reducedMotion:'reduce'});
     const reducedLight=await doppler.locator('.doppler-light').evaluate(el=>getComputedStyle(el).backgroundImage);
     await doppler.dispatchEvent('pointermove',{pointerType:'touch',buttons:1,clientX:20,clientY:20});
     assert.equal(await doppler.locator('.doppler-light').evaluate(el=>getComputedStyle(el).backgroundImage),reducedLight);
     await page.emulateMedia({reducedMotion:'no-preference'});
     await page.setViewportSize({width:1440,height:1000});
     await page.evaluate(()=>{
       const design=S.sets[0].designs.find(d=>d.authorId===5),sample={...S.instances[0],designId:design.id};
       showModal('<h1>Kadyr · Reflected light</h1><p>Same 998 pattern under three light angles, then Emerald 999. The pigment stays fixed.</p><div class="float-preview-grid">'+[998,998,998,999].map(catalog=>{const card={...sample,catalog};return '<div class="collectible celestial" data-foil style="'+visualStyle(card)+'">'+collectibleFront(card)+'</div>';}).join('')+'</div>');
       document.querySelector('.modal').style.maxWidth='1320px';
     });
     const lightCards=page.locator('#overlayHost .collectible');
     for(let n=0;n<4;n++){
       const el=lightCards.nth(n),r=await el.boundingBox(),xy=[[.12,.18],[.5,.5],[.9,.8],[.22,.3]][n];
       await el.dispatchEvent('pointermove',{pointerType:'mouse',clientX:r.x+r.width*xy[0],clientY:r.y+r.height*xy[1]});
     }
     await page.screenshot({path:path.join(__dirname,'kadyr-doppler-light-preview.png'),animations:'disabled'});
     await page.evaluate(()=>inspectCard(S.instances[0].id));
     await page.locator('[data-card-flip]').click();
     assert.equal(await page.locator('#inspectBack').isVisible(),true);
     assert.equal(await page.locator('#inspectFront').isVisible(),false);
     assert.ok((await page.locator('#inspectBack').textContent()).includes('The request'));
     await page.screenshot({path:path.join(__dirname,'card-details.png'),animations:'disabled'});
     await page.keyboard.press('Escape');
     assert.equal(await page.evaluate(()=>JSON.stringify(S)),before);
   }
 }
 assert.equal(await page.locator('#nav .hud-icon').count(),6);
 assert.equal(await page.locator('.stage-track [aria-current="step"]').count(),1);
 assert.equal(await page.locator('#playerAvatar').textContent(),'A');
 await page.locator('[data-history="player"]').selectOption('1');
 assert.ok(await page.locator('.history-filters').count());
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForFunction(()=>!saveDirty&&!saveInFlight);
 await page.screenshot({path:path.join(__dirname,'desktop.png'),fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 for(const tab of ['setup','auction','shop','market','cards','players']){
   await page.locator('[data-tab="'+tab+'"]').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow on '+tab);
   if(tab==='cards'){
     await page.locator('.coll').first().click();
     await page.locator('.inspect-collectible').dispatchEvent('pointermove',{pointerType:'touch',buttons:1,clientX:180,clientY:350});
     assert.equal(await page.locator('.inspect-collectible').evaluate(el=>el.classList.contains('foil-active')),true);
     await page.locator('[data-card-flip]').click();
     assert.ok(await page.evaluate(()=>document.querySelector('.modal').scrollWidth<=document.querySelector('.modal').clientWidth+1),'mobile inspection overflow');
     await page.locator('[data-card-flip]').click();
     await page.screenshot({path:path.join(__dirname,'card-mobile.png'),animations:'disabled'});
     await page.keyboard.press('Escape');
   }
 }
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForFunction(()=>!saveDirty&&!saveInFlight);
 await page.screenshot({path:path.join(__dirname,'mobile.png'),fullPage:true,animations:'disabled'});
 assert.equal(await page.locator('#saveState').getAttribute('data-status'),'saved');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>inspectCard(S.instances[0].id));
 assert.equal(await page.locator('#overlayHost .blindness-fog').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.keyboard.press('Escape');
 await page.evaluate(()=>showPackAnimation({type:'STANDARD',playerId:1,outcome:'FAIL',odds:{fail:1,cards:{},conditional:{},hit:0,failReward:10},refund:10}));
 assert.equal(await page.locator('[role="dialog"]').count(),1);assert.equal(await page.locator('#strip').count(),0);
 await page.keyboard.press('Escape');assert.equal(await page.locator('[role="dialog"]').count(),0);
 // Failed saves remain dirty, expose export/retry, and recover when the server returns.
 await page.waitForFunction(()=>!saveDirty&&!saveInFlight);
 cloud.fail=true;
 await page.evaluate(()=>{S.ui.tab='cards';save();});await page.waitForFunction(()=>document.getElementById('saveState').textContent.includes('test outage'));
 assert.equal(await page.evaluate(()=>saveDirty),true);assert.equal(await page.locator('#emergencyExport').isVisible(),true);
 cloud.fail=false;await page.locator('#retrySave').click();await page.waitForFunction(()=>!saveDirty&&!saveInFlight);
 // An edit during an in-flight save must survive and reach the database.
 cloud.delay=250;
 await page.evaluate(()=>{S.ui.tab='setup';save();pushToDb();S.ui.tab='players';save();});
 await page.waitForFunction(()=>!saveDirty&&!saveInFlight);cloud.delay=0;
 assert.equal(cloud.value.ui.tab,'players');
 assert.equal((await page.request.get(url+'/friends-cards.db')).status(),404);
 // Export/import and restore remain available to authenticated administrators.
 const local=await browser.newPage();local.on('pageerror',e=>errors.push(e.message));local.on('dialog',d=>d.accept());
 await require('./cloud-fixture.cjs')(local,cloud.value);
 await local.goto(url);await signIn(local);
 await local.locator('[data-tab="setup"]').click();
 await local.locator('[data-act="demo"]').click();await local.waitForFunction(()=>!saveDirty&&!saveInFlight);await local.reload();await local.waitForFunction(()=>S?.players.length===8);
 assert.equal(await local.evaluate(()=>backend),'cloud');
 const originalLocal=await local.evaluate(()=>JSON.stringify(S));
 const chooser=local.waitForEvent('filechooser');await local.locator('[data-act="importJson"]').click();
 await (await chooser).setFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"players":[],"sets":[]}')});
 await local.waitForFunction(()=>document.querySelector('.notice.err')?.textContent.includes('Unsupported backup version'));
 assert.equal(await local.evaluate(()=>JSON.stringify(S)),originalLocal);
 const validChooser=local.waitForEvent('filechooser');await local.locator('[data-act="importJson"]').click();
 await (await validChooser).setFiles({name:'fixture.json',mimeType:'application/json',buffer:fs.readFileSync(path.join(__dirname,'fixture.json'))});
 await local.waitForFunction(()=>S.sets[0].state==='LIVE');
 await local.locator('[data-tab="setup"]').click();await local.locator('[data-act="wipe"]').click();
 await local.waitForFunction(()=>S.players.length===0);
 // Setup keeps recovery available even when the roster is empty.
 await local.locator('[data-act="restorePrevious"]').click();await local.waitForFunction(()=>S.players.length===8);
 assert.deepEqual(errors,[]);console.log('PASS: six desktop/mobile screens, no horizontal page overflow, reduced motion/dialogs, save failure/retry, in-flight edits, protected files, authenticated persistence; no browser errors.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 if(browser)await browser.close();
 if(server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}
 const resolved=fs.realpathSync(work),tests=fs.realpathSync(__dirname);
 if(!resolved.startsWith(tests+path.sep))throw Error('Refusing cleanup outside tests');
 fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
});
