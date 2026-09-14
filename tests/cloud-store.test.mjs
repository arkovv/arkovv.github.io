import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore,encodeState} from '../cloud-store.mjs';
function fakeServer(initial=null){
 let data=initial;
 const snapshot=()=>({exists:()=>data!==null,data:()=>structuredClone(data)});
 const sdk={doc:()=>({}),getDocFromServer:async()=>snapshot(),serverTimestamp:()=>123,
   runTransaction:async(_db,fn)=>{let next;await fn({get:async()=>snapshot(),set:(_ref,value)=>{next=value;}});if(next)data=next;}};
 return {sdk,read:()=>data};
}
test('roundtrip complex game data, missing table, and revision increments',async()=>{
 const server=fakeServer(),store=createCloudStore(server.sdk,{});
 await assert.rejects(()=>store.writeState({}),/Load/);
 assert.equal(await store.readState(),null);
 const value={nested:[[1,2],[3]],unicode:'朋友',map:{'1':{amount:7}}};
 await store.writeState(value);
 assert.equal(server.read().revision,1);
 assert.deepEqual(await store.readState(),value);
 await store.writeState(value);
 assert.equal(server.read().revision,2);
});
test('stale admin tab cannot overwrite a newer save',async()=>{
 const server=fakeServer(),a=createCloudStore(server.sdk,{}),b=createCloudStore(server.sdk,{});
 await a.readState();await b.readState();await a.writeState({winner:1});
 await assert.rejects(()=>b.writeState({winner:2}),{code:'table-conflict'});
 assert.deepEqual(JSON.parse(server.read().stateJson),{winner:1});
});
test('oversize UTF-8 state fails before a write',()=>{
 assert.throws(()=>encodeState({text:'友'.repeat(310000)}),{code:'table-too-large'});
});
test('old map format can be migrated and corrupted data is not treated as empty',async()=>{
 const legacy=fakeServer({state:{version:1}}),store=createCloudStore(legacy.sdk,{});
 assert.deepEqual(await store.readState(),{version:1});await store.writeState({version:1});
 assert.equal(typeof legacy.read().stateJson,'string');
 await assert.rejects(()=>createCloudStore(fakeServer({stateJson:'invalid'}).sdk,{}).readState());
 await assert.rejects(()=>createCloudStore(fakeServer({}).sdk,{}).readState());
});
test('failed transaction preserves the expected revision for retry',async()=>{
 const server=fakeServer(),original=server.sdk.runTransaction;
 const store=createCloudStore(server.sdk,{});await store.readState();
 server.sdk.runTransaction=async()=>{throw Error('offline');};
 await assert.rejects(()=>store.writeState({value:1}),/offline/);
 server.sdk.runTransaction=original;await store.writeState({value:2});
 assert.equal(server.read().revision,1);
});
