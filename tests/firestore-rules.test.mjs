// Run against the Firestore emulator started with this repository's firestore.rules.
// Uses synthetic credentials only; never connect this test to a live project.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8788';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw Error('Local emulator only');
const project='demo-friends-cards',database=`projects/${project}/databases/(default)`;
const base=`http://${host}/v1/${database}/documents`;
const hash=createHash('sha256').update('admin\nfixture-password-only').digest('hex');
function token(uid){
 const now=Math.floor(Date.now()/1000);
 return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:now,exp:now+3600,auth_time:now,firebase:{sign_in_provider:'anonymous',identities:{}}})).toString('base64url')+'.';
}
function fields(data){return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:Number.isInteger(v)?{integerValue:String(v)}:{stringValue:v}]));}
async function call(path,method,auth,body){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:body?JSON.stringify(body):undefined});
 return {status:response.status,text:await response.text()};
}
async function expect(path,method,auth,body,status){const response=await call(path,method,auth,body);assert.equal(response.status,status,`${method} ${path}: ${response.text}`);return response;}
async function seed(path,data){await expect('/'+path,'PATCH','owner',{fields:fields(data)},200);}
function commit(path,data,timestampField){return {writes:[{update:{name:`${database}/documents/${path}`,fields:fields(data)},...(timestampField?{updateTransforms:[{fieldPath:timestampField,setToServerValue:'REQUEST_TIME'}]}:{})}]};}
await fetch(`http://${host}/emulator/v1/${database}/documents`,{method:'DELETE'});
await seed('privateAccounts/admin',{passwordHash:hash,enabled:true});
await seed('accountProfiles/admin',{role:'admin'});
await seed('privateAccounts/player',{passwordHash:hash,enabled:true});
await seed('accountProfiles/player',{role:'player',playerId:2});
const a=token('admin-browser'),b=token('stranger'),p=token('player-browser');
await expect('/tables/main','GET',null,null,403);
await expect('/tables/main','GET',b,null,403);
await expect('/privateAccounts/admin','GET',a,null,403);
await expect('/privateAccounts','GET',a,null,403);
await expect(':commit','POST',b,commit('sessions/stranger',{username:'admin',passwordHash:'0'.repeat(64)},'createdAt'),403);
await expect(':commit','POST',b,commit('sessions/admin-browser',{username:'admin',passwordHash:hash},'createdAt'),403);
await expect(':commit','POST',a,commit('sessions/admin-browser',{username:'admin',passwordHash:hash,role:'admin'},'createdAt'),403);
await expect(':commit','POST',a,commit('sessions/admin-browser',{username:'admin',passwordHash:hash},'createdAt'),200);
await expect('/accountProfiles/admin','GET',a,null,200);
await expect('/sessions/admin-browser','GET',b,null,403);
await expect('/sessions','GET',a,null,403);
await expect(':commit','POST',a,commit('tables/main',{stateJson:'{"version":1}',revision:1},'updatedAt'),200);
await expect('/tables/main','GET',a,null,200);
await expect('/tables/main','GET',b,null,403);
await expect('/accountProfiles/admin','PATCH',a,{fields:fields({role:'admin'})},403);
await expect(':commit','POST',p,commit('sessions/player-browser',{username:'player',passwordHash:hash},'createdAt'),200);
await expect('/tables/main','GET',p,null,200);
await expect(':commit','POST',p,commit('tables/main',{stateJson:'{}',revision:2},'updatedAt'),200);
await expect('/privateAccounts/new-player','PATCH',a,{fields:fields({enabled:true,passwordHash:hash})},200);
await expect('/accountProfiles/new-player','PATCH',a,{fields:fields({role:'player',playerId:3})},200);
await expect('/accountProfiles/player','PATCH',p,{fields:fields({role:'admin'})},403);
await expect('/privateAccounts/admin','PATCH',a,{fields:fields({enabled:true,passwordHash:hash})},403);
await expect('/privateAccounts/new-player','PATCH',p,{fields:fields({enabled:true,passwordHash:hash})},403);
await seed('privateAccounts/admin',{passwordHash:hash,enabled:false});
await expect('/tables/main','GET',a,null,403);
await seed('privateAccounts/admin',{passwordHash:hash,enabled:true});
await expect('/sessions/admin-browser','DELETE',a,null,200);
await expect('/tables/main','GET',a,null,403);
// An expired session cannot use the table even when its credential still matches.
await expect('/sessions/admin-browser','PATCH','owner',{fields:{...fields({username:'admin',passwordHash:hash}),createdAt:{timestampValue:'2020-01-01T00:00:00Z'}}},200);
await expect('/tables/main','GET',a,null,403);
console.log('PASS: strangers and invalid sessions denied; approved friends can save game state; only admins can provision player accounts; escalation and credential reads denied.');
