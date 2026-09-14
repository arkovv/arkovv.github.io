const fs=require('node:fs'),path=require('node:path');
// Replace only the network boundary in tests. Production has no adapter override.
module.exports=async function installCloudFixture(page,initial){
 const state={value:structuredClone(initial),fail:false,delay:0,profile:null};
 await page.exposeFunction('__testLogin',(_username,password)=>{
   if(password!=='fixture-password-only')throw Error('Incorrect username or password.');
   state.profile={username:'arkov',role:'admin'};return state.profile;
 });
 await page.exposeFunction('__testSession',()=>state.profile);
 await page.exposeFunction('__testLogout',()=>{state.profile=null;});
 await page.exposeFunction('__testRead',()=>structuredClone(state.value));
 await page.exposeFunction('__testWrite',async value=>{
   if(state.fail)throw Error('test outage');
   if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));
   state.value=structuredClone(value);
 });
 await page.route('**/firebase-client.js',route=>route.fulfill({contentType:'application/javascript',body:
   fs.readFileSync(path.join(__dirname,'../firebase-client.js'),'utf8')+
   '\nconnectFirebase=async()=>({currentSession:()=>window.__testSession(),login:(u,p)=>window.__testLogin(u,p),logout:()=>window.__testLogout(),readState:()=>window.__testRead(),writeState:state=>window.__testWrite(state)});'}));
 return state;
};
