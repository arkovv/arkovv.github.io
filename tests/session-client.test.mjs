import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSessionClient} from '../session-client.mjs';
function fixture(){
 let session=null;
 const sdk={doc:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>({toMillis:()=>Date.now()}),
   setDoc:async(path,value)=>{assert.equal(path,'sessions/browser-1');session=value;},
   getDocFromServer:async path=>({exists:()=>path.startsWith('accountProfiles/')||!!session,data:()=>path.startsWith('accountProfiles/')?{role:'admin'}:session}),
   deleteDoc:async path=>{assert.equal(path,'sessions/browser-1');session=null;}};
 return {sdk,get:()=>session,set:value=>{session=value;}};
}
test('login sends only hash, username and timestamp to this Firebase UID',async()=>{
 const f=fixture(),client=createSessionClient(f.sdk,{},'browser-1');
 const profile=await client.login('  ADMIN  ','fixture-password-only');
 assert.deepEqual(profile,{username:'admin',role:'admin'});
 assert.deepEqual(Object.keys(f.get()).sort(),['createdAt','passwordHash','username']);
 assert.equal(f.get().passwordHash,createHash('sha256').update('admin\nfixture-password-only').digest('hex'));
 await client.logout();assert.equal(await client.currentSession(),null);
});
test('invalid username and rule rejection do not approve login',async()=>{
 const f=fixture(),client=createSessionClient(f.sdk,{},'browser-1');
 await assert.rejects(()=>client.login('../admin','x'));
 f.sdk.setDoc=async()=>{throw Object.assign(Error('denied'),{code:'permission-denied'});};
 await assert.rejects(()=>client.login('admin','x'),{code:'permission-denied'});
 assert.equal(f.get(),null);
});
test('expired sessions and revoked profile access do not restore a role',async()=>{
 const f=fixture(),client=createSessionClient(f.sdk,{},'browser-1');
 f.set({username:'admin',createdAt:{toMillis:()=>0}});
 assert.equal(await client.currentSession(),null);
 f.set({username:'admin',createdAt:{toMillis:()=>Date.now()}});
 const read=f.sdk.getDocFromServer;
 f.sdk.getDocFromServer=async path=>{if(path.startsWith('accountProfiles/'))throw Error('revoked');return read(path);};
 await assert.rejects(()=>client.currentSession(),/revoked/);
});
