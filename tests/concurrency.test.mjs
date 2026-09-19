import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,randomUUID} from 'node:crypto';
import {createCloudStore,mergeChanges} from '../cloud-store.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixture.json',import.meta.url)));
function game(){
 const c=vm.createContext({console,crypto:webcrypto,Uint32Array,Date,structuredClone,document:{addEventListener(){}},setTimeout(){},clearTimeout(){}});
 for(const file of ['state.js','validation.js','persistence.js','engine.js','player-view.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),c);
 return {apply:(state,op)=>{c.state=state;c.op=op;return vm.runInContext('applyPlayerOperation(state,op)',c);},validate:state=>{c.state=state;return vm.runInContext('validateTable(state)',c);}};
}
function sharedServer(initial=fixture){
 let data={stateJson:JSON.stringify(initial),revision:1},version=1;
 const listeners=new Set(),stats={retries:0,commits:0,lose:false};
 const snap=()=>{const copy=structuredClone(data);return {exists:()=>true,data:()=>copy,metadata:{fromCache:false,hasPendingWrites:false}};};
 const sdk={doc:()=>({}),getDocFromServer:async()=>snap(),serverTimestamp:()=>123,
  onSnapshot:(_ref,_options,next)=>{listeners.add(next);queueMicrotask(()=>next(snap()));return ()=>listeners.delete(next);},
  runTransaction:async(_db,callback)=>{
   for(let n=0;n<30;n++){
    let readVersion,next;
    const result=await callback({get:async()=>{readVersion=version;return snap();},set:(_ref,value)=>{next=value;}});
    if(readVersion!==version){stats.retries++;continue;}
    if(next){data=next;version++;stats.commits++;for(const notify of listeners)notify(snap());}
    if(stats.lose&&next){stats.lose=false;throw Object.assign(Error('response lost'),{code:'unavailable'});}
    return result;
   }
   throw Error('retry limit');
  }};
 return {sdk,stats,state:()=>JSON.parse(data.stateJson)};
}
function operation(playerId,action,target,inputs){return {id:randomUUID(),at:Date.now(),baseRevision:1,account:{username:'player'+playerId,role:'player',playerId},action,target,inputs,note:'fulfilled',words:[]};}
test('simultaneous openings preserve every result and use unique instance/ledger IDs',async()=>{
 const server=sharedServer(),clients=Array.from({length:8},()=>({store:createCloudStore(server.sdk,{}),game:game()}));
 const ops=clients.map((_,i)=>operation(i+1,'open',i+1));
 await Promise.all(clients.map(c=>c.store.readState()));
 await Promise.all(clients.map((c,i)=>c.store.updateState(ops[i],s=>c.game.apply(s,ops[i]))));
 const state=server.state();assert.equal(state.packs.filter(p=>p.opened).length,8);assert.equal(state.operations.length,8);
 assert.ok(server.stats.retries>0);clients[0].game.validate(state);
});
test('two attempts to open the same pack only apply once',async()=>{
 const server=sharedServer(),a=createCloudStore(server.sdk,{}),b=createCloudStore(server.sdk,{}),g=game();
 const one=operation(2,'open',2),two=operation(2,'open',2);
 const outcomes=await Promise.allSettled([a.updateState(one,s=>g.apply(s,one)),b.updateState(two,s=>g.apply(s,two))]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(server.stats.commits,1);
});
test('a lost commit response can be retried without buying twice',async()=>{
 const server=sharedServer(),store=createCloudStore(server.sdk,{}),g=game(),op=operation(2,'buy');
 server.stats.lose=true;await assert.rejects(()=>store.updateState(op,s=>g.apply(s,op)),{code:'unavailable'});
 const first=server.state();await store.updateState(op,s=>g.apply(s,op));assert.deepEqual(server.state(),first);assert.equal(server.stats.commits,1);
});
test('trade acceptance races transfer cards and credits only once',async()=>{
 const initial=structuredClone(fixture);initial.instances[0].ownerId=2;
 const server=sharedServer(initial),g=game(),a=createCloudStore(server.sdk,{}),b=createCloudStore(server.sdk,{});
 const offer=operation(2,'offer',3,{giveItems:['card:1'],receiveItems:[],giveCredits:5,receiveCredits:10,conditions:{'card:1':JSON.stringify(initial.instances[0])}});
 await a.updateState(offer,s=>g.apply(s,offer));
 const accept=operation(3,'accept',offer.id),again=operation(3,'accept',offer.id);
 const outcomes=await Promise.allSettled([a.updateState(accept,s=>g.apply(s,accept)),b.updateState(again,s=>g.apply(s,again))]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal(server.state().instances[0].ownerId,3);assert.equal(server.state().players[2].credits,fixture.players[2].credits-5);
});
test('using an offered card invalidates acceptance without moving credits',async()=>{
 const initial=structuredClone(fixture);initial.instances[0].ownerId=2;
 const server=sharedServer(initial),g=game(),store=createCloudStore(server.sdk,{});
 const offer=operation(2,'offer',3,{giveItems:['card:1'],receiveItems:[],giveCredits:0,receiveCredits:10,conditions:{'card:1':JSON.stringify(initial.instances[0])}});
 await store.updateState(offer,s=>g.apply(s,offer));
 const use=operation(2,'use',1);await store.updateState(use,s=>g.apply(s,use));
 const before=server.state(),accept=operation(3,'accept',offer.id);
 await assert.rejects(()=>store.updateState(accept,s=>g.apply(s,accept)),/item changed/);assert.deepEqual(server.state(),before);
});
test('disjoint admin edits rebase; conflicting balances are rejected',()=>{
 const base={players:[{id:1,name:'A',credits:100}],ui:{tab:'cards'}};
 const local=structuredClone(base),remote=structuredClone(base);local.players[0].name='New';remote.players[0].credits=90;
 assert.deepEqual(mergeChanges(base,local,remote).players,[{id:1,name:'New',credits:90}]);
 local.players[0].credits=80;assert.throws(()=>mergeChanges(base,local,remote),{code:'table-conflict'});
});
test('observers receive another client commit without changing the dirty client baseline',async()=>{
 const server=sharedServer(),a=createCloudStore(server.sdk,{}),b=createCloudStore(server.sdk,{}),g=game();
 await a.readState();await b.readState();let latest;const stop=b.watchState(value=>{latest=value;},e=>{throw e;});
 const op=operation(2,'open',2);await a.updateState(op,s=>g.apply(s,op));
 assert.equal(b.getRevision(),1);assert.equal(b.adoptSnapshot(latest).packs[1].opened,true);stop();
});
test('invalid trade shapes, duplicate items, negative amounts and invalid economy settings are rejected',()=>{
 const g=game();
 for(const change of [s=>s.trades={},s=>s.config.packCost=-1,s=>s.config.legacyTrigger=2,s=>s.config.weeklyRefill=0.5]){
  const s=structuredClone(fixture);change(s);assert.throws(()=>g.validate(s));
 }
 const s=structuredClone(fixture);s.trades=[{id:'a',from:1,to:2,giveItems:['card:1','card:1'],receiveItems:[],giveCredits:0,receiveCredits:0,createdAt:1,status:'PENDING'}];assert.throws(()=>g.validate(s),/Duplicate/);
});
