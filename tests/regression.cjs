const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function context(original=false){
  let seed=123456;
  const sandbox={console,Uint32Array,Date:class extends Date{static now(){return 1788500000000;}},crypto:{getRandomValues(a){for(let i=0;i<a.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;a[i]=seed;}return a;}},location:{protocol:'file:'},document:{addEventListener(){}},setTimeout(){},clearTimeout(){},localStorage:{setItem(){},getItem(){return null;}},matchMedia(){return {matches:true};}};
  const c=vm.createContext(sandbox);
  if(original){let s=fs.readFileSync(path.join(__dirname,'original-index.html'),'utf8').replace(/\r\n/g,'\n').match(/<script>([\s\S]*?)<\/script>/)[1];vm.runInContext(s.slice(0,s.indexOf('/* ============================================================\n   15.')),c);}
  else for(const file of ['state.js','validation.js','persistence.js','engine.js','views.js','actions.js','enhancements.js','card-visuals.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
  return c;
}
const run=(c,code)=>vm.runInContext(code,c);
function normalize(value){return JSON.parse(JSON.stringify(value));}
const a=context(true), b=context();
for(const c of [a,b])run(c,`loadDemo();let set=currentSet();set.participants=S.players.map(p=>p.id);set.state='DEFENSE';for(let i=0;i<S.players.length;i++){const target=set.designs.filter(d=>d.authorId===S.players[(i+1)%8].id);set.bids[S.players[i].id]={[target[0].id]:50,[target[1].id]:50};set.locked[S.players[i].id]=true;}for(const d of set.designs)set.defense[d.id]=d.id%3===1?50:0;finalizeMarket(set);`);
for(const expression of ['currentSet().snapshot','S.packs','S.players'])assert.deepEqual(normalize(run(a,expression)),normalize(run(b,expression)),expression+' differs from original');
assert.equal(run(b,'Object.values(currentSet().snapshot.rewards).reduce((a,b)=>a+b,0)'),3200);
assert.equal(run(b,'effectiveBid(50,50)'),0);assert.equal(run(b,'effectiveBid(51,50)'),51);
assert.ok(Math.abs(run(b,'standardHit(800,4,50,10)')-4/19)<1e-12);
run(b,`const frozen=JSON.stringify(currentSet().snapshot), wallets=JSON.stringify(S.players);S.config.scarcityExponent=99;S.config.packCost=999;if(JSON.stringify(currentSet().snapshot)!==frozen)throw Error('snapshot changed');if(!finalizeMarket(currentSet()))throw Error('double reveal allowed');if(JSON.stringify(S.players)!==wallets)throw Error('double payment');S.config={...DEFAULTS};`);
for(let i=0;i<20;i++){
  run(b,'for(const instance of S.instances) constellationArt(instance)');
  assert.deepEqual(normalize(run(a,'rollStandard(S.players[0].id)')),normalize(run(b,'rollStandard(S.players[0].id)')),'pack result changed');
}
run(b,`{
 if(authorSignature(2).theme!=='itachi'||authorSignature(3).theme==='itachi')throw Error('author override leaked');
 const instance=S.instances[0],before=JSON.stringify(S),art=constellationArt(instance);
 const reflection=JSON.stringify(reflectionProfile(instance));
 if(reflection!==JSON.stringify(reflectionProfile({...instance,ownerId:999,note:'changed'})))throw Error('reflection changed on trade');
 if(reflection===JSON.stringify(reflectionProfile({...instance,id:instance.id+10000})))throw Error('reflection lacks per-card variation');
 const families=[80000,35000,10000].map(floatValue=>reflectionProfile({...instance,floatValue}));
 if(!families[0].pattern.includes('repeating-linear')||!families[1].pattern.includes('repeating-radial')||!families[2].pattern.includes('conic-gradient'))throw Error('category reflection families missing');
 for(const [floatValue,effect] of [[100000,'leaves'],[50000,'leaves'],[49999,'akatsuki'],[20000,'akatsuki'],[19999,'amaterasu'],[100,'amaterasu'],[99,'amaterasu'],[0,'amaterasu']]){
   const copy={...instance,floatValue};
   if(cardFinish(copy).effect!==effect)throw Error('wrong float boundary '+floatValue);
   if(signatureEmblem(cardSignature(copy))!==itachiEmblem())throw Error('float changed author emblem');
 }
 let previous=-1;
 for(const floatValue of [100000,80000,50000,35000,20000,10000,100,0]){
   const value=cardFinish({...instance,floatValue}).blindness;
   if(value<previous||value<0||value>1)throw Error('blindness must increase as float decreases');previous=value;
 }
 if(art!==constellationArt(instance))throw Error('unstable artwork');
 if(art!==constellationArt({...instance,ownerId:999,tradeCount:12,note:'changed'}))throw Error('trade changed artwork');
 if(art===constellationArt({...instance,id:instance.id+10000}))throw Error('copies lack variation');
 const author=findDesign(instance.designId).design.authorId,person=player(author),name=person.name;
 person.name='Renamed';if(art!==constellationArt(instance))throw Error('rename changed artwork');person.name=name;
 if(JSON.stringify(S)!==before)throw Error('visuals mutated state');
}`);
run(b,'validateTable(S)');
run(b,`{
 const design=S.sets[0].designs.find(d=>d.authorId===1),sample={...S.instances[0],designId:design.id};
 let previous=terminalProfile({...sample,catalog:0});
 for(const catalog of [100,500,998]){const current=terminalProfile({...sample,catalog});if(current.columns<previous.columns||current.rows<previous.rows||current.linesPerSecond<=previous.linesPerSecond)throw Error('terminal does not intensify');previous=current;}
 const secret={...sample,catalog:999};
 if(!terminalProfile(secret).silent||terminalField(secret)!=='')throw Error('999 generated terminal');
 const front=collectibleFront(secret);
 if(!front.includes('alik-emblem')||!front.includes('FLOAT')||!front.includes('CATALOG')||!front.includes('silent-card')||front.includes('cyber-display'))throw Error('secret identity or silence broken');
 if(cyberpunkClarity({...sample,floatValue:50000})!==0||cyberpunkClarity({...sample,floatValue:0})!==1||cyberpunkClarity({...sample,floatValue:10000})<=cyberpunkClarity({...sample,floatValue:30000}))throw Error('clarity must increase below 0.5');
 if(pixelNumbers(sample)!==pixelNumbers({...sample,ownerId:999}))throw Error('hologram changed on trade');
 if(terminalProfile({...S.instances[0],catalog:999}).silent!==true)throw Error('terminal profile boundary failed');
 if(cardFinish({...S.instances[0],catalog:999}).effect==='silence')throw Error('secret leaked to another author');
}`);
run(b,`{
 const design=S.sets[0].designs.find(d=>d.authorId===5),sample={...S.instances[0],designId:design.id,catalog:500};
 if(cardSignature(sample).theme!=='doppler')throw Error('Kadyr finish missing');
 for(const [catalog,green] of [[0,0],[1,.05],[500,25],[998,49.9],[999,100]])if(dopplerProfile({...sample,catalog}).greenPercent!==green)throw Error('green coverage wrong');
 const marble=dopplerSurface(sample),art=constellationArt(sample),style=visualStyle(sample),before=JSON.stringify(S);
 for(const floatValue of [0,100,50000,100000]){
  const copy={...sample,floatValue,ownerId:777,id:888};
  if(marble!==dopplerSurface(copy)||art!==constellationArt(copy)||style!==visualStyle(copy))throw Error('float or ownership altered Doppler');
 }
 if(marble===dopplerSurface({...sample,catalog:501}))throw Error('catalogue patterns must differ');
 if(dopplerSurface({...sample,catalog:999}).includes('hsl(2'))throw Error('emerald contains blue');
 if(JSON.stringify(S)!==before)throw Error('Doppler mutated game state');
}`);
for(const mutate of ['x.version=2','x.players[1].id=x.players[0].id','x.ids.player=1','x.sets[0].snapshot.standard.fail=0','x.instances[0].designId=999999','x.ledger[0].delta="bad"']){
  assert.throws(()=>run(b,`{const x=JSON.parse(JSON.stringify(S));${mutate};validateTable(x);}`),mutate);
}
assert.equal(run(b,`historyFilter.set=String(currentSet().id);filteredHistory('ledger').length`),run(b,'S.ledger.length'));
assert.equal(run(b,`csvCell('=SUM(A1)')`),`"'=SUM(A1)"`);
fs.writeFileSync(path.join(__dirname,'fixture.json'),JSON.stringify(run(b,'S'),null,2));
console.log('PASS: original/new market and 20 pack outcomes match; payout, defense ties, frozen odds, duplicate reveal, validation, history and CSV checks passed.');

