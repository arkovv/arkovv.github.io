const fs=require('node:fs'),path=require('node:path');
// Exercise the real store with a shared SDK transport and transaction retries.
module.exports=async function installCloudFixture(page,initial,profile={username:'arkov',role:'admin'},shared){
 const state=shared||{value:structuredClone(initial),revision:1,fail:false,delay:0,commits:0,lostResponse:false};
 let signedIn=false;
 await page.exposeFunction('__testLogin',(_username,password)=>{
   if(password!=='fixture-password-only')throw Error('Incorrect username or password.');
   signedIn=true;state.expired=false;return profile;
 });
 await page.exposeFunction('__testSession',()=>signedIn&&!state.expired?profile:null);
 await page.exposeFunction('__testLogout',()=>{signedIn=false;});
 await page.exposeFunction('__testRead',()=>({stateJson:JSON.stringify(state.value),revision:state.revision}));
 await page.exposeFunction('__testCommit',async(expected,value)=>{
   if(state.fail)return {error:'unavailable',message:'test outage'};
   if(state.expired)return {error:'permission-denied',message:'expired'};
   if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));
   if(state.revision!==expected)return {retry:true};
   state.value=JSON.parse(value.stateJson);state.revision=value.revision;state.commits++;
   if(state.lostResponse){state.lostResponse=false;return {error:'unavailable',message:'lost commit response'};}
   return {ok:true};
 });
 await page.route('**/firebase-client.js',route=>route.fulfill({contentType:'application/javascript',body:
   fs.readFileSync(path.join(__dirname,'../firebase-client.js'),'utf8')+
   `
   let fixtureCloud;
   connectFirebase=async()=>{
    if(fixtureCloud)return fixtureCloud;
    const {createCloudStore}=await import('./cloud-store.mjs');
    const snapshot=data=>({exists:()=>true,data:()=>structuredClone(data),metadata:{fromCache:false,hasPendingWrites:false}});
    const sdk={doc:()=>({}),serverTimestamp:()=>123,getDocFromServer:async()=>snapshot(await window.__testRead()),
      runTransaction:async(_db,fn)=>{
        for(let attempt=0;attempt<20;attempt++){
          let expected,next;
          const result=await fn({get:async()=>{const data=await window.__testRead();expected=data.revision;return snapshot(data);},set:(_ref,data)=>{next=data;}});
          if(!next)return result;
          const response=await window.__testCommit(expected,next);
          if(response.error)throw Object.assign(Error(response.message),{code:response.error});
          if(!response.retry)return result;
        }
        throw Object.assign(Error('Too much contention'),{code:'aborted'});
      },
      onSnapshot:(_ref,_options,next,error)=>{
        let last=-1,closed=false;
        const poll=async()=>{try{const data=await window.__testRead();if(!closed&&data.revision!==last){last=data.revision;next(snapshot(data));}}catch(e){if(!closed)error(e);}};
        const timer=setInterval(poll,50);poll();return ()=>{closed=true;clearInterval(timer);};
      }
    };
    fixtureCloud={...createCloudStore(sdk,{}),currentSession:()=>window.__testSession(),login:(u,p)=>window.__testLogin(u,p),logout:()=>window.__testLogout()};
    return fixtureCloud;
   };`}));
 return state;
};
